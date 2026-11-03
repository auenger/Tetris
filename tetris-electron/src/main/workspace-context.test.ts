import { test, expect } from 'bun:test';
import { workspaceContext } from './workspace-context';
test('selection expands its group; fallback excludes other directories', () => {
  const snapshot = { selectedTileIds: ['a'], groups: [{ id: 'g', name: 'Login', tileIds: ['a', 'b'] }], tiles: [
    { id: 'a', type: 'code', filePath: '/project/a', secretOutput: 'not context' },
    { id: 'b', type: 'browser', url: 'http://localhost:3000' },
    { id: 'c', type: 'code', filePath: '/project-other/c' },
  ] };
  const selection = workspaceContext('/project', snapshot);
  expect(selection.scope).toBe('group');
  expect(selection.tiles.map(tile => tile.id)).toEqual(['a', 'b']);
  expect(JSON.stringify(selection)).not.toContain('secretOutput');
  expect(workspaceContext('/project', { ...snapshot, selectedTileIds: [] }).tiles.map(tile => tile.id)).toEqual(['a']);
});
