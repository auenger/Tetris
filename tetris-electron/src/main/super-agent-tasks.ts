import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type RunStatus = 'queued' | 'running' | 'ready_for_review' | 'cancelled' | 'failed' | 'interrupted';
export interface TaskRun {
  id: string; prompt: string; context: unknown; status: RunStatus;
  startedAt: string; endedAt?: string; detail?: string; output?: string; artifactPath?: string; handoff?: { provider: "claude" | "codex"; status: "starting" | "started" | "failed"; sessionId?: string; error?: string };
}
export interface WorkspaceTask {
  id: string; sessionId: string; cwd: string; title: string; runs: TaskRun[];
  pendingMessages?: string[];
  archived?: boolean; sourceCwd?: string; branch?: string; parentTaskId?: string; completed?: boolean; provider?: "claude" | "codex"; threadId?: string; messages?: unknown[];
}

/** A durable first-stage ledger. Loading never replays interrupted work. */
export class SuperAgentTasks {
  private tasks: WorkspaceTask[];
  constructor(private path: string) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.tasks)) throw new Error('Invalid task store');
      this.tasks = data.tasks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.tasks = [];
    }
    let changed = false;
    for (const task of this.tasks) for (const run of task.runs) {
      if (run.handoff?.status === "starting") {
        run.handoff = { ...run.handoff, status: "failed", error: "Application stopped during handoff; review was not replayed" };
        changed = true;
      }
      if (run.status === 'running' || run.status === 'queued') {
        run.status = 'interrupted';
        run.endedAt = new Date().toISOString();
        run.detail = 'Application stopped before execution was confirmed finished';
        changed = true;
      }
    }
    if (changed) this.save();
  }
  list(cwd?: string): WorkspaceTask[] {
    return structuredClone(this.tasks.filter(task => !cwd || task.cwd === cwd));
  }
  enqueue(sessionId: string, text: string): void {
    const task = this.tasks.find(task => task.sessionId === sessionId);
    if (!task) throw new Error('Task not found');
    (task.pendingMessages ||= []).push(text);
    this.save();
  }
  clearPending(sessionId: string): void {
    const task = this.tasks.find(task => task.sessionId === sessionId);
    if (task?.pendingMessages?.length) { task.pendingMessages = []; this.save(); }
  }
  takeNext(sessionId: string): string | undefined {
    const task = this.tasks.find(task => task.sessionId === sessionId);
    const text = task?.pendingMessages?.shift();
    if (text) this.save();
    return text;
  }
  appendOutput(sessionId: string, text: string): void {
    const task = this.tasks.find(t => t.sessionId === sessionId);
    const run = task?.runs.at(-1);
    if (run?.status === 'running') run.output = (run.output || '') + text;
  }
  complete(id: string): void {
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.runs.at(-1)?.status !== 'ready_for_review') throw new Error('Task is not ready for review');
    task.completed = true;
    this.save();
  }
  messages(sessionId: string): unknown[] {
    const task = this.tasks.find(t => t.sessionId === sessionId);
    return task?.runs.flatMap(run => [
      { role: 'user', content: [{ type: 'text', text: run.prompt }] },
      ...(run.output ? [{ role: 'assistant', content: [{ type: 'text', text: run.output }] }] : []),
    ]) || [];
  }
  updateSession(sessionId: string, patch: { archived?: boolean; sourceCwd?: string; branch?: string; parentTaskId?: string; completed?: boolean; provider?: "claude" | "codex"; threadId?: string; messages?: unknown[] }): void {
    const task = this.tasks.find(t => t.sessionId === sessionId);
    if (!task) return;
    Object.assign(task, patch);
    this.save();
  }
  start(sessionId: string, cwd: string, prompt: string, context: unknown, queued = false): string {
    let task = this.tasks.find(t => t.sessionId === sessionId && t.cwd === cwd);
    if (task?.runs.some(r => r.status === 'running' || r.status === 'queued')) throw new Error('This task is already running');
    if (!task) {
      task = { id: randomUUID(), sessionId, cwd, title: prompt.slice(0, 120), runs: [] };
      this.tasks.push(task);
    }
    task.completed = false;
    const id = randomUUID();
    task.runs.push({ id, prompt, context, status: queued ? 'queued' : 'running', startedAt: new Date().toISOString() });
    this.save();
    return id;
  }
  setHandoff(id: string, handoff: NonNullable<TaskRun['handoff']>): void {
    const run = this.tasks.flatMap(task => task.runs).find(run => run.id === id);
    if (!run) throw new Error('Run not found');
    run.handoff = handoff;
    this.save();
  }
  attachArtifact(id: string, path: string): void {
    const run = this.tasks.flatMap(task => task.runs).find(run => run.id === id);
    if (!run) throw new Error('Run not found');
    run.artifactPath = path;
    this.save();
  }
  activate(id: string): void {
    const run = this.tasks.flatMap(task => task.runs).find(run => run.id === id);
    if (!run || run.status !== 'queued') throw new Error('Task is no longer queued');
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    this.save();
  }
  finish(id: string, status: Exclude<RunStatus, 'running'>, detail?: string): void {
    const run = this.tasks.flatMap(t => t.runs).find(r => r.id === id);
    if (!run || (run.status !== 'running' && run.status !== 'queued')) return;
    Object.assign(run, { status, detail, endedAt: new Date().toISOString() });
    this.save();
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, tasks: this.tasks }, null, 2), { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}
