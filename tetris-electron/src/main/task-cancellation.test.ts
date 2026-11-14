import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SuperAgentTasks, type RunStatus } from './super-agent-tasks';

function fixture(fn: (store: SuperAgentTasks, root: string, path: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'tetris-cancel-')), path = join(root, 'tasks.json');
  try { fn(new SuperAgentTasks(path), root, path); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('cancelling pending review is durable and idempotent while preserving the original report and artifacts', () => fixture((store, root, path) => {
  const id = store.register('finished-native-session', '/project', 'Review', { originConversationId: 'origin' });
  const runId = store.start('finished-native-session', '/project', 'Original goal', {});
  const source = join(root, 'report.md'); writeFileSync(source, 'Historical report'); const artifact = store.attachArtifact(runId, source);
  const report = { taskId: id, runId, status: 'completed' as const, summary: 'Original result' }; store.applyReport(report);
  const executionEndedAt = store.get(id)?.runs.at(-1)?.endedAt;
  store.enqueue('finished-native-session', 'No longer wanted');
  const cancelled = store.cancel(id);
  expect(cancelled.runs.at(-1)?.status).toBe('cancelled'); expect(cancelled.completed).toBe(false);
  expect(cancelled.pendingMessages).toEqual([]); expect(cancelled.runs).toHaveLength(1);
  expect(cancelled.runs.at(-1)?.report).toEqual(report); expect(readFileSync(artifact.path, 'utf8')).toBe('Historical report');
  expect(cancelled.runs.at(-1)?.endedAt).toBe(executionEndedAt);
  expect(store.cancel(id)).toEqual(cancelled);
  expect(store.timeline(id).filter(event => event.type === 'run.cancelled')).toHaveLength(1);
  const reloaded = new SuperAgentTasks(path); expect(reloaded.get(id)).toEqual(cancelled);
  expect(reloaded.get(id)?.originConversationId).toBe('origin');
}));

test('cancel closes pending decisions and queued instructions atomically for every unaccepted state', () => fixture(store => {
  for (const state of ['queued', 'running', 'waiting_for_decision', 'waiting_for_permission', 'blocked', 'failed', 'interrupted'] satisfies RunStatus[]) {
    const id = store.register(state, '/project', state), runId = store.start(state, '/project', 'Work', {}, state === 'queued');
    if (state === 'waiting_for_decision' || state === 'waiting_for_permission') store.requestDecision(id, runId, state === 'waiting_for_permission'
      ? { question: 'Allow?', kind: 'permission', permissionRequestId: 'permission', options: [{ optionId: 'allow', kind: 'allow_once' }] }
      : { question: 'Proceed?' });
    else if (!['running', 'queued'].includes(state)) store.finish(runId, state);
    store.enqueue(state, 'Queued supplement');
    const task = store.cancel(id);
    expect(task.runs.at(-1)?.status).toBe('cancelled'); expect(task.pendingMessages).toEqual([]);
    expect(task.decisions?.every(decision => decision.status !== 'pending')).toBe(true);
    expect(store.takeNext(state)).toBeUndefined();
    expect(() => store.enqueue(state, 'Late queued instruction')).toThrow('cancelled');
  }
  const id = store.register('delivery', '/project', 'Delivery'), runId = store.start('delivery', '/project', 'Work', {});
  const decision = store.requestDecision(id, runId, { question: 'Choose?' });
  store.resolveDecision(id, decision.id, { userMessageId: 'human', userText: '选B', instruction: 'Use B' });
  const task = store.cancel(id);
  expect(task.decisions?.[0]).toMatchObject({ status: 'cancelled', response: { userText: '选B', deliveryStatus: 'failed' } });
  expect(() => store.markDecisionDelivered(id, decision.id)).toThrow('no response');
}));

test('late worker completion, decision, activity and recovery cannot revive a cancelled run', () => fixture(store => {
  const id = store.register('worker', '/project', 'Work'), runId = store.start('worker', '/project', 'Work', {});
  store.appendOutput('worker', 'saved partial'); store.cancel(id);
  expect(() => store.applyReport({ taskId: id, runId, status: 'completed', summary: 'Late completion' })).toThrow('Cancelled');
  expect(store.finish(runId, 'ready_for_review')).toBe(false); expect(store.finish(runId, 'failed', 'Late failure')).toBe(false);
  expect(() => store.requestDecision(id, runId, { question: 'Late question' })).toThrow();
  expect(() => store.reserveRecovery(id, runId, 'missing', 'retry')).toThrow('cancelled');
  store.appendOutput('worker', 'late text'); store.activity('worker', { title: 'late tool' });
  expect(store.get(id)?.runs[0]).toMatchObject({ status: 'cancelled', output: 'saved partial' });
  expect(store.timeline(id).some(event => event.type === 'worker.reported' || event.type === 'tool.updated')).toBe(false);
}));

test('acceptance is preserved and cancelling an older run cannot affect a newer explicit continuation', () => fixture(store => {
  const id = store.register('worker', '/project', 'Work'), first = store.start('worker', '/project', 'First', {});
  store.finish(first, 'ready_for_review'); store.complete(id);
  expect(() => store.cancel(id)).toThrow('验收完成'); expect(store.finish(first, 'cancelled')).toBe(false);
  expect(store.get(id)?.completed).toBe(true); expect(store.get(id)?.runs[0]?.status).toBe('ready_for_review');
  const second = store.start('worker', '/project', 'Explicit next round', {});
  expect(store.finish(first, 'cancelled')).toBe(false); expect(store.get(id)?.runs.at(-1)?.status).toBe('running');
  store.cancel(id); const third = store.start('worker', '/project', 'Explicit restart', {}, true);
  expect(third).not.toBe(second); expect(store.get(id)?.runs.find(run => run.id === second)?.status).toBe('cancelled');
  expect(store.get(id)?.runs.at(-1)?.status).toBe('queued');
}));
