/** Bounded execution slots, with one writer per canonical working directory. */
export class TaskScheduler {
  private active = new Set<string>();
  private queue: Array<{ cwd: string; start: () => void }> = [];
  constructor(private limit = 2) {}
  acquire(cwd: string, signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.queue = this.queue.filter(item => item !== entry);
        reject(new Error('Task cancelled while queued'));
        this.drain();
      };
      const entry = { cwd, start: () => {
        signal.removeEventListener('abort', abort);
        this.active.add(cwd);
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active.delete(cwd);
          this.drain();
        });
      } };
      if (signal.aborted) { reject(new Error('Task cancelled while queued')); return; }
      signal.addEventListener('abort', abort, { once: true });
      this.queue.push(entry);
      this.drain();
    });
  }
  private drain(): void {
    while (this.active.size < this.limit) {
      const index = this.queue.findIndex(item => !this.active.has(item.cwd));
      if (index < 0) return;
      const [entry] = this.queue.splice(index, 1);
      entry!.start();
    }
  }
}
