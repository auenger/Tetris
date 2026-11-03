import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
let child: ChildProcessWithoutNullStreams | undefined;
let latest = 'Codex';
let entries: {pid:number; title:string; activity?:string; avatar?:number; provider?:string}[] = [];
let quota = 'Weekly —';
let fullWidth = true;
let touchEnabled = true;
let island = false;
export async function configureStatusDisplays(touch:boolean, full:boolean, always:boolean, notch:boolean) {
  touchEnabled=touch; fullWidth=touch && full; island=false;
  await setResidentTouchBar(touch && always); send();
}
let foreground = true;
let resident = false;
export function setTouchBarForeground(value: boolean) { foreground = value; send(); }
export async function configureFullWidth(value: boolean) { fullWidth = value; await setResidentTouchBar(resident); send(); }
function send() {
  if (child?.stdin.writable) child.stdin.write(JSON.stringify({title:latest, entries, quota, island, touchEnabled, fullWidth: fullWidth && (resident || foreground)}) + '\n');
}
let refresh: (() => void) | undefined;
export function setTouchBarRefresh(handler?: () => void) { refresh = handler; }
let open: ((pid?: number) => void) | undefined;
export function updateResidentTouchBar(title: string, onOpen: (pid?: number) => void, items: {pid:number; title:string; activity?:string; avatar?:number; provider?:string}[] = [], weekly = 'Weekly —') {
  latest = title; open = onOpen; entries = items; quota = weekly;
  send();
}
export function stopResidentTouchBar() {
  const previous = child; child = undefined;
  previous?.stdin.end(); // EOF lets AppKit remove the system item before exiting.
  if (previous) {
    const timer = setTimeout(() => previous.kill(), 2000);
    timer.unref(); previous.once('exit', () => clearTimeout(timer));
  }
}
export async function setResidentTouchBar(enabled: boolean): Promise<void> {
  resident = enabled;
  if (!resident && !fullWidth && !island) { stopResidentTouchBar(); return; }
  send();
  if (child || process.platform !== 'darwin') return;
  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const processHandle = spawn(join(root, 'TetrisTouchBar.app/Contents/MacOS/TetrisTouchBar'), [], {stdio:'pipe'});
  child = processHandle;
  processHandle.stdin.on('error', () => {});
  processHandle.stderr.resume();
  await new Promise<void>((resolve, reject) => {
    let ready = false;
    let buffer = '';
    const fail = () => { if (child === processHandle) child = undefined; if (!ready) reject(new Error('内置 Touch Bar 辅助程序不可用，请先构建辅助程序或关闭常驻模式。')); };
    const timeout = setTimeout(() => { fail(); processHandle.stdin.end(); }, 5000);
    processHandle.once('error', () => { clearTimeout(timeout); fail(); });
    processHandle.once('exit', () => { clearTimeout(timeout); fail(); });
    processHandle.stdout.on('data', chunk => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (line === 'ready') {
          ready = true; clearTimeout(timeout);
          send(); resolve();
        } else if (line === 'refresh') refresh?.();
        else if (line === 'open') open?.();
        else if (/^open:\d+$/.test(line)) open?.(Number(line.slice(5)));
      }
    });
  });
}
app.on('before-quit', stopResidentTouchBar);
