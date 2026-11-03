import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const contents = join(root, 'resources/TetrisTouchBar.app/Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  mkdirSync(join(contents, 'Resources'), {recursive:true});
  cpSync(join(root, 'resources/dynamic-island/avatars/codex.png'), join(contents, 'Resources/codex.png'));
  cpSync(join(root, 'resources/dynamic-island/avatars/claude-code.png'), join(contents, 'Resources/claude-code.png'));
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-framework', 'Cocoa', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0', join(root, 'native/touchbar/main.m'), '-o', join(contents, 'MacOS/TetrisTouchBar')], { stdio: 'inherit' });
  writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>TetrisTouchBar</string><key>CFBundleIdentifier</key><string>com.collaborator.touchbar</string><key>CFBundleName</key><string>Tetris Touch Bar</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>`);
}
