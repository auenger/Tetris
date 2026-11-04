import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Executor, SupervisorCall, SupervisorMessage, SupervisorSnapshot } from '../../packages/shared/src/supervisor-types';
import type { SupervisorDecision } from './supervisor-runtime';

type Conversation = { cwd: string; messages: SupervisorMessage[] };
type Host = {
  context(cwd: string): Promise<unknown>;
  tasks(cwd: string): Array<{ id: string; [key: string]: unknown }>;
  execute(cwd: string, call: SupervisorCall, messageId: string, isolated: boolean): Promise<{ taskId: string; text: string }>;
  decide(input: unknown, ids: string[], eventOnly: boolean): Promise<SupervisorDecision>;
};
/** Independent inbox: worker execution never occupies the supervisor turn. */
export class Supervisor {
  private conversations: Conversation[];
  private queues = new Map<string, Array<{ message: SupervisorMessage; provider: Executor; isolated: boolean }>>();
  private busy = new Set<string>();
  private closed = false;
  constructor(private path: string, private host: Host) {
    try { this.conversations = JSON.parse(readFileSync(path, 'utf8')).conversations; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; this.conversations = []; }
    for (const conversation of this.conversations) for (const message of conversation.messages) if (message.state === 'pending') {
      message.state = 'failed'; message.text += '\n（应用关闭时未确认完成，未自动重放。）';
    }
    this.save();
  }
  snapshot(cwd: string): SupervisorSnapshot {
    return { cwd, busy: this.busy.has(cwd), messages: structuredClone(this.conversations.find(c => c.cwd === cwd)?.messages || []) };
  }
  private conversation(cwd: string) {
    let conversation = this.conversations.find(c => c.cwd === cwd);
    if (!conversation) { conversation = { cwd, messages: [] }; this.conversations.push(conversation); }
    return conversation;
  }
  send(cwd: string, text: string, provider: Executor, isolated: boolean, taskIds: string[] = [], event = false) {
    if (this.closed) throw new Error('主管已关闭');
    if (!text.trim()) throw new Error('消息不能为空');
    const message: SupervisorMessage = { id: randomUUID(), role: event ? 'event' : 'user', text: text.trim(), state: 'pending', createdAt: new Date().toISOString(), taskIds };
    this.conversation(cwd).messages.push(message); this.save();
    const queue = this.queues.get(cwd) || [];
    queue.push({ message, provider, isolated }); this.queues.set(cwd, queue);
    void this.pump(cwd);
    return message.id;
  }
  completed(cwd: string, taskId: string, summary: string) {
    if (!this.closed) this.send(cwd, summary, 'claude', false, [taskId], true);
  }
  private async pump(cwd: string) {
    if (this.busy.has(cwd) || this.closed) return;
    this.busy.add(cwd);
    try {
      while (this.queues.get(cwd)?.length && !this.closed) {
        const { message, provider, isolated } = this.queues.get(cwd)!.shift()!;
        const messages = this.conversation(cwd).messages;
        let reply: SupervisorMessage | undefined;
        try {
          const tasks = this.host.tasks(cwd);
          const decision = await this.host.decide({ cwd, preferredExecutor: provider,
            context: await this.host.context(cwd), tasks,
            history: messages.filter(m => m.id !== message.id && m.state === 'done').slice(-30),
            incoming: message, eventOnly: message.role === 'event' }, tasks.map(t => t.id), message.role === 'event');
          if (this.closed) break;
          reply = { id: randomUUID(), role: 'assistant', text: decision.reply, state: 'pending', taskIds: [...message.taskIds], createdAt: new Date().toISOString() };
          messages.push(reply); this.save();
          for (const call of decision.calls) {
            if (this.closed) break;
            const result = await this.host.execute(cwd, call, reply.id, isolated);
            reply.taskIds.push(result.taskId);
            reply.text += `\n\n${result.text}`;
            this.save(); // Do not replay confirmed operations after a crash.
          }
          reply.state = 'done'; message.state = 'done';
        } catch (error) {
          message.state = 'failed';
          const text = error instanceof Error ? error.message : String(error);
          if (reply) { reply.state = 'failed'; reply.text += `\n\n操作未全部完成：${text}`; }
          else messages.push({ id: randomUUID(), role: 'assistant', text, state: 'failed', taskIds: [], createdAt: new Date().toISOString() });
        }
        this.save();
      }
    } finally { this.busy.delete(cwd); }
  }
  close() { this.closed = true; }
  private save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, JSON.stringify({ version: 1, conversations: this.conversations }), { mode: 0o600 });
    renameSync(temp, this.path);
  }
}
