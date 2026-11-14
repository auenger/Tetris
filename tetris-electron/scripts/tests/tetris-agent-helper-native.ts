/** Opt-in real Electron main -> bundled Helper -> Claude SDK verification; no app/user tasks. */
import { app } from 'electron';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SupervisorRuntime } from '../../src/main/supervisor-runtime';
import { getNodeHostExecutable } from '../../src/main/node-host';
const root = mkdtempSync(join(tmpdir(), 'tetris-helper-native-'));
app.setPath('userData', join(root, 'user-data'));
const log = (stage: string, details: object = {}) => console.log(JSON.stringify({ stage, at: new Date().toISOString(), root, ...details }));
const require = createRequire(import.meta.url);
const runtime = new SupervisorRuntime(join(root, 'agent-home'), async () => {
  const acpRequire = createRequire(require.resolve('@agentclientprotocol/claude-agent-acp/dist/lib.js'));
  const sdk = await import(pathToFileURL(acpRequire.resolve('@anthropic-ai/claude-agent-sdk')).href);
  return { z: acpRequire('zod').z, sdk: { ...sdk, query: ({ prompt, options }: any) => {
    const original = options.spawnClaudeCodeProcess;
    if (!original || !process.versions.electron) throw Error('Must test the actual Electron spawn branch');
    options.spawnClaudeCodeProcess = (args: any) => {
      const child = original(args);
      log('sdk-child', { pid: child.pid, parentPid: process.pid, executable: getNodeHostExecutable() });
      child.on('exit', (code: number | null, signal: string | null) => log('sdk-exit', { pid: child.pid, code, signal }));
      return child;
    };
    return sdk.query({ prompt, options });
  } } };
});
void app.whenReady().then(async () => {
app.dock?.hide();
log('ready', { pid: process.pid, electron: process.versions.electron, host: getNodeHostExecutable(), parentDockHidden: true });
try {
  await new Promise(resolve => setTimeout(resolve, 2000));
  let chunks = 0;
  const result = await runtime.run({ conversationId: 'helper-smoke', preferredExecutor: 'claude', context: { workspaces: [] }, tasks: [], history: [], selectedTaskIds: [], eventOnly: false,
    incoming: { id: 'helper-native-turn', role: 'user', text: '不要调用工具，不要创建任务。用中文写五句关于清晰沟通的建议，最后单独输出 HELPER_NATIVE_OK。', state: 'pending', createdAt: new Date().toISOString(), taskIds: [] } },
  async () => { throw Error('No task operations authorized'); }, sessionId => log('session', { sessionId }), () => {}, text => { chunks++; if (chunks === 1) log('first-text', { length: text.length }); });
  if (!result.reply.includes('HELPER_NATIVE_OK')) throw Error('Final reply missing');
  log('passed', { sessionId: result.sessionId, chunks, finalLength: result.reply.length });
} catch (error) { log('failed', { error: String(error) }); process.exitCode = 1; }
finally { runtime.close(); app.exit(Number(process.exitCode) || 0); }
});
