import { isMissingSessionResponse, WorkerSessionMissingError } from './worker-recovery';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface CodexEvent {
  type: string;
  thread_id?: string;
  error?: { message?: string; code?: string; data?: { thread_id?: string; session_id?: string } };
  message?: string;
  item?: { id?: string; type?: string; text?: string; message?: string; command?: string; aggregated_output?: string; changes?: Array<{ path: string }> };
}

/** CLI JSONL adapter. The caller owns task identity and persistence. */
export class CodexExecutor {
  private child: ChildProcessWithoutNullStreams | undefined;
  private cancelled = false;
  constructor(
    private cwd: string,
    public threadId: string | undefined,
    private emit: (event: CodexEvent) => void,
    private executable = "codex",
    private sandbox: "read-only" | "workspace-write" = "workspace-write",
  ) {}

  async prompt(text: string): Promise<{ stopReason: string }> {
    if (this.child) throw new Error('Codex is already running');
    this.cancelled = false;
    const args = ['exec', '--json', '--sandbox', this.sandbox];
    if (this.sandbox === "read-only") args.push("--ephemeral");
    if (this.threadId) args.push('resume', this.threadId);
    args.push('-');
    const child = spawn(this.executable, args, { cwd: this.cwd, stdio: 'pipe', windowsHide: true });
    this.child = child;
    let completed = false;
    let failure = '';
    const resumeId = this.threadId;
    let missingResponse: CodexEvent['error'];
    let executionObserved = false;
    let stderr = '';
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let event: CodexEvent;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === 'thread.started' && event.thread_id) this.threadId = event.thread_id;
      if (event.type === 'turn.completed') completed = true;
      if (event.type === 'turn.failed') { failure = event.error?.message || 'Codex turn failed'; missingResponse = event.error; }
      if (event.type === 'item.started' || event.type === 'item.completed') executionObserved = true;
      this.emit(event);
    });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-8000); });
    // EPIPE is reported through process completion, not an uncaught stream error.
    child.stdin.on('error', () => {});
    child.stdin.end(text);
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      // The CLI may still be shutting down after its authoritative terminal event.
      // A timeout during that shutdown must not discard an already completed turn.
      if (completed && !failure) return { stopReason: 'end_turn' };
      if (this.cancelled) return { stopReason: 'cancelled' };
      if (resumeId && !executionObserved && isMissingSessionResponse(missingResponse, resumeId, 'codex')) throw new WorkerSessionMissingError(resumeId, 'codex', failure);
      if (code !== 0 || failure || !completed) throw new Error(failure || stderr || `Codex exited without completing a turn (${code})`);
      return { stopReason: 'end_turn' };
    } finally {
      lines.close();
      this.child = undefined;
    }
  }
  cancel(): void {
    this.cancelled = true;
    const child = this.child;
    if (!child) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, 3000);
    timer.unref();
  }
}
