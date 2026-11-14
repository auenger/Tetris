import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { islandHookConfig, routedHookArgv, shellQuote } from './agent-hook-command';

const command = (args: string[]) => args.map(shellQuote).join(' ');
const run = (argv: string[], env: Record<string, string>, input = '') => spawnSync(argv[0]!, argv.slice(1), { env: { PATH: '/usr/bin:/bin', ...env }, input, encoding: 'utf8' });

test('missing or empty routing exits before attempting to launch the runtime', () => {
  const argv = routedHookArgv('/does-not-exist/tetris-runtime', '/does-not-exist/hook.cjs');
  for (const env of [{}, { COLLAB_NOTIFY_ROUTE: 'route' }, { COLLAB_NOTIFY_SOCKET_FILE: '/socket' }, { COLLAB_NOTIFY_ROUTE: '', COLLAB_NOTIFY_SOCKET_FILE: '/socket' }, { COLLAB_NOTIFY_ROUTE: 'route', COLLAB_NOTIFY_SOCKET_FILE: '' }]) {
    const result = run(argv, env);
    expect(result.status).toBe(0); expect(result.stderr).toBe('');
  }
  // With both values present, the same deliberately missing executable fails:
  // this distinguishes the guard from a launcher that always returns success.
  expect(run(argv, { COLLAB_NOTIFY_ROUTE: 'route', COLLAB_NOTIFY_SOCKET_FILE: '/socket' }).status).not.toBe(0);
});

test('Codex appended JSON and Claude hook stdin pass through without shell expansion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-hook-command-'));
  try {
    const script = join(dir, "a space ' quoted $HOME hook.sh");
    writeFileSync(script, 'printf "%s\\n" "$@"\ncat\n');
    const env = { COLLAB_NOTIFY_ROUTE: 'route', COLLAB_NOTIFY_SOCKET_FILE: '/socket' };
    const payload = JSON.stringify({ type: 'agent-turn-complete', text: '$HOME `exit 93` $(exit 94) " quote \' 中文\nnext' });
    const codex = run([...routedHookArgv('/bin/sh', script, ['codex']), payload], env);
    expect(codex.status).toBe(0); expect(codex.stdout).toBe(`codex\n${payload}\n`);
    const claude = run(['/bin/sh', '-c', command(routedHookArgv('/bin/sh', script, ['claude-tool']))], env, payload);
    expect(claude.status).toBe(0); expect(claude.stdout).toBe(`claude-tool\n${payload}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration upgrades only current installation exact commands and is idempotent', () => {
  const executable = '/dev/Electron', script = '/dev/resources/island-hook.cjs';
  const legacy = command(['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', executable, script]);
  const current = command(routedHookArgv(executable, script));
  const installed = command(['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', '/Applications/Tetris', '/Applications/resources/island-hook.cjs']);
  const similar = { type: 'command', command: `echo audit; ${legacy}` };
  const foreign = { type: 'command', command: installed };
  const source = { userSetting: true, hooks: { Stop: [
    { hooks: [{ type: 'command', command: legacy, timeout: 2, async: true, custom: 'keep' }, similar, foreign], matcher: 'same matcher', extra: 7 },
    { hooks: [{ type: 'command', command: current }], matcher: 'custom metadata survives' },
    { hooks: [{ type: 'command', command: legacy }] },
  ], UserDefined: [{ hooks: [{ type: 'command', command: legacy }] }] } };
  const before = structuredClone(source), result = islandHookConfig(source, executable, script) as any;
  expect(source).toEqual(before);
  expect(result.userSetting).toBe(true);
  expect(result.hooks.Stop).toEqual([
    { hooks: [{ type: 'command', command: current, timeout: 2, async: true, custom: 'keep' }, similar, foreign], matcher: 'same matcher', extra: 7 },
    { hooks: [], matcher: 'custom metadata survives' },
  ]);
  expect(result.hooks.UserDefined).toEqual(source.hooks.UserDefined);
  expect(islandHookConfig(result, executable, script)).toEqual(result);
});

test('same script basename or another runtime never authorizes deleting another installation hook', () => {
  const executable = '/dev/Electron', script = '/dev/resources/island-hook.cjs';
  const others = [command(['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', '/other/Electron', script]), command(['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', executable, '/other/resources/island-hook.cjs'])];
  const result = islandHookConfig({ hooks: { Stop: [{ hooks: others.map(command => ({ type: 'command', command })) }] } }, executable, script) as any;
  expect(result.hooks.Stop[0].hooks.map((hook: any) => hook.command)).toEqual(others);
  expect(result.hooks.Stop[1].hooks).toHaveLength(1);
});

test('same-installation main and Helper guarded or guardless commands converge on one Helper hook', () => {
  const main = '/dev/Electron.app/Contents/MacOS/Electron', helper = '/dev/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper', script = '/dev/resources/island-hook.cjs';
  const known = [main, helper].flatMap(runtime => [command(['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', runtime, script]), command(routedHookArgv(runtime, script))]);
  const foreign = command(['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', '/Applications/Tetris.app/Contents/MacOS/Tetris', '/Applications/Tetris.app/Contents/Resources/island-hook.cjs']);
  const result = islandHookConfig({ hooks: { Stop: [{ hooks: [...known, foreign].map(command => ({ type: 'command', command })) }] } }, helper, script, [main]) as any;
  expect(result.hooks.Stop[0].hooks.map((hook: any) => hook.command)).toEqual([command(routedHookArgv(helper, script)), foreign]);
  expect(islandHookConfig(result, helper, script, [main])).toEqual(result);
});

test('invalid hook containers fail without mutating the source', () => {
  for (const source of [null, [], { hooks: [] }, { hooks: { Stop: {} } }]) {
    const before = structuredClone(source);
    expect(() => islandHookConfig(source, '/runtime', '/script')).toThrow(); expect(source).toEqual(before);
  }
});
