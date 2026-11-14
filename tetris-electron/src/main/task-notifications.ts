import { Notification, type BrowserWindow } from 'electron';
import { TaskNotificationDelivery } from './task-notification-delivery';

export class TaskNotificationCenter extends TaskNotificationDelivery {
  constructor(path: string, getWindow: () => BrowserWindow | null, systemEnabled = () => true) {
    super(path, {
      focused: () => { const win = getWindow(); return !!win && !win.isDestroyed() && win.isFocused(); },
      supported: () => Notification.isSupported(),
      broadcast: notices => {
        const win = getWindow();
        if (win && !win.isDestroyed()) win.webContents.send('tetris-agent:notifications', notices);
      },
      open: target => {
        const win = getWindow(); if (!win || win.isDestroyed()) return;
        if (win.isMinimized()) win.restore(); win.show(); win.focus();
        const send = () => { if (!win.isDestroyed()) win.webContents.send('tetris-agent:notification-open', target); };
        if (win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', send); else send();
      },
      show: (notice, events) => {
        const banner = new Notification({ title: notice.title, body: notice.body });
        banner.on('click', events.click); banner.on('close', events.close); banner.on('failed', events.failed);
        banner.show(); return banner;
      },
    }, systemEnabled);
  }
}
