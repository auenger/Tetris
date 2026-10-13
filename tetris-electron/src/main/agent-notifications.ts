import { Notification, ipcMain, type BrowserWindow } from 'electron';
import { registerMethod } from './json-rpc-server';
import { createAgentNotificationState } from './agent-notification-state';
export const agentNotifications = createAgentNotificationState();
export function registerAgentNotifications(mainWindow: () => BrowserWindow | null) {
  const banners = new Map<string, Notification>();
  const broadcast = () => mainWindow()?.webContents.send('agent:notifications', agentNotifications.list());
  ipcMain.handle('agent:notifications', () => agentNotifications.list());
  ipcMain.on('agent:notification-read', (event, target: unknown) => {
    if (event.sender !== mainWindow()?.webContents) return;
    const sessionIds = typeof target === 'string' ? [target] : target;
    if (!Array.isArray(sessionIds) || !sessionIds.every(id => typeof id === 'string')) return;
    for (const sessionId of new Set(sessionIds)) {
      agentNotifications.read(sessionId);
      banners.get(sessionId)?.close();
      banners.delete(sessionId);
    }
    broadcast();
  });
  registerMethod('terminal.notify', params => {
    const notice = agentNotifications.receive(params);
    if (!notice) return { ok: false };
    broadcast();
    const win = mainWindow();
    // Foreground uses the canvas notification list; background also gets a native banner.
    if (win && !win.isFocused() && Notification.isSupported()) {
      try {
        banners.get(notice.sessionId)?.close();
        const banner = new Notification({ title: notice.title, body: notice.body });
        banners.set(notice.sessionId, banner);
        banner.on('click', () => {
          const current = mainWindow();
          if (!current || current.isDestroyed()) return;
          if (current.isMinimized()) current.restore();
          current.show(); current.focus();
          current.webContents.send('agent:notification-open', notice.sessionId);
        });
        banner.on('close', () => { if (banners.get(notice.sessionId) === banner) banners.delete(notice.sessionId); });
        banner.on('failed', () => { banners.delete(notice.sessionId); });
        banner.show();
      } catch { /* The in-app unread notice remains available. */ }
    }
    return { ok: true };
  }, { description: 'Receive a terminal-scoped coding agent completion or attention hook' });
}
