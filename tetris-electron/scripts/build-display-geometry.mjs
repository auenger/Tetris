import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  mkdirSync(join(root, 'resources/native'), { recursive: true });
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-framework', 'Cocoa',
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0',
    join(root, 'native/display-geometry/main.m'), '-o', join(root, 'resources/native/display-geometry')], { stdio: 'inherit' });
}

// Native ActivityKit remains opt-in until verified with the public macOS 27.3 SDK.
if(process.platform==='darwin'&&process.env.TETRIS_NATIVE_ACTIVITY==='1')await import('./build-agent-activity.mjs');
