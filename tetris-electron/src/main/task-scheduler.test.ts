import { test, expect } from 'bun:test';
import { TaskScheduler } from './task-scheduler';
test('serializes one directory, allows another and cancels queued work', async () => {
  const scheduler = new TaskScheduler(2);
  const first = await scheduler.acquire('/a', new AbortController().signal);
  let started = false;
  const second = scheduler.acquire('/a', new AbortController().signal).then(release => { started = true; return release; });
  const other = await scheduler.acquire('/b', new AbortController().signal);
  expect(started).toBe(false);
  const cancelled = new AbortController();
  const waiting = scheduler.acquire('/c', cancelled.signal);
  cancelled.abort();
  await expect(waiting).rejects.toThrow('cancelled');
  first();
  const release = await second;
  expect(started).toBe(true);
  release(); other();
});
