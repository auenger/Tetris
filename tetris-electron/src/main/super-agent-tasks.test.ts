import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SuperAgentTasks } from './super-agent-tasks';
test('persists follow-ups and marks interrupted work without replay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-tasks-'));
  try {
    const path = join(dir, 'tasks.json');
    const store = new SuperAgentTasks(path);
    const id = store.start('s', '/project', 'Implement login', { selectedTileIds: ['a'] });
    expect(() => store.start('s', '/project', 'duplicate', {})).toThrow('already running');
    store.finish(id, 'ready_for_review');
    store.setHandoff(id, { provider: 'codex', status: 'starting' });
    store.start('s', '/project', 'Follow up', {});
    const restored = new SuperAgentTasks(path);
    expect(restored.list('/project')[0]!.runs.map(r => r.status)).toEqual(['ready_for_review', 'interrupted']);
    expect(restored.list('/other')).toEqual([]);
    expect(restored.list('/project')[0]!.runs[0]!.handoff?.status).toBe('failed');
    const copy = restored.list(); copy[0]!.title = 'mutated';
    expect(restored.list()[0]!.title).toBe('Implement login');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('does not overwrite corrupted data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-tasks-'));
  try {
    const path = join(dir, 'tasks.json'); writeFileSync(path, '{broken');
    expect(() => new SuperAgentTasks(path)).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
