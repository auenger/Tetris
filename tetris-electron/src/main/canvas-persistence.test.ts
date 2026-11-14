import { test, expect, mock } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const directory = mkdtempSync(join(tmpdir(), 'tetris-canvas-scope-'));
mock.module('./paths', () => ({ COLLAB_DIR: directory }));
const { loadState, saveState } = await import('./canvas-persistence');

test('splits only known agent tiles, keeps IDE layout and saves scopes independently', async () => {
  const legacy = { version: 1, tiles: [
    { id: 'ide', type: 'note', x: 12, y: 34, width: 400, height: 500 },
    { id: 'worker', type: 'agent', agentSessionId: 's', x: 800, y: 0, width: 460, height: 540 },
    { id: 'report', type: 'note', filePath: '/demo/immutable-report.md', x: 1400, y: 0, width: 460, height: 540 },
  ], viewport: { centerX: 30, centerY: 50, zoom: .8 }, groups: [{ id: 'g', name: 'test', tileIds: ['worker', 'report'] }],
  taskLinks: [{ key: 'r', sourceTileId: 'worker', targetTileId: 'report', color: '#fff' }] };
  writeFileSync(join(directory, 'canvas-state.json'), JSON.stringify(legacy));
  const [ide, agent] = await Promise.all([loadState(), loadState('agent:live')]);
  expect(ide?.tiles.map(t => t.id)).toEqual(['ide']);
  expect(ide?.viewport).toEqual(legacy.viewport);
  expect(agent?.tiles.map(t => t.id)).toEqual(['worker', 'report']);
  expect(agent?.groups?.[0]?.tileIds).toEqual(['worker', 'report']);
  expect(existsSync(join(directory, 'canvas-state.json.before-agent-split'))).toBe(true);
  const ideBytes = readFileSync(join(directory, 'canvas-state.json'), 'utf8');
  await saveState({ ...agent!, viewport: { zoom: .7, panX: 19, panY: 42 } }, 'agent:live');
  expect(readFileSync(join(directory, 'canvas-state.json'), 'utf8')).toBe(ideBytes);
  expect((await loadState('agent:live'))?.tiles.length).toBe(2);
  await expect(saveState(agent!, '../escape')).rejects.toThrow('Invalid persistent canvas scope');
  await Promise.all([
    saveState({ ...agent!, selectedTileId: 'worker' }, 'agent:live'),
    saveState({ ...agent!, selectedTileId: 'report' }, 'agent:live'),
  ]);
  expect((await loadState('agent:live'))?.selectedTileId).toBe('report');
  writeFileSync(join(directory, 'agent-canvas-state.json'), '{broken');
  await expect(loadState('agent:live')).rejects.toThrow();
  await expect(saveState(agent!, 'agent:live')).rejects.toThrow('autosave is disabled');
  expect(readFileSync(join(directory, 'agent-canvas-state.json'), 'utf8')).toBe('{broken');
  rmSync(directory, { recursive: true, force: true });
});
