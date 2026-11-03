import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
export interface ContextTile {
  id: string; type: string; filePath?: string; folderPath?: string; cwd?: string;
  url?: string; userTitle?: string; agentTitle?: string;
}
export interface WorkspaceContext {
  cwd: string; scope: 'selection' | 'group' | 'focus' | 'workspace';
  selectedTileIds: string[]; tiles: ContextTile[];
  groups: Array<{ id: string; name: string; tileIds: string[] }>;
}
/** Compact reference index; never includes terminal output or file contents. */
export function workspaceContext(cwd: string, raw: any): WorkspaceContext {
  const tiles: ContextTile[] = Array.isArray(raw?.tiles) ? raw.tiles : [];
  const groups: WorkspaceContext['groups'] = Array.isArray(raw?.groups) ? raw.groups : [];
  const selected = new Set<string>(Array.isArray(raw?.selectedTileIds) ? raw.selectedTileIds : []);
  let scope: WorkspaceContext['scope'] = 'workspace';
  let included: ContextTile[];
  if (selected.size) {
    scope = 'selection';
    for (const group of groups) if (group.tileIds.some(id => selected.has(id))) {
      group.tileIds.forEach(id => selected.add(id)); scope = 'group';
    }
    included = tiles.filter(tile => selected.has(tile.id));
  } else if (tiles.some(tile => tile.id === raw?.focusedTileId)) {
    scope = 'focus';
    const group = groups.find(group => group.tileIds.includes(raw.focusedTileId));
    included = tiles.filter(tile => group ? group.tileIds.includes(tile.id) : tile.id === raw.focusedTileId);
    if (group) scope = 'group';
  } else {
    included = tiles.filter(tile => {
      const path = tile.filePath || tile.folderPath || tile.cwd;
      if (!path) return false;
      let canonical = path;
      try { canonical = realpathSync(path); } catch { /* Deleted resources retain their last known path. */ }
      const rel = relative(cwd, canonical);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
  }
  const ids = new Set(included.map(tile => tile.id));
  return { cwd, scope, selectedTileIds: [...selected].filter(id => ids.has(id)),
    tiles: included.map(({ id, type, filePath, folderPath, cwd, url, userTitle, agentTitle }) =>
      ({ id, type, ...(filePath ? { filePath } : {}), ...(folderPath ? { folderPath } : {}), ...(cwd ? { cwd } : {}), ...(url ? { url } : {}), ...(userTitle ? { userTitle } : {}), ...(agentTitle ? { agentTitle } : {}) })),
    groups: groups.filter(group => group.tileIds.some(id => ids.has(id))).map(group => ({ id: group.id, name: group.name, tileIds: group.tileIds.filter(id => ids.has(id)) })),
  };
}
