import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TaskEvent, WorkspaceTask } from './super-agent-tasks';
export interface TaskNotification {
  id: string; eventId: string; taskId: string; conversationId?: string | undefined; runId?: string | undefined;
  kind: 'completed' | 'decision' | 'permission' | 'blocked' | 'failed' | 'interrupted';
  title: string; body: string; createdAt: string; readAt?: string | undefined;
  systemDelivery: 'pending' | 'attempted' | 'failed' | 'suppressed';
}
const kinds: Record<string, TaskNotification['kind']> = {
  'run.ready_for_review': 'completed', 'run.blocked': 'blocked', 'run.failed': 'failed', 'run.interrupted': 'interrupted', 'instructions.interrupted': 'interrupted', 'decision.requested': 'decision',
};
const labels = { completed: '任务已完成，等待验收', decision: '需要你的决定', permission: '需要你的授权', blocked: '任务遇到阻碍', failed: '任务执行失败', interrupted: '任务执行中断' };
/** Notification state is persisted independently of model summarization and native UI delivery. */
export class TaskNotificationStore {
  private notices: TaskNotification[];
  constructor(private path: string) {
    try { const data = JSON.parse(readFileSync(path, 'utf8')); if (data.version !== 1 || !Array.isArray(data.notices)) throw new Error('Invalid task notification store'); this.notices = data.notices; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; this.notices = []; }
  }
  list() { return structuredClone(this.notices); }
  /** Cancellation ends outstanding action reminders, without deleting their history. */
  reconcileTask(task: WorkspaceTask): string[] {
    if (task.runs.at(-1)?.status !== 'cancelled') return [];
    const changed: string[] = [], readAt = new Date().toISOString();
    for (const notice of this.notices) {
      if (notice.taskId !== task.id || (notice.readAt && notice.systemDelivery !== 'pending')) continue;
      notice.readAt ||= readAt;
      if (notice.systemDelivery === 'pending') notice.systemDelivery = 'suppressed';
      changed.push(notice.id);
    }
    if (changed.length) this.save();
    return changed;
  }
  receive(task: WorkspaceTask, event: TaskEvent): TaskNotification | undefined {
    if (event.taskId !== task.id) throw new Error('Notification event belongs to another task');
    if (task.runs.at(-1)?.status === 'cancelled') return undefined;
    if (this.notices.some(n => n.eventId === event.id)) return undefined;
    let kind = kinds[event.type]; if (!kind) return undefined;
    const payload = event.payload as { id?: string; kind?: string | undefined; question?: string | undefined; summary?: string | undefined; detail?: string; reason?: string } | undefined;
    if (kind === 'decision' && !task.decisions?.some(d => d.id === payload?.id && d.status === 'pending')) return undefined;
    if (kind === 'decision' && payload?.kind === 'permission') kind = 'permission';
    const body = [task.title, payload?.question || payload?.summary || payload?.detail || payload?.reason].filter(Boolean).join(' · ').slice(0, 300);
    const notice: TaskNotification = { id: randomUUID(), eventId: event.id, taskId: task.id, conversationId: task.originConversationId, runId: event.runId,
      kind, title: `Tetris Agent · ${labels[kind]}`, body, createdAt: event.at, systemDelivery: 'pending' };
    this.notices.push(notice); this.save(); return structuredClone(notice);
  }
  read(id: string): void { const n = this.notices.find(n => n.id === id); if (n && !n.readAt) { n.readAt = new Date().toISOString(); this.save(); } }
  delivery(id: string, state: TaskNotification['systemDelivery']) { const n = this.notices.find(n => n.id === id); if (n) { n.systemDelivery = state; this.save(); } }
  private save() { mkdirSync(dirname(this.path), { recursive: true }); const temp = `${this.path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify({ version: 1, notices: this.notices }), { mode: 0o600 }); renameSync(temp, this.path); }
}
