import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SuperAgentTasks } from './super-agent-tasks';
import { TaskNotificationStore } from './task-notification-store';

test('restart surfaces quarantined follow-ups once without losing the completed result', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tetris-queued-notice-'));
  try {
    const taskPath = join(directory, 'tasks.json'), noticePath = join(directory, 'notices.json');
    const tasks = new SuperAgentTasks(taskPath);
    const taskId = tasks.register('worker', '/project', 'Review project', { originConversationId: 'original-conversation' });
    const runId = tasks.start('worker', '/project', 'Review first page', {});
    tasks.enqueue('worker', 'Also review the footer.');
    tasks.applyReport({ taskId, runId, status: 'completed', summary: 'First page reviewed.' });
    // Crash after the result commit, before draining the saved follow-up queue.
    const recovered = new SuperAgentTasks(taskPath), task = recovered.get(taskId)!;
    const event = recovered.timeline(taskId).find(e => e.type === 'instructions.interrupted')!;
    expect(task.pendingMessages).toEqual([]);
    expect(task.runs[0]?.status).toBe('ready_for_review');
    expect(task.runs[0]?.report?.summary).toBe('First page reviewed.');
    expect(event.payload).toMatchObject({ texts: ['Also review the footer.'] });
    const notices = new TaskNotificationStore(noticePath), notice = notices.receive(task, event)!;
    expect(notice.kind).toBe('interrupted');
    expect(notice.body).toContain('排队指令尚未执行，未自动重放');
    expect(notice.conversationId).toBe('original-conversation');
    expect(notice.readAt).toBeUndefined(); expect(notice.systemDelivery).toBe('pending');
    const again = new SuperAgentTasks(taskPath), restored = new TaskNotificationStore(noticePath);
    expect(again.timeline(taskId).filter(e => e.type === 'instructions.interrupted')).toHaveLength(1);
    expect(restored.receive(again.get(taskId)!, event)).toBeUndefined();
    expect(restored.list()).toEqual([notice]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('cancellation settles old completion and decision notices once and rejects historical replay', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tetris-cancel-notice-'));
  try {
    const tasks = new SuperAgentTasks(join(directory, 'tasks.json'));
    const taskId = tasks.register('worker', '/project', 'Inspect project');
    const runId = tasks.start('worker', '/project', 'Inspect', {});
    tasks.applyReport({ taskId, runId, status: 'completed', summary: 'Original result' });
    const store = new TaskNotificationStore(join(directory, 'notices.json'));
    const completedEvent = tasks.timeline(taskId).find(event => event.type === 'run.ready_for_review')!;
    const completed = store.receive(tasks.get(taskId)!, completedEvent)!;
    const next = tasks.start('worker', '/project', 'Inspect more', {});
    tasks.requestDecision(taskId, next, { question: 'Continue?' });
    const decisionEvent = tasks.timeline(taskId).find(event => event.type === 'decision.requested')!;
    const decision = store.receive(tasks.get(taskId)!, decisionEvent)!;
    store.delivery(decision.id, 'attempted');
    const otherTask = { ...tasks.get(taskId)!, id: 'another-task' };
    const other = store.receive(otherTask, { ...completedEvent, id: 'another-event', taskId: otherTask.id })!;
    expect(store.reconcileTask(tasks.get(taskId)!)).toEqual([]);

    const cancelled = tasks.get(taskId)!; cancelled.runs.at(-1)!.status = 'cancelled';
    expect(store.reconcileTask(cancelled).sort()).toEqual([completed.id, decision.id].sort());
    const saved = store.list();
    expect(saved.find(notice => notice.id === completed.id)).toMatchObject({ systemDelivery: 'suppressed' });
    expect(saved.find(notice => notice.id === completed.id)?.readAt).toBeDefined();
    expect(saved.find(notice => notice.id === decision.id)?.readAt).toBeDefined();
    expect(saved.find(notice => notice.id === decision.id)?.systemDelivery).toBe('attempted');
    expect(saved.find(notice => notice.id === other.id)).toEqual(other);
    expect(store.reconcileTask(cancelled)).toEqual([]); expect(store.list()).toEqual(saved);
    // Even an event missing from the notification ledger must not resurrect an action reminder.
    expect(store.receive(cancelled, { ...completedEvent, id: 'unpublished-completion' })).toBeUndefined();
    expect(store.receive(cancelled, { ...decisionEvent, id: 'unpublished-decision' })).toBeUndefined();
    expect(new TaskNotificationStore(join(directory, 'notices.json')).list()).toEqual(saved);
    expect(cancelled.runs[0]?.report?.summary).toBe('Original result');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
