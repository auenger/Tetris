/** Opt-in macOS bundled-Helper smoke: ASAR modules, stdio, cwd, exit and AbortSignal. */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getNodeHostExecutable } from '../../src/main/node-host';
const require = createRequire(import.meta.url);
const root = mkdtempSync(join(tmpdir(), 'tetris node host '));
const source = join(root, 'source'), archive = join(root, 'app.asar');
mkdirSync(source);
writeFileSync(join(source, 'value.cjs'), 'module.exports="ASAR_MODULE_OK";');
writeFileSync(join(source, 'entry.cjs'), `process.stdin.once('data',data=>{console.log(JSON.stringify({value:require('./value.cjs'),input:data.toString(),cwd:process.cwd(),arg:process.argv[2],execPath:process.execPath}));process.stderr.write('STDERR_OK');process.exit(17)});`);
const builderRequire = createRequire(require.resolve('electron-builder'));
await builderRequire('@electron/asar').createPackage(source, archive);
try {
  for (const main of [require('electron'), '/Applications/Tetris.app/Contents/MacOS/Tetris'].filter(existsSync)) {
    const host = getNodeHostExecutable(main, 'darwin');
    const child = spawn(host, [join(archive, 'entry.cjs'), 'argument with spaces'], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const deadline = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.stdin.end('STDIN_OK');
    const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }); clearTimeout(deadline);
    const value = JSON.parse(stdout);
    if (code !== 17 || stderr !== 'STDERR_OK' || value.value !== 'ASAR_MODULE_OK' || value.input !== 'STDIN_OK' || value.cwd !== realpathSync(root) || value.arg !== 'argument with spaces' || value.execPath !== host) throw Error(`ASAR / stdio / cwd / exit contract failed: ${JSON.stringify({ code, stderr, value, root, host })}`);
    const controller = new AbortController();
    const waiting = spawn(host, ['-e', 'console.log("READY");setInterval(()=>{},1000)'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, signal: controller.signal, stdio: 'pipe' });
    let aborted = false; waiting.on('error', error => { if (error.name === 'AbortError') aborted = true; });
    waiting.stdout.once('data', () => controller.abort());
    const abortDeadline = setTimeout(() => waiting.kill('SIGKILL'), 10000);
    const signal = await new Promise(resolve => waiting.once('exit', (_code, signal) => resolve(signal))); clearTimeout(abortDeadline);
    if (!aborted || signal !== 'SIGTERM') throw Error('AbortSignal / signal contract failed');
    console.log(JSON.stringify({ stage: 'passed', host, asar: true, stdio: true, cwd: true, exitCode: code, abortSignal: signal }));
  }
} finally { rmSync(root, { recursive: true, force: true }); }
