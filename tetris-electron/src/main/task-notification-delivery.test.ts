import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SuperAgentTasks } from './super-agent-tasks';
import { TaskNotificationStore } from './task-notification-store';
import { TaskNotificationDelivery, type TaskNotificationHost, type TaskNoticeTarget } from './task-notification-delivery';

function fixture(runTest: (f: ReturnType<typeof setup>) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-notification-'));
  try { runTest(setup(dir)); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function setup(dir: string) {
  const tasks = new SuperAgentTasks(join(dir, 'tasks.json'));
  const taskId = tasks.register('worker', '/project', 'Inspect project', { originConversationId: 'original-conversation' });
  const runId = tasks.start('worker', '/project', 'Inspect only', {});
  tasks.applyReport({ taskId, runId, status: 'completed', summary: 'Inspection finished' });
  const task = tasks.get(taskId)!;
  const event = tasks.timeline(taskId).find(event => event.type === 'run.ready_for_review')!;
  const shown: Array<Parameters<TaskNotificationHost['show']>[1]> = [];
  const opened: TaskNoticeTarget[] = [];
  let focused = false, supported = true, enabled = true, throws = false, closes = 0;
  const host: TaskNotificationHost = {
    focused: () => focused, supported: () => supported, broadcast: () => {}, open: target => { opened.push(target); },
    show: (_notice, handlers) => { if (throws) throw new Error('OS unavailable'); shown.push(handlers); return { close: () => { closes++; handlers.close(); } }; },
  };
  const path = join(dir, 'notifications.json');
  const create = () => new TaskNotificationDelivery(path, host, () => enabled);
  return { task, event, path, create, shown, opened, host, closes: () => closes,
    focus: (value: boolean) => { focused = value; }, support: (value: boolean) => { supported = value; },
    enable: (value: boolean) => { enabled = value; }, fail: () => { throws = true; } };
}

test('native click marks inbox read and targets original conversation, duplicate events do not notify twice', () => fixture(f => {
  const center = f.create(); center.publish(f.task, f.event); center.publish(f.task, f.event);
  expect(f.shown).toHaveLength(1); expect(center.list()).toHaveLength(1);
  expect(center.list()[0]?.readAt).toBeUndefined(); f.shown[0]!.click();
  expect(f.opened).toEqual([{ taskId: f.task.id, conversationId: 'original-conversation', eventId: f.event.id }]);
  expect(center.list()[0]?.readAt).toBeDefined(); expect(f.closes()).toBe(1);
  expect(f.create().list()[0]?.readAt).toBeDefined();
}));

test('foreground unrelated page/task still notifies; only the visible live task suppresses', () => {
  for (const visible of [false, true]) fixture(f => {
    f.focus(true); const center = f.create();
    center.setView({ visible, conversationId: 'another-conversation', taskIds: ['another-task'] });
    center.publish(f.task, f.event); expect(f.shown).toHaveLength(1);
  });
  fixture(f => {
    f.focus(true); const center = f.create();
    center.setView({ visible: true, conversationId: 'original-conversation', taskIds: [f.task.id] });
    expect(center.isConversationVisible('original-conversation')).toBe(true);
    center.publish(f.task, f.event); expect(f.shown).toHaveLength(0);
    expect(center.list()[0]?.systemDelivery).toBe('suppressed'); expect(center.list()[0]?.readAt).toBeUndefined();
    center.setView({ visible: false }); expect(center.isConversationVisible('original-conversation')).toBe(false);
  });
});

test('replay and background app never count as viewing the current live result', () => {
  for (const focused of [true, false]) fixture(f => {
    f.focus(focused); const center = f.create();
    center.setView({ visible: true, replaying: true, conversationId: 'original-conversation', taskIds: [f.task.id] });
    expect(center.isConversationVisible('original-conversation')).toBe(false);
    center.publish(f.task, f.event); expect(f.shown).toHaveLength(1);
  });
});

test('native unavailable, disabled, thrown and async failed retain the durable unread inbox', () => {
  for (const state of ['unsupported', 'disabled', 'throw', 'async'] as const) fixture(f => {
    if (state === 'unsupported') f.support(false);
    if (state === 'disabled') f.enable(false);
    if (state === 'throw') f.fail();
    const center = f.create(); center.publish(f.task, f.event);
    if (state === 'async') f.shown[0]!.failed();
    const notice = f.create().list()[0]!;
    expect(notice.readAt).toBeUndefined();
    expect(notice.systemDelivery).toBe(state === 'throw' || state === 'async' ? 'failed' : 'suppressed');
  });
});

test('crash before native delivery recovers pending once; claimed delivery is never replayed', () => fixture(f => {
  const store = new TaskNotificationStore(f.path); const notice = store.receive(f.task, f.event)!;
  expect(notice.systemDelivery).toBe('pending');
  const center = f.create(); center.recover(); center.recover();
  expect(f.shown).toHaveLength(1); expect(center.list()[0]?.systemDelivery).toBe('attempted');
  f.create().recover(); expect(f.shown).toHaveLength(1);
}));

test('crash after native claim and before show retains inbox without repeating uncertain external action', () => fixture(f => {
  const store = new TaskNotificationStore(f.path); const notice = store.receive(f.task, f.event)!;
  store.delivery(notice.id, 'attempted'); const center = f.create(); center.recover();
  expect(f.shown).toHaveLength(0); expect(center.list()[0]?.readAt).toBeUndefined();
}));

test('already-read pending entries are recovered silently and invalid view input cannot suppress alerts', () => {
  fixture(f => {
    const store = new TaskNotificationStore(f.path); const notice = store.receive(f.task, f.event)!; store.read(notice.id);
    const center = f.create(); center.recover(); expect(f.shown).toHaveLength(0); expect(center.list()[0]?.systemDelivery).toBe('suppressed');
  });
  fixture(f => { f.focus(true); const center = f.create(); center.setView(null); center.publish(f.task, f.event); expect(f.shown).toHaveLength(1); });
});

test('cancelling a task closes its existing banner and clears only its outstanding inbox', () => fixture(f => {
  const center = f.create(); center.publish(f.task, f.event);
  const otherTask = { ...f.task, id: 'other-task' };
  center.publish(otherTask, { ...f.event, id: 'other-event', taskId: otherTask.id });
  expect(f.shown).toHaveLength(2);
  const cancelled = structuredClone(f.task); cancelled.runs.at(-1)!.status = 'cancelled';
  center.reconcileTask(cancelled);
  expect(f.closes()).toBe(1);
  expect(center.list().find(notice => notice.taskId === f.task.id)?.readAt).toBeDefined();
  expect(center.list().find(notice => notice.taskId === otherTask.id)?.readAt).toBeUndefined();
  const saved = center.list(); center.reconcileTask(cancelled);
  expect(f.closes()).toBe(1); expect(center.list()).toEqual(saved);
  center.publish(cancelled, { ...f.event, id: 'late-historical-event' });
  expect(f.shown).toHaveLength(2); expect(center.list()).toHaveLength(2);
}));

test('restart reconciles cancelled tasks before recovering pending notifications', () => fixture(f => {
  const store = new TaskNotificationStore(f.path); store.receive(f.task, f.event);
  const otherTask = { ...f.task, id: 'other-task' };
  store.receive(otherTask, { ...f.event, id: 'other-event', taskId: otherTask.id });
  const cancelled = structuredClone(f.task); cancelled.runs.at(-1)!.status = 'cancelled';
  const center = f.create(); center.reconcileTask(cancelled);
  center.publish(cancelled, f.event); center.recover(); center.recover();
  expect(f.shown).toHaveLength(1);
  const settled = center.list().find(notice => notice.taskId === f.task.id)!;
  expect(settled.readAt).toBeDefined(); expect(settled.systemDelivery).toBe('suppressed');
  expect(center.list().find(notice => notice.taskId === otherTask.id)?.readAt).toBeUndefined();
  const restored = f.create(); restored.reconcileTask(cancelled); restored.recover();
  expect(f.shown).toHaveLength(1); expect(restored.list()).toEqual(center.list());
}));
