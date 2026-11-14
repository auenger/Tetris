import type { TaskEvent, WorkspaceTask } from './super-agent-tasks';
import { TaskNotificationStore, type TaskNotification } from './task-notification-store';

export interface TaskNoticeTarget { taskId: string; conversationId?: string | undefined; eventId: string }
export interface TaskNotificationHost {
  focused(): boolean;
  supported(): boolean;
  broadcast(notices: TaskNotification[]): void;
  open(target: TaskNoticeTarget): void;
  show(notice: TaskNotification, events: { click(): void; close(): void; failed(): void }): { close(): void };
}

/** Durable inbox and native delivery policy, independent of Electron and model turns. */
export class TaskNotificationDelivery {
  private store: TaskNotificationStore;
  private banners = new Map<string, { close(): void }>();
  private view = { visible: false, replaying: false, taskIds: [] as string[], conversationId: '' };
  constructor(path: string, private host: TaskNotificationHost, private systemEnabled = () => true) {
    this.store = new TaskNotificationStore(path);
  }
  list() { return this.store.list(); }
  setView(value: unknown) {
    const view = value as Partial<typeof this.view> | null;
    this.view = {
      visible: view?.visible === true, replaying: view?.replaying === true,
      taskIds: Array.isArray(view?.taskIds) ? view.taskIds.filter((id): id is string => typeof id === 'string').slice(0, 200) : [],
      conversationId: typeof view?.conversationId === 'string' ? view.conversationId : '',
    };
  }
  isConversationVisible(id: string) {
    return this.host.focused() && this.view.visible && !this.view.replaying && this.view.conversationId === id;
  }
  read(id: string) {
    this.store.read(id); this.banners.get(id)?.close(); this.banners.delete(id); this.broadcast();
  }
  reconcileTask(task: WorkspaceTask): void {
    const changed = this.store.reconcileTask(task);
    for (const id of changed) { this.banners.get(id)?.close(); this.banners.delete(id); }
    if (changed.length) this.broadcast();
  }
  publish(task: WorkspaceTask, event: TaskEvent) {
    const notice = this.store.receive(task, event);
    if (notice) { this.broadcast(); this.deliver(notice); }
    return notice;
  }
  /** A crash before claiming delivery leaves pending inbox entries. Never re-show attempted banners. */
  recover() {
    this.broadcast();
    for (const notice of this.list()) if (notice.systemDelivery === 'pending') this.deliver(notice);
  }
  private deliver(notice: TaskNotification) {
    const viewingTask = this.host.focused() && this.view.visible && !this.view.replaying && this.view.taskIds.includes(notice.taskId);
    if (notice.readAt || !this.systemEnabled() || viewingTask || !this.host.supported()) {
      this.store.delivery(notice.id, 'suppressed'); this.broadcast(); return;
    }
    // Claim before the native side effect: after a crash delivery may be uncertain,
    // but the unread inbox remains available and the OS must not get duplicates.
    this.store.delivery(notice.id, 'attempted');
    try {
      const banner = this.host.show(notice, {
        click: () => { this.read(notice.id); this.host.open({ taskId: notice.taskId, conversationId: notice.conversationId, eventId: notice.eventId }); },
        close: () => this.banners.delete(notice.id),
        failed: () => { this.store.delivery(notice.id, 'failed'); this.banners.delete(notice.id); this.broadcast(); },
      });
      this.banners.set(notice.id, banner);
    } catch { this.store.delivery(notice.id, 'failed'); }
    this.broadcast();
  }
  close() { for (const banner of this.banners.values()) banner.close(); this.banners.clear(); }
  private broadcast() { this.host.broadcast(this.list()); }
}
