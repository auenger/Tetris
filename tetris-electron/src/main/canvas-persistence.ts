import { readFile, writeFile, rename, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as crypto from "node:crypto";
import { COLLAB_DIR } from "./paths";

const STATE_DIR = COLLAB_DIR;
const STATE_FILE = join(STATE_DIR, "canvas-state.json");
const unreadableScopes = new Set<string>();

interface TileState {
  id: string;
  type: "term" | "note" | "code" | "image" | "pdf" | "graph" | "browser" | "agent";
  agentSessionId?: string;
  provider?: 'claude' | 'codex';
  x: number;
  y: number;
  width: number;
  height: number;
  filePath?: string;
  folderPath?: string;
  url?: string | null;
  workspacePath?: string;
  ptySessionId?: string;
  cwd?: string;
  userTitle?: string;
  agentTitle?: string;
  autoTitle?: string;
  zIndex: number;
}

interface CanvasState {
  canvasId?: string;
  selectedTileId?: string | null;
  version: 1;
  tiles: TileState[];
  taskLinks?: Array<{ key: string; sessionId?: string; sourceTileId?: string; sourceMessageId?: string; targetTileId: string; color: string }>;
  groups?: Array<{ id: string; name: string; tileIds: string[]; collapsed: boolean; frame?: { x: number; y: number; width: number; height: number } }>;
  viewport: {
    centerX?: number;
    centerY?: number;
    panX?: number;
    panY?: number;
    zoom: number;
  };
}

function sanitizeCoord(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function loadState(canvasId = "ide:default"): Promise<CanvasState | null> {
  try { await migrateLegacyAgentTiles(); } catch (error) {
    unreadableScopes.add('ide:default');
    unreadableScopes.add('agent:live');
    throw error;
  }
  try {
    const raw = await readFile(stateFile(canvasId), "utf-8");
    const state = JSON.parse(raw) as CanvasState;
    if (state.version !== 1 || !Array.isArray(state.tiles)) throw new Error('Unsupported or damaged canvas state');
    for (const tile of state.tiles) {
      tile.x = sanitizeCoord(tile.x);
      tile.y = sanitizeCoord(tile.y);
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    unreadableScopes.add(canvasId);
    throw error;
  }
}

const writes = new Map<string, Promise<void>>();
export async function saveState(state: CanvasState, canvasId = "ide:default"): Promise<void> {
  const destination = stateFile(canvasId);
  if (unreadableScopes.has(canvasId)) throw new Error('Canvas state could not be loaded; autosave is disabled to preserve the original data');
  const json = JSON.stringify({ ...state, canvasId }, null, 2);
  const pending = (writes.get(canvasId) || Promise.resolve()).catch(() => {}).then(async () => {
    await mkdir(STATE_DIR, { recursive: true });
    const tmp = `${destination}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, json, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, destination);
  });
  writes.set(canvasId, pending);
  try { await pending; } finally { if (writes.get(canvasId) === pending) writes.delete(canvasId); }
}

function stateFile(canvasId: string): string {
  if (canvasId === 'agent:live') return join(STATE_DIR, 'agent-canvas-state.json');
  if (canvasId === 'ide:default') return STATE_FILE;
  if (!/^ide:[a-zA-Z0-9_-]{1,120}$/.test(canvasId)) throw new Error('Invalid persistent canvas scope');
  return join(STATE_DIR, `canvas-${canvasId.slice(4)}.json`);
}
let migration: Promise<void> | undefined;
/** Only known worker tiles and reports directly linked to them leave the legacy IDE canvas. */
function migrateLegacyAgentTiles(): Promise<void> {
  return migration ||= (async () => {
    const marker = join(STATE_DIR, 'agent-canvas-migrated');
    if (existsSync(marker) || !existsSync(STATE_FILE)) return;
    const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as CanvasState;
    const workers = new Set(state.tiles.filter(t => t.type === 'agent' && t.agentSessionId).map(t => t.id));
    const moved = new Set(workers);
    for (const link of state.taskLinks || []) if (link.sourceTileId && workers.has(link.sourceTileId) && state.tiles.some(t => t.id === link.targetTileId && t.type === 'note' && t.filePath)) moved.add(link.targetTileId);
    if (moved.size) {
      if (!existsSync(`${STATE_FILE}.before-agent-split`)) await copyFile(STATE_FILE, `${STATE_FILE}.before-agent-split`);
      let agent: CanvasState = { version: 1, tiles: [], viewport: { panX: 40, panY: 70, zoom: 1 } };
      try { agent = JSON.parse(await readFile(stateFile('agent:live'), 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const known = new Set(agent.tiles.map(t => t.id));
      agent.tiles.push(...state.tiles.filter(t => moved.has(t.id) && !known.has(t.id)));
      const links = new Map((agent.taskLinks || []).map(l => [l.key, l]));
      for (const link of state.taskLinks || []) if (moved.has(link.targetTileId)) links.set(link.key, link);
      agent.taskLinks = [...links.values()];
      const groups = new Map((agent.groups || []).map(group => [group.id, group]));
      for (const group of state.groups || []) {
        const tileIds = group.tileIds.filter(id => moved.has(id));
        if (tileIds.length) groups.set(group.id, { ...group, tileIds: [...new Set([...(groups.get(group.id)?.tileIds || []), ...tileIds])] });
      }
      agent.groups = [...groups.values()];
      await saveState(agent, 'agent:live'); // Write destination first, making retries idempotent.
      state.tiles = state.tiles.filter(t => !moved.has(t.id));
      state.taskLinks = (state.taskLinks || []).filter(l => !moved.has(l.targetTileId) && !moved.has(l.sourceTileId || ''));
      state.groups = (state.groups || []).map(g => ({ ...g, tileIds: g.tileIds.filter(id => !moved.has(id)) })).filter(g => g.tileIds.length);
      await saveState(state);
    }
    await writeFile(marker, '1', { mode: 0o600 });
  })();
}
