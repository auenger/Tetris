/** A FIFO queue with a fixed concurrency budget, shared across callers. */
export function createTaskQueue(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid concurrency limit");
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try { return await task(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
