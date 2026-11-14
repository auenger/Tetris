/** Opt-in real-provider test. TETRIS_E2E_WORKER=codex selects Codex.
 * TETRIS_E2E_CASE=routing checks project/provider routing; notifications tests the native wrapper without models.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const env = { ...process.env, TETRIS_E2E_REPO: root }; delete env.ELECTRON_RUN_AS_NODE;
async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) process.exit(typeof code === 'number' ? code : 1);
}
const entry = process.env.TETRIS_E2E_CASE === 'notifications' ? 'scripts/tests/tetris-agent-notification-native.ts' : 'scripts/tests/tetris-agent-e2e.ts';
await run('bun', ['build', entry, '--target', 'node', '--tsconfig-override', 'tsconfig.node.json',
  '--external', 'electron', '--external', '@agentclientprotocol/sdk', '--external', 'node-pty', '--external', '@parcel/watcher', '--external', 'typescript', '--external', 'sharp', '--outfile', 'out/tests/tetris-agent-e2e.mjs']);
await run(require('electron'), ['out/tests/tetris-agent-e2e.mjs']);
