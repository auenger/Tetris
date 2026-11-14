import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { COLLAB_DIR } from './paths';
import { routedHookArgv, shellQuote } from './agent-hook-command';
import { getNodeHostExecutable } from './node-host';
export { shellQuote } from './agent-hook-command';
export function notificationHookConfig() {
  if (process.platform === 'win32') return null;
  const script = app.isPackaged ? join(process.resourcesPath, 'agent-notify.cjs')
    : join(app.getAppPath(), 'resources', 'agent-notify.cjs');
  const executable = getNodeHostExecutable();
  const command = (mode: string) => routedHookArgv(executable, script, [mode]);
  const hook = (mode: string) => ({type:'command', command:command(mode).map(shellQuote).join(' '), timeout:3});
  const directory = join(COLLAB_DIR, 'shell-integration');
  mkdirSync(directory, {recursive:true});
  const settings = join(directory, 'agent-notifications.json');
  writeFileSync(settings, JSON.stringify({hooks:{
    UserPromptSubmit:[{hooks:[hook('claude-start')]}],
    Stop:[{hooks:[hook('claude-stop')]}],
    PreToolUse:[{hooks:[hook('claude-tool')]}],
    PostToolUse:[{hooks:[hook('claude-tool')]}],
    SessionEnd:[{hooks:[hook('claude-tool')]}],
    Notification:[{matcher:'permission_prompt|elicitation_dialog', hooks:[hook('claude-attention')]}],
  }}));
  return { settings, codex: 'notify=' + JSON.stringify(command('codex')) };
}
