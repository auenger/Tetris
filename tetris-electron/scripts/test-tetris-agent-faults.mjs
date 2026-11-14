/** Deterministic Electron lifecycle test; no model/network request or user's App data. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) process.exit(typeof code === 'number' ? code : 1);
}
await run('bun', ['scripts/tests/build-agent-faults.ts']);
if (env.TETRIS_CANCEL_ONLY === '1') {
  env.TETRIS_CANCEL_ROOT = mkdtempSync(join(tmpdir(), 'tetris-cancel-ipc-'));
  await run(require('electron'), ['out/tests/tetris-agent-cancel.mjs']);
  env.TETRIS_CANCEL_RELOAD = '1';
  await run(require('electron'), ['out/tests/tetris-agent-cancel.mjs']);
} else await run(require('electron'), ['out/tests/tetris-agent-faults.mjs']);
