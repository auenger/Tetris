// Real renderer components and production theme, controlled IPC, no provider or running App.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('electron-vite/package.json'));
const { build } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
const directory = mkdtempSync(join(tmpdir(), 'tetris-supervisor-chat-'));
await build({
  configFile: false, root, base: './', logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: {
    '@tetris/shared': join(root, 'packages/shared/src'),
    '@tetris/theme': join(root, 'packages/theme/src'),
    '@tetris/components': join(root, 'packages/components/src'),
  } },
  build: { target: 'chrome130', outDir: join(directory, 'renderer'), emptyOutDir: false, rollupOptions: { input: join(root, 'scripts/tests/supervisor-chat.html') } },
});
const env = { ...process.env, TETRIS_SUPERVISOR_CHAT_FIXTURE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), ['scripts/tests/supervisor-chat.cjs'], { cwd: root, env, stdio: 'inherit' });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
console.log(`UI artifacts retained: ${directory}`);
if (code !== 0) process.exitCode = 1;
