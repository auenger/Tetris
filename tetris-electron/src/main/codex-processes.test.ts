import { test, expect } from 'bun:test';
import { parseProcesses, discoverCodex } from './codex-processes';
test('discovers only current-user CLI and excludes desktop services and helpers', () => {
  const rows = parseProcesses(`501 10 1 /bin/zsh
501 11 10 /usr/local/bin/codex
501 12 11 /usr/local/bin/codex-code-mode-host
501 13 1 /Applications/ChatGPT.app/Contents/MacOS/codex
502 14 1 /usr/local/bin/codex
501 15 1 /usr/local/bin/codex
501 16 1 /usr/local/bin/node`, 501, '15 codex app-server');
  expect(discoverCodex(rows, [{pid:10,sessionId:'terminal',displayName:'Project',cwdHostPath:'/project'}]))
    .toEqual([{pid:11,sessionId:'terminal',name:'project',cwd:'/project'}]);
});
test('deduplicates nested codex and handles cycles, external processes and exits', () => {
  const rows = parseProcesses('501 10 1 /bin/codex\n501 11 10 /bin/codex\n501 20 21 /bin/zsh\n501 21 20 /bin/codex', 501);
  expect(discoverCodex(rows, []).map(item => item.pid)).toEqual([10,21]);
  expect(discoverCodex([], [])).toEqual([]);
});
test('preserves executable paths with spaces and does not match command text', () => {
  const rows = parseProcesses('501 10 1 /some folder/bin/codex\n501 20 1 /bin/sh',501,'20 sh -c codex');
  expect(discoverCodex(rows, []).map(item => item.pid)).toEqual([10]);
});
test('stopped and zombie agents disappear, sleeping agents remain and resumed agents return', () => {
  const rows = parseProcesses('501 10 1 T+ /bin/codex\n501 11 1 Z /bin/codex\n501 12 1 S+ /some folder/bin/codex\n501 13 1 R+ /bin/codex', 501);
  expect(discoverCodex(rows, []).map(row => row.pid)).toEqual([12, 13]);
  expect(discoverCodex(parseProcesses('501 10 1 S+ /bin/codex', 501), []).map(row => row.pid)).toEqual([10]);
});

test('refresh drops six stale Codex cards even with surviving terminal shells', async () => {
  const {activeIslandRoots} = await import('./codex-processes');
  const sessions = Array.from({length: 7}, (_, i) => ({id: `s${i}`, agent: 'Codex', cwd: '/work'}));
  const terminals = sessions.map((s, i) => ({pid: i + 10, sessionId: s.id, displayName: '', cwdHostPath: s.cwd}));
  const agents = [{pid: 100, sessionId: 's0', name: 'work', cwd: '/work'}];
  expect(activeIslandRoots(sessions, terminals, agents).map(s => s.sessionId)).toEqual(['s0']);
  expect(activeIslandRoots(sessions, terminals, [])).toEqual([]);
  expect(activeIslandRoots([{id: 's1', agent: 'Claude Code', cwd: '/work'}], terminals, agents)).toHaveLength(2);
  expect(activeIslandRoots([{id: 'closed', agent: 'Claude Code', cwd: '/work'}], terminals, [])).toEqual([]);
});
