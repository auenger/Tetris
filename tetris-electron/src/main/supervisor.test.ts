import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from './supervisor';
import { validateDecision } from './supervisor-runtime';
import { SuperAgentTasks } from './super-agent-tasks';
import { TaskNotificationStore } from './task-notification-store';

test('supervisor can answer during worker execution and does not replay completed dispatch on reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-test-'));
  let calls = 0;
  const host = {
    context: async () => ({ tiles: [] }),
    tasks: () => calls ? [{ id: 'worker', status: 'running', provider: 'claude' }] : [],
    decide: async (input: any) => input.incoming.text === '检查首页'
      ? validateDecision({ reply: '安排检查', calls: [{ tool: 'create_task', title: '首页检查', instruction: '只检查，不修改', provider: 'claude' }] }, [])
      : validateDecision({ reply: 'Claude Code 正在检查首页。', calls: [] }, ['worker']),
    execute: async () => { calls++; return { taskId: 'worker', text: '已派发' }; },
  };
  try {
    const file = join(dir, 'state.json'); const manager = new Supervisor(file, host); const conversation = manager.create();
    manager.send(conversation.id, '检查首页', 'claude', false);
    manager.send(conversation.id, '谁在做？', 'claude', false);
    for (let n = 0; n < 50 && manager.snapshot(conversation.id).busy; n++) await new Promise(r => setTimeout(r, 5));
    const state = manager.snapshot(conversation.id);
    expect(calls).toBe(1);
    expect(state.messages.at(-1)?.text).toBe('Claude Code 正在检查首页。');
    expect(host.tasks()[0]?.status).toBe('running');
    manager.close();
    const restored = new Supervisor(file, host);
    expect(restored.snapshot(conversation.id).messages).toEqual(state.messages);
    expect(calls).toBe(1); restored.close();
    expect(() => validateDecision({ reply: '停止', calls: [{ tool: 'cancel_task', taskId: 'other-workspace' }] }, ['worker'])).toThrow();
    expect(() => validateDecision({ reply: '下一步', calls: [{ tool: 'create_task', title: '新任务', instruction: '修改', provider: 'claude' }] }, [], true)).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('conversation isolation, event dedupe, archive and native session mapping survive reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-conversations-'));
  const contexts: string[] = [];
  const host = { context: async (id: string) => { contexts.push(id); return {}; }, tasks: () => [],
    execute: async () => { throw new Error('Unexpected dispatch'); },
    run: async (input: any, _execute: unknown, onSession: (id: string) => void) => { const id = input.runtimeSessionId || `native-${input.conversationId}`; onSession(id); return { reply: input.incoming.text, sessionId: id }; },
  };
  try {
    const file = join(dir, 'state.json'), supervisor = new Supervisor(file, host), a = supervisor.create(), b = supervisor.create();
    supervisor.send(a.id, 'first', 'claude', false); supervisor.send(b.id, 'second', 'codex', false);
    for (let n = 0; n < 100 && supervisor.list().some(c => supervisor.snapshot(c.id).busy); n++) await new Promise(r => setTimeout(r, 2));
    supervisor.archive(a.id);
    const eventId = supervisor.completed(a.id, 'task-a', 'done', 'event-1');
    expect(supervisor.completed(a.id, 'task-a', 'done', 'event-1')).toBe(eventId);
    for (let n = 0; n < 100 && supervisor.snapshot(a.id).busy; n++) await new Promise(r => setTimeout(r, 2));
    expect(supervisor.snapshot(b.id).messages.map(m => m.text)).toEqual(['second', 'second']);
    expect(supervisor.list()).toHaveLength(1);
    expect(supervisor.list(true).find(c => c.id === a.id)?.unread).toBe(1);
    expect(supervisor.list(true).find(c => c.id === a.id)?.runtimeSessionId).toBe(`native-${a.id}`);
    expect(() => supervisor.send(a.id, 'new work', 'claude', false)).toThrow('归档');
    supervisor.close(); const restored = new Supervisor(file, host);
    expect(restored.snapshot(a.id).messages).toEqual(supervisor.snapshot(a.id).messages);
    expect(contexts).toContain(a.id); expect(contexts).toContain(b.id); restored.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('restoring an archived conversation preserves its session, history, unread reports and task origin across reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-restore-'));
  const resumedSessions: Array<string | undefined> = [];
  const host = { context: async () => ({}), tasks: () => [], execute: async () => ({ text: '' }),
    run: async (input: any) => { resumedSessions.push(input.runtimeSessionId); return { reply: input.incoming.text, sessionId: input.runtimeSessionId || 'original-native-session' }; } };
  const file = join(dir, 'conversations.json');
  let manager = new Supervisor(file, host);
  try {
    const conversation = manager.create();
    const tasks = new SuperAgentTasks(join(dir, 'tasks.json'));
    const taskId = tasks.register('worker', '/project', 'Original task', { originConversationId: conversation.id });
    manager.send(conversation.id, 'Original message', 'claude', false, [taskId]);
    for (let n = 0; n < 100 && manager.snapshot(conversation.id).busy; n++) await new Promise(r => setTimeout(r, 2));
    manager.archive(conversation.id);
    manager.completed(conversation.id, taskId, 'Result while archived', 'durable-event');
    for (let n = 0; n < 100 && manager.snapshot(conversation.id).busy; n++) await new Promise(r => setTimeout(r, 2));
    const archived = manager.list(true)[0]!, messages = manager.snapshot(conversation.id).messages;
    expect(manager.list()).toHaveLength(0); expect(archived.archivedAt).toBeDefined();
    manager.close(); manager = new Supervisor(file, host);
    const restored = manager.restore(conversation.id);
    expect(restored).toMatchObject({ id: conversation.id, createdAt: conversation.createdAt, updatedAt: archived.updatedAt, runtimeSessionId: 'original-native-session', unread: 1 });
    expect(restored.archivedAt).toBeUndefined(); expect(manager.list()).toHaveLength(1);
    expect(manager.snapshot(conversation.id).messages).toEqual(messages);
    expect(manager.restore(conversation.id)).toEqual(restored);
    expect(tasks.get(taskId)?.originConversationId).toBe(conversation.id);
    manager.send(conversation.id, 'Continue this session', 'claude', false, [taskId]);
    for (let n = 0; n < 100 && manager.snapshot(conversation.id).busy; n++) await new Promise(r => setTimeout(r, 2));
    expect(resumedSessions).toEqual([undefined, 'original-native-session', 'original-native-session']);
    expect(manager.list(true)).toHaveLength(1);
    expect(manager.snapshot(conversation.id).messages.at(-1)?.taskIds).toEqual([taskId]);
    manager.close(); manager = new Supervisor(file, host);
    expect(manager.list()[0]?.archivedAt).toBeUndefined(); expect(manager.list()[0]?.runtimeSessionId).toBe('original-native-session');
    expect(() => manager.restore('missing')).toThrow('对话不存在');
  } finally { manager.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('v1 migration backs up history and does not replay interrupted user tools', async () => {
  const { writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-migration-'));
  try {
    const file = join(dir, 'state.json');
    const old = { version: 1, conversations: [{ cwd: '/project', messages: [{ id: 'old', role: 'user', text: 'edit files', state: 'pending', taskIds: [], createdAt: '2026-11-04' }] }] };
    writeFileSync(file, JSON.stringify(old));
    let calls = 0;
    const host = { context: async () => ({}), tasks: () => [], execute: async () => { calls++; return { text: 'bad' }; }, decide: async () => ({ reply: '', calls: [] }) };
    const first = new Supervisor(file, host); expect(existsSync(file + '.v1.bak')).toBe(true);
    const id = first.list()[0]!.id; expect(first.snapshot(id).messages[0]?.state).toBe('failed'); first.close();
    const next = new Supervisor(file, host); expect(next.list()[0]?.id).toBe(id); expect(calls).toBe(0);
    expect(JSON.parse(readFileSync(file + '.v1.bak', 'utf8'))).toEqual(old); next.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('human messages are serviced before queued completion summaries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-priority-'));
  let release!: () => void; const blocked = new Promise<void>(resolve => release = resolve); const order: string[] = [];
  try {
    const manager = new Supervisor(join(dir, 's.json'), { context: async () => ({}), tasks: () => [], execute: async () => ({ text: '' }), run: async input => {
      order.push(input.incoming.text); if (input.incoming.text === 'first') await blocked;
      return { reply: 'ok', sessionId: 'native' };
    } });
    const { id } = manager.create(); manager.send(id, 'first', 'claude', false);
    await new Promise(r => setTimeout(r, 1));
    manager.completed(id, 'task', 'event', 'evt'); manager.send(id, 'human', 'claude', false); release();
    for (let n = 0; n < 100 && manager.snapshot(id).busy; n++) await new Promise(r => setTimeout(r, 2));
    expect(order).toEqual(['first', 'human', 'event']); manager.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('summary failure preserves raw task result, archived origin inbox and notifications without contaminating current conversation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-summary-fault-'));
  try {
    const tasks = new SuperAgentTasks(join(dir, 'tasks.json'));
    const notices = new TaskNotificationStore(join(dir, 'notices.json'));
    let attempts = 0;
    const host = { context: async () => ({}), tasks: () => [], execute: async () => { throw new Error('Unexpected task mutation'); },
      run: async () => { attempts++; throw new Error('Supervisor temporarily unavailable'); } };
    const path = join(dir, 'conversations.json'), manager = new Supervisor(path, host);
    const origin = manager.create(), current = manager.create(); manager.archive(origin.id);
    const taskId = tasks.register('worker', '/project', 'Report', { originConversationId: origin.id });
    const runId = tasks.start('worker', '/project', 'Inspect', {});
    tasks.applyReport({ taskId, runId, status: 'completed', summary: 'Durable raw result' });
    const event = tasks.timeline(taskId).find(e => e.type === 'run.ready_for_review')!;
    notices.receive(tasks.get(taskId)!, event);
    manager.completed(origin.id, taskId, 'Durable raw result', `${runId}:result`);
    for (let n = 0; n < 100 && manager.snapshot(origin.id).busy; n++) await new Promise(r => setTimeout(r, 2));
    expect(manager.snapshot(origin.id).messages.find(m => m.role === 'event')?.text).toBe('Durable raw result');
    expect(manager.snapshot(origin.id).messages.at(-1)?.state).toBe('failed');
    expect(manager.snapshot(current.id).messages).toHaveLength(0);
    expect(manager.list(true).find(c => c.id === origin.id)?.unread).toBe(1);
    expect(tasks.get(taskId)?.runs.at(-1)?.report?.summary).toBe('Durable raw result');
    expect(notices.list()[0]?.readAt).toBeUndefined(); manager.close();
    const restored = new Supervisor(path, host); restored.recoverCompletions();
    restored.completed(origin.id, taskId, 'duplicate', `${runId}:result`);
    expect(attempts).toBe(1); expect(restored.snapshot(origin.id).messages.filter(m => m.role === 'event')).toHaveLength(1); restored.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('successful worker summaries are recorded in the task timeline exactly once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-summary-event-'));
  try {
    const summaries: Array<{ conversationId: string; text: string; eventId: string }> = [];
    const manager = new Supervisor(join(dir, 'conversations.json'), {
      context: async () => ({}), tasks: () => [], execute: async () => ({ text: '' }),
      run: async () => ({ sessionId: 'native', reply: '结果已整理' }),
      recordSummary: (conversationId, event, reply) => summaries.push({ conversationId, eventId: event.id, text: reply.text }),
    });
    const { id } = manager.create(); const eventId = manager.completed(id, 'task', 'raw', 'stable-result');
    for (let n = 0; n < 100 && manager.snapshot(id).busy; n++) await new Promise(r => setTimeout(r, 2));
    manager.completed(id, 'task', 'raw', 'stable-result');
    expect(summaries).toEqual([{ conversationId: id, eventId: eventId!, text: '结果已整理' }]); manager.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
