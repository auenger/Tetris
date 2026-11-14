import { test, expect } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { getNodeHostExecutable } from './node-host';

test('bundled Node host resolves development and renamed packaged Helpers including paths with spaces', () => {
  const root = mkdtempSync(join(tmpdir(), 'node-host-'));
  const touch = (path: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ''); chmodSync(path, 0o755); return path; };
  try {
    for (const name of ['Electron', 'Tetris', 'Tetris Dev']) {
      const contents = join(root, `${name}.app`, 'Contents');
      const main = touch(join(contents, 'MacOS', name));
      const helper = touch(join(contents, 'Frameworks', `${name} Helper.app`, 'Contents', 'MacOS', `${name} Helper`));
      expect(getNodeHostExecutable(main, 'darwin')).toBe(helper);
      expect(getNodeHostExecutable(helper, 'darwin')).toBe(helper);
      expect(getNodeHostExecutable(join(contents, 'MacOS', 'custom-binary'), 'darwin')).toBe(helper);
      const plugin = touch(join(contents, 'Frameworks', `${name} Helper (Plugin).app`, 'Contents', 'MacOS', `${name} Helper (Plugin)`));
      expect(getNodeHostExecutable(plugin, 'darwin')).toBe(plugin);
    }
    const contents = join(root, 'Custom.app', 'Contents');
    const helper = touch(join(contents, 'Frameworks', 'Renamed Helper.app', 'Contents', 'MacOS', 'Renamed Helper'));
    expect(getNodeHostExecutable(join(contents, 'MacOS', 'custom'), 'darwin')).toBe(helper);
    chmodSync(helper, 0o644);
    expect(() => getNodeHostExecutable(join(contents, 'MacOS', 'custom'), 'darwin')).toThrow('Electron Helper');
    expect(() => getNodeHostExecutable(join(root, 'Missing.app', 'Contents', 'MacOS', 'Missing'), 'darwin')).toThrow('Electron Helper');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Windows and Linux retain their bundled process executable without resolving external Node', () => {
  expect(getNodeHostExecutable('C:\\Program Files\\Tetris\\Tetris.exe', 'win32')).toBe('C:\\Program Files\\Tetris\\Tetris.exe');
  expect(getNodeHostExecutable('/opt/Tetris/tetris', 'linux')).toBe('/opt/Tetris/tetris');
});
