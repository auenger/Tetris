import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Executor, SupervisorCall, SupervisorMessage, SupervisorSnapshot, SupervisorConversation, SupervisorToolCall } from '../../packages/shared/src/supervisor-types';
import type { SupervisorDecision, SupervisorTurnInput, SupervisorTurnResult } from './supervisor-runtime';

type Conversation = SupervisorConversation & { messages: SupervisorMessage[]; toolCalls?: SupervisorToolCall[] };
export type SupervisorExecutionMeta = { conversationId: string; userMessageId: string; userText: string; operationId: string; selectedTaskIds: string[] };
export type SupervisorToolResult = { taskId?: string; text: string };
type Host = {
  context(conversationId: string): Promise<unknown>;
  tasks(conversationId: string): Array<{ id: string; [key: string]: unknown }>;
  execute(conversationId: string, call: SupervisorCall, messageId: string, isolated: boolean, meta: SupervisorExecutionMeta): Promise<SupervisorToolResult>;
  recordSummary?(conversationId: string, event: SupervisorMessage, reply: SupervisorMessage): void;
  run?(input: SupervisorTurnInput, execute: (call: SupervisorCall) => Promise<SupervisorToolResult>, onSession: (sessionId: string) => void, onTool: (call: SupervisorToolCall) => void, onText: (text: string) => void): Promise<SupervisorTurnResult>;
  changed?(snapshot: SupervisorSnapshot): void;
  decide?(input: unknown, ids: string[], eventOnly: boolean): Promise<SupervisorDecision>;
};
type Queued = { message: SupervisorMessage; provider: Executor; isolated: boolean };

/** Conversation and worker lifetimes are independent. State is saved before any model/tool call. */
export class Supervisor {
  private conversations: Conversation[] = [];
  private queues = new Map<string, Queued[]>();
  private busy = new Set<string>();
  private closed = false;
  constructor(private path: string, private host: Host) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(data.conversations)) throw new Error('Invalid conversation store');
      if (data.version !== 2) {
        if (!existsSync(`${path}.v1.bak`)) copyFileSync(path, `${path}.v1.bak`);
        this.conversations = data.conversations.map((old: { cwd: string; messages: SupervisorMessage[] }) => ({
          id: randomUUID(), title: old.cwd.split('/').filter(Boolean).at(-1) || '历史对话', legacyCwd: old.cwd,
          createdAt: old.messages[0]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), unread: 0, messages: old.messages,
        }));
      } else this.conversations = data.conversations;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const conversation of this.conversations) {
      for (const call of conversation.toolCalls || []) if (call.state === 'running') {
        call.state = 'interrupted'; call.endedAt = new Date().toISOString(); call.error = '应用关闭时工具结果尚未确认，未自动重放。';
      }
      for (const message of conversation.messages) if (message.state === 'pending') {
        // A completion can be summarized after restart, but never automatically replay user tools.
        if (message.role !== 'event') { message.state = 'failed'; message.failureDetail = '应用关闭时未确认完成，未自动重放。'; }
      }
    }
    this.save();
  }
  create(title = '新对话'): SupervisorConversation {
    const now = new Date().toISOString();
    const conversation: Conversation = { id: randomUUID(), title, createdAt: now, updatedAt: now, unread: 0, messages: [] };
    this.conversations.push(conversation); this.save(conversation.id); return this.summary(conversation);
  }
  list(includeArchived = false) { return this.conversations.filter(c => includeArchived || !c.archivedAt).map(c => this.summary(c)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  archive(id: string) { const conversation = this.conversation(id); if (conversation.archivedAt) return; conversation.archivedAt = new Date().toISOString(); this.save(conversation.id); }
  restore(id: string): SupervisorConversation {
    const conversation = this.conversation(id);
    if (conversation.archivedAt) { delete conversation.archivedAt; this.save(conversation.id); }
    return this.summary(conversation);
  }
  markRead(id: string) { const conversation = this.conversation(id); if (!conversation.unread) return; conversation.unread = 0; this.save(conversation.id); }
  private summary({ messages: _messages, toolCalls: _toolCalls, ...summary }: Conversation) { return structuredClone(summary); }
  toolCalls(id: string) { return structuredClone(this.conversation(id).toolCalls || []); }
  private conversation(id: string): Conversation {
    const conversation = this.conversations.find(c => c.id === id || c.legacyCwd === id);
    if (!conversation) throw new Error('对话不存在，请新建或选择历史对话');
    return conversation;
  }
  snapshot(id: string): SupervisorSnapshot {
    const conversation = this.conversation(id);
    return { conversationId: conversation.id, cwd: conversation.legacyCwd || '', busy: this.busy.has(conversation.id), revision: conversation.revision || 0, messages: structuredClone(conversation.messages) };
  }
  /** Call after the host is ready; only pending completion summaries can be recovered. */
  recoverCompletions() {
    for (const conversation of this.conversations) for (const message of conversation.messages) if (message.role === 'event' && message.state === 'pending') this.enqueue(conversation.id, { message, provider: 'claude', isolated: false });
  }
  send(id: string, text: string, provider: Executor, isolated: boolean, taskIds: string[] = [], event = false, eventId?: string) {
    if (this.closed) throw new Error('Tetris Agent 已关闭');
    if (!text.trim()) throw new Error('消息不能为空');
    const conversation = this.conversation(id);
    if (conversation.archivedAt && !event) throw new Error('对话已归档，请先恢复对话');
    const existing = eventId && conversation.messages.find(m => m.eventId === eventId);
    if (existing) return existing.id;
    const message: SupervisorMessage = { id: randomUUID(), role: event ? 'event' : 'user', text, state: 'pending', createdAt: new Date().toISOString(), taskIds, ...(eventId ? { eventId } : {}) };
    conversation.messages.push(message); conversation.updatedAt = message.createdAt;
    if (event) conversation.unread++;
    else if (conversation.title === '新对话') conversation.title = text.trim().slice(0, 40);
    this.save(conversation.id); this.enqueue(conversation.id, { message, provider, isolated }); return message.id;
  }
  private enqueue(id: string, queued: Queued) {
    const queue = this.queues.get(id) || [];
    if (queue.some(item => item.message.id === queued.message.id)) return;
    if (queued.message.role === 'user') {
      const eventIndex = queue.findIndex(item => item.message.role === 'event');
      if (eventIndex >= 0) queue.splice(eventIndex, 0, queued); else queue.push(queued);
    } else queue.push(queued);
    this.queues.set(id, queue); void this.pump(id);
  }
  completed(id: string, taskId: string, summary: string, eventId?: string) { if (!this.closed) return this.send(id, summary, 'claude', false, [taskId], true, eventId); }
  private async pump(id: string) {
    if (this.busy.has(id) || this.closed) return;
    this.busy.add(id);
    this.save(id);
    try {
      while (this.queues.get(id)?.length && !this.closed) {
        const { message, provider, isolated } = this.queues.get(id)!.shift()!;
        const conversation = this.conversation(id), messages = conversation.messages;
        let reply: SupervisorMessage | undefined;
        let pendingText: string | undefined, streamTimer: ReturnType<typeof setTimeout> | undefined;
        let receivedText = false, acceptingText = true;
        const flushText = () => {
          clearTimeout(streamTimer); streamTimer = undefined;
          if (pendingText === undefined || !reply || !acceptingText || this.closed) return;
          reply.text = pendingText; pendingText = undefined; this.save(id);
        };
        const onText = (text: string) => {
          if (!acceptingText || this.closed || !reply || reply.state !== 'pending') return;
          receivedText = true; pendingText = text;
          // Publish and persist complete snapshots at most once per 80 ms, never per token.
          if (!streamTimer) streamTimer = setTimeout(flushText, 80);
        };
        try {
          const tasks = this.host.tasks(id), context = await this.host.context(id);
          reply = { id: randomUUID(), role: 'assistant', sourceMessageId: message.id, text: '', state: 'pending', taskIds: [...message.taskIds], createdAt: new Date().toISOString() };
          messages.push(reply); this.save(id);
          let operationIndex = 0;
          const confirmed: string[] = [];
          const execute = async (call: SupervisorCall) => {
            if (this.closed) throw new Error('Tetris Agent 已关闭');
            if (message.role === 'event' && call.tool !== 'get_task_status') throw new Error('任务回报不能自动派发或作决定');
            const result = await this.host.execute(id, call, reply!.id, isolated, { conversationId: id, userMessageId: message.id, userText: message.text, operationId: `${message.id}:${operationIndex++}`, selectedTaskIds: message.taskIds });
            if (result.taskId && !reply!.taskIds.includes(result.taskId)) reply!.taskIds.push(result.taskId);
            confirmed.push(result.text); if (!receivedText) reply!.text = confirmed.join('\n\n'); this.save(id); return result;
          };
          const input: SupervisorTurnInput = { conversationId: id, ...(conversation.runtimeSessionId ? { runtimeSessionId: conversation.runtimeSessionId } : {}), preferredExecutor: provider, context, tasks, history: conversation.runtimeSessionId ? [] : messages.filter(m => m.id !== message.id && m.state === 'done'), incoming: message, selectedTaskIds: message.taskIds, eventOnly: message.role === 'event' };
          const onTool = (call: SupervisorToolCall) => {
            if (call.conversationId !== id || call.sourceMessageId !== message.id) throw new Error('工具记录的对话来源不匹配');
            const calls = conversation.toolCalls ||= [], index = calls.findIndex(item => item.id === call.id);
            if (index < 0) calls.push(structuredClone(call)); else calls[index] = structuredClone(call);
            this.save(id);
          };
          if (this.host.run) {
            const result = await this.host.run(input, execute, sessionId => { conversation.runtimeSessionId = sessionId; this.save(id); }, onTool, onText);
            flushText();
            reply.text = result.reply || reply.text || confirmed.join('\n\n'); conversation.runtimeSessionId = result.sessionId;
          } else if (this.host.decide) {
            const decision = await this.host.decide(input, tasks.map(t => t.id), input.eventOnly);
            for (const call of decision.calls) await execute(call);
            reply.text = [decision.reply, ...confirmed].filter(Boolean).join('\n\n');
          } else throw new Error('主管 runtime 尚未配置');
          if (this.closed) break;
          reply.state = 'done'; message.state = 'done'; conversation.updatedAt = new Date().toISOString();
          if (message.role === 'event') this.host.recordSummary?.(id, message, reply);
        } catch (error) {
          flushText();
          message.state = 'failed'; const text = error instanceof Error ? error.message : String(error); message.failureDetail = text;
          if (reply) { reply.state = 'failed'; reply.failureDetail = text; }
          else messages.push({ id: randomUUID(), role: 'assistant', text, state: 'failed', taskIds: [], createdAt: new Date().toISOString() });
        } finally { acceptingText = false; clearTimeout(streamTimer); }
        this.save(id);
      }
    } finally { this.busy.delete(id); this.save(id); }
  }
  close() { this.closed = true; }
  private save(id?: string) {
    if (id) { const conversation = this.conversation(id); conversation.revision = (conversation.revision || 0) + 1; }
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`; writeFileSync(temp, JSON.stringify({ version: 2, conversations: this.conversations }), { mode: 0o600 }); renameSync(temp, this.path);
    if (id) this.host.changed?.(this.snapshot(id));
  }
}
