import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { COLLAB_DIR } from './paths';
export const shellQuote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
export function notificationHookConfig() {
  if (process.platform === 'win32') return null;
  const script = app.isPackaged ? join(process.resourcesPath, 'agent-notify.cjs')
    : join(app.getAppPath(), 'resources', 'agent-notify.cjs');
  const command = (mode: string) => ['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', process.execPath, script, mode];
  const hook = (mode: string) => ({type:'command', command:command(mode).map(shellQuote).join(' '), timeout:3});
  const directory = join(COLLAB_DIR, 'shell-integration');
  mkdirSync(directory, {recursive:true});
  const settings = join(directory, 'agent-notifications.json');
  writeFileSync(settings, JSON.stringify({hooks:{
    Stop:[{hooks:[hook('claude-stop')]}],
    Notification:[{matcher:'permission_prompt|elicitation_dialog', hooks:[hook('claude-attention')]}],
  }}));
  return { settings, codex: 'notify=' + JSON.stringify(command('codex')) };
}
