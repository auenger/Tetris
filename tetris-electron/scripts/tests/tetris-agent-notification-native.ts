/** Real Electron wrapper integration; Notification click is simulated, not an OS banner interaction. */
import { app, BrowserWindow, Notification } from 'electron';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskNotificationCenter } from '../../src/main/task-notifications';
import { SuperAgentTasks } from '../../src/main/super-agent-tasks';
import { TaskNotificationStore } from '../../src/main/task-notification-store';
const root = mkdtempSync(join(tmpdir(), 'tetris-notification-native-'));
app.setPath('userData', join(root, 'app-data'));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
void app.whenReady().then(async () => {
  let win: BrowserWindow | undefined, center: TaskNotificationCenter | undefined;
  const originalShow = Notification.prototype.show;
  try {
    assert(Notification.isSupported(), 'Native notifications unavailable on this host');
    const banners: Notification[] = [];
    Notification.prototype.show = function () { banners.push(this); };
    win = new BrowserWindow({ width: 480, height: 180, show: false, title: 'Tetris notification integration check', webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('data:text/html,<html><body>Temporary Tetris notification integration check</body></html>');
    await win.webContents.executeJavaScript(`{
      window.opened=[];window.notices=[];
      const {ipcRenderer}=require('electron');
      ipcRenderer.on('tetris-agent:notification-open',(_event,target)=>window.opened.push(target));
      ipcRenderer.on('tetris-agent:notifications',(_event,notices)=>window.notices.push(notices));
      void 0;
    }`);
    const calls: string[] = [];
    for (const key of ['restore', 'show', 'focus'] as const) {
      const original = win[key].bind(win);
      win[key] = () => { calls.push(key); original(); };
    }
    // Force only the branch predicate; restore/show/focus below are the actual native methods.
    win.isMinimized = () => true;
    const tasks = new SuperAgentTasks(join(root, 'tasks.json'));
    const taskId = tasks.register('native-worker', '/temporary', 'Native wrapper check', { originConversationId: 'original-conversation' });
    const runId = tasks.start('native-worker', '/temporary', 'Check', {});
    tasks.applyReport({ taskId, runId, status: 'completed', summary: 'Native wrapper fixture completed' });
    const event = tasks.timeline(taskId).find(e => e.type === 'run.ready_for_review')!, noticePath = join(root, 'notices.json');
    center = new TaskNotificationCenter(noticePath, () => win || null);
    center.publish(tasks.get(taskId)!, event);
    assert(banners.length === 1 && banners[0] instanceof Notification, 'Wrapper did not create native Notification');
    assert(!center.list()[0]?.readAt, 'Notification became read before click');
    banners[0]!.emit('click');
    let targets: any[] = [];
    for (let i = 0; i < 40; i++) {
      targets = await win.webContents.executeJavaScript('window.opened');
      if (targets.length) break; await sleep(50);
    }
    assert(JSON.stringify(calls) === JSON.stringify(['restore', 'show', 'focus']), 'Window restore/show/focus order incorrect');
    assert(win.isVisible(), 'Actual native window was not shown');
    assert(targets.length === 1 && targets[0].taskId === taskId && targets[0].conversationId === 'original-conversation' && targets[0].eventId === event.id, 'IPC targeted incorrect conversation/task/event');
    assert(new TaskNotificationStore(noticePath).list()[0]?.readAt, 'Read acknowledgement was not durable');
    center.publish(tasks.get(taskId)!, event); assert(banners.length === 1, 'Duplicate event created a second notification');
    const broadcasts = await win.webContents.executeJavaScript('window.notices');
    assert(broadcasts.some((notices: any[]) => notices.some(n => n.readAt)), 'Read notification update never reached renderer');
    console.log(JSON.stringify({ stage: 'notification-wrapper-passed', interaction: 'simulated Notification.emit(click), OS banner show intercepted', nativeNotification: true, nativeWindowVisible: win.isVisible(), nativeWindowFocused: win.isFocused(), calls, ipcTarget: targets[0], durableRead: true, root }));
    center.close();win.destroy();app.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ stage: 'notification-wrapper-failed', error: String(error), root }));
    center?.close();if(win && !win.isDestroyed())win.destroy();app.exit(1);
  } finally { Notification.prototype.show = originalShow; }
});
