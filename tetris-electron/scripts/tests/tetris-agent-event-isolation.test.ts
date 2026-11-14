import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../../src/main/supervisor';
import { SuperAgentTasks } from '../../src/main/super-agent-tasks';
import { TaskNotificationStore } from '../../src/main/task-notification-store';

test('failed supervisor summary leaves original report, conversation event and unread notice durable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-event-isolation-'));
  try {
    const taskPath = join(dir, 'tasks.json'), noticePath = join(dir, 'notices.json'), conversationPath = join(dir, 'conversations.json');
    const tasks = new SuperAgentTasks(taskPath), notices = new TaskNotificationStore(noticePath);
    const host = { context: async () => ({}), tasks: () => tasks.list(), execute: async () => { throw Error('Event must not dispatch'); },
      run: async () => { throw Error('Injected model unavailable'); } };
    const supervisor = new Supervisor(conversationPath, host), a = supervisor.create(), b = supervisor.create();
    const taskId = tasks.register('worker-a', '/project-a', 'Original task', { originConversationId: a.id });
    const runId = tasks.start('worker-a', '/project-a', 'Read only', {}), source = join(dir, 'report.md');
    writeFileSync(source, '# Original report\n\nVerified token 7851.\n');
    tasks.appendOutput('worker-a', 'Verified token 7851.');
    const artifact = tasks.attachArtifact(runId, source);
    tasks.applyReport({ taskId, runId, status: 'completed', summary: 'Verified token 7851.' });
    const task = tasks.get(taskId)!, event = tasks.timeline(taskId).find(e => e.type === 'run.ready_for_review')!;
    const notice = notices.receive(task, event)!;
    supervisor.archive(a.id);
    supervisor.completed(a.id, taskId, 'Original result: Verified token 7851.', `${runId}:result`);
    for (let i = 0; i < 100 && supervisor.snapshot(a.id).busy; i++) await new Promise(r => setTimeout(r, 2));
    expect(supervisor.snapshot(a.id).messages.at(-1)?.state).toBe('failed');
    expect(supervisor.snapshot(a.id).messages.find(m => m.role === 'event')?.text).toContain('Verified token 7851');
    expect(supervisor.snapshot(b.id).messages).toEqual([]);
    supervisor.close();
    const restored = new Supervisor(conversationPath, host);
    const restoredTask = new SuperAgentTasks(taskPath).get(taskId)!;
    expect(restoredTask.runs[0]?.status).toBe('ready_for_review');
    expect(restoredTask.runs[0]?.report?.summary).toBe('Verified token 7851.');
    expect(readFileSync(artifact.path, 'utf8')).toContain('Original report');
    expect(new TaskNotificationStore(noticePath).list()).toEqual([notice]);
    expect(notice.readAt).toBeUndefined(); expect(notice.conversationId).toBe(a.id);
    expect(restored.list(true).find(c => c.id === a.id)?.unread).toBe(1);
    expect(restored.snapshot(b.id).messages).toEqual([]); restored.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('two pending tasks reject cross-task, duplicate and stale decisions without resuming another worker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-decision-isolation-'));
  try {
    const store = new SuperAgentTasks(join(dir, 'tasks.json'));
    const a = store.register('worker-a', '/a', 'A'), b = store.register('worker-b', '/b', 'B');
    const ra = store.start('worker-a', '/a', 'A', {}), rb = store.start('worker-b', '/b', 'B', {});
    const da = store.requestDecision(a, ra, { question: 'A choose?' }), db = store.requestDecision(b, rb, { question: 'B choose?' });
    const response = { userMessageId: 'human-1', userText: '仅 A 选择方案二，B 继续等待。', instruction: 'A 选择方案二。' };
    expect(() => store.resolveDecision(b, da.id, response)).toThrow();
    expect(store.resolveDecision(a, da.id, response).alreadyResolved).toBe(false);
    expect(store.resolveDecision(a, da.id, response).alreadyResolved).toBe(true);
    expect(() => store.resolveDecision(a, da.id, { ...response, userMessageId: 'human-2' })).toThrow();
    store.markDecisionDelivered(a, da.id); const next = store.start('worker-a', '/a', response.instruction, {});
    expect(next).not.toBe(ra);
    expect(() => store.requestDecision(a, ra, { question: 'stale' })).toThrow();
    expect(store.get(b)?.decisions?.find(d => d.id === db.id)?.status).toBe('pending');
    expect(store.get(b)?.runs).toHaveLength(1);
    expect(store.timeline(a).filter(e => e.type === 'decision.delivered')).toHaveLength(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
