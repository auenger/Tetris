import { createTaskEffects } from './task-effects.js';
import { createEventReplay } from './task-event-replay.js';
import { enhanceSelect } from '../../../shared/ui/select-control.js';

export const AGENT_CANVAS_ID = 'agent:live';
/** Independent canvas store. Never imports or mutates the IDE canvas-state singleton. */
export function createAgentCanvas({ host, configs, getSource, onShow, onViewChanged = () => {} }) {
  const tiles = new Map(), doms = new Map(), groups = new Map(), groupDoms = new Map();
  let filter = {}, spaceHeld = false;
  const viewport = { panX: 40, panY: 70, zoom: 1 };
  let selected = null, visible = false, saveTimer, replay = null, restoring = true, storageError = null;
  const stage = document.createElement('section'); stage.className = 'agent-canvas'; stage.dataset.canvasId = AGENT_CANVAS_ID; stage.hidden = true; stage.tabIndex = -1;
  const toolbar = document.createElement('header'); toolbar.className = 'agent-canvas-toolbar';
  toolbar.setAttribute('aria-label', '任务画布筛选');
  const filterLabel = document.createElement('label'); filterLabel.className = 'agent-project-filter';
  const filterIcon = document.createElement('span'); filterIcon.setAttribute('aria-hidden', 'true');
  filterIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/></svg>';
  const controls = document.createElement('div'); controls.className = 'agent-canvas-controls'; controls.setAttribute('role', 'toolbar'); controls.setAttribute('aria-label', '画布视图');
  const home = document.createElement('button'); home.type = 'button'; home.setAttribute('aria-label', '适应全部任务'); home.dataset.tooltip = '适应全部任务';
  home.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
  home.onclick = () => { filter = {}; redraw(); fit([...tiles.keys()]); save(); };
  const zoomLabel = document.createElement('span'); zoomLabel.className = 'agent-canvas-zoom'; zoomLabel.setAttribute('aria-label', '画布缩放');
  controls.append(home, zoomLabel);
  const projectFilter = document.createElement('select'); projectFilter.setAttribute('aria-label', '画布项目筛选');
  projectFilter.onchange = () => { filter = { cwd: projectFilter.value }; redraw(); save(); };
  filterLabel.append(filterIcon, projectFilter); toolbar.append(filterLabel);
  const layer = document.createElement('div'); layer.className = 'agent-canvas-layer';
  const empty = document.createElement('div'); empty.className = 'agent-canvas-empty'; empty.textContent = '与 Tetris Agent 对话，任务将在这里展开。';
  stage.append(layer, empty, toolbar, controls); host.append(stage);
  const projectSelect = enhanceSelect(projectFilter, { variant: 'ghost' });
  const effects = createTaskEffects(id => doms.get(id)?.container, getSource, save, { layer, isVisible: () => visible && !replay });
  function snapshot() { return { version: 1, canvasId: AGENT_CANVAS_ID, tiles: [...tiles.values()], viewport: { ...viewport }, selectedTileId: selected, groups: [...groups.values()], filter, taskLinks: effects.getLinks() }; }
  function save() {
    if (restoring || storageError) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(() => window.shellApi.canvasSaveState(snapshot(), AGENT_CANVAS_ID).catch(console.error), 160);
  }
  function redraw() {
    layer.style.transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;
    stage.style.backgroundPosition = `${viewport.panX}px ${viewport.panY}px`;
    stage.style.backgroundSize = `${24 * viewport.zoom}px ${24 * viewport.zoom}px`;
    let count = 0;
    const directories = [...new Set([...tiles.values()].map(t => t.cwd).filter(Boolean))];
    projectFilter.replaceChildren(new Option('全部项目', ''), ...directories.map(cwd => new Option(cwd.split('/').at(-1), cwd)));
    projectFilter.value = filter.cwd || '';
    for (const option of projectFilter.options) option.title = option.value || option.label;
    projectSelect.refresh();
    toolbar.hidden = directories.length < 2 && !filter.cwd;
    zoomLabel.textContent = `${Math.round(viewport.zoom * 100)}%`;
    home.disabled = !tiles.size;
    for (const [id, tile] of tiles) {
      const hidden = !!((filter.cwd && tile.cwd !== filter.cwd) || (filter.taskIds?.length && !filter.taskIds.includes(tile.taskId)));
      doms.get(id).container.hidden = hidden; if (!hidden) count++;
    }
    for (const [id, group] of groups) {
      const items = group.tileIds.map(key => tiles.get(key)).filter(t => t && !doms.get(t.id).container.hidden);
      let frame = groupDoms.get(id);
      if (!frame) { frame = document.createElement('div'); frame.className = 'agent-task-group'; layer.prepend(frame); groupDoms.set(id, frame); }
      frame.hidden = !items.length;
      if (items.length) {
        const left = Math.min(...items.map(t => t.x)), top = Math.min(...items.map(t => t.y));
        Object.assign(frame.style, { left: `${left - 18}px`, top: `${top - 36}px`, width: `${Math.max(...items.map(t => t.x + t.width)) - left + 36}px`, height: `${Math.max(...items.map(t => t.y + t.height)) - top + 54}px` });
        frame.textContent = group.name;
      }
    }
    empty.hidden = !storageError && count > 0;
    effects.refresh(); onViewChanged();
  }
  function place(width, height) {
    for (let y = 0; y < 5000; y += 40) for (let x = 0; x < 5000; x += 40) {
      if (![...tiles.values()].some(t => x < t.x + t.width + 100 && x + width + 100 > t.x && y < t.y + t.height + 100 && y + height + 100 > t.y)) return { x, y };
    }
    return { x: Math.max(0, ...[...tiles.values()].map(t => t.x + t.width)) + 100, y: 0 };
  }
  function select(id, activate = true) {
    if (!tiles.has(id)) return;
    selected = id;
    for (const [key, dom] of doms) dom.container.classList.toggle('is-selected', key === id);
    effects.selectTile(id); onViewChanged(); if (activate) doms.get(id)?.webview?.focus(); save();
  }
  function fit(ids) {
    const items = ids.map(id => tiles.get(id)).filter(Boolean); if (!items.length) return;
    const left = Math.min(...items.map(t => t.x)), top = Math.min(...items.map(t => t.y));
    const right = Math.max(...items.map(t => t.x + t.width)), bottom = Math.max(...items.map(t => t.y + t.height));
    viewport.zoom = Math.max(.25, Math.min(1, (stage.clientWidth - 100) / (right - left), (stage.clientHeight - 120) / (bottom - top)));
    viewport.panX = (stage.clientWidth - (right - left) * viewport.zoom) / 2 - left * viewport.zoom;
    viewport.panY = 65 + (stage.clientHeight - 100 - (bottom - top) * viewport.zoom) / 2 - top * viewport.zoom;
    redraw(); save();
  }
  function remove(id) { doms.get(id)?.container.remove(); doms.delete(id); tiles.delete(id); if (selected === id) selected = null; for (const [key, group] of groups) { group.tileIds = group.tileIds.filter(tileId => tileId !== id); if (!group.tileIds.length) { groups.delete(key); groupDoms.get(key)?.remove(); groupDoms.delete(key); } } redraw(); save(); }
  function create(data) {
    const tile = { id: `agent-${crypto.randomUUID()}`, width: 460, height: 540, ...data, canvasId: AGENT_CANVAS_ID };
    if (!Number.isFinite(tile.x) || !Number.isFinite(tile.y)) Object.assign(tile, place(tile.width, tile.height));
    tiles.set(tile.id, tile);
    const container = document.createElement('article'); container.className = 'agent-canvas-tile'; container.dataset.tileId = tile.id;
    Object.assign(container.style, { left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.width}px`, height: `${tile.height}px` });
    const header = document.createElement('header'), title = document.createElement('span'), close = document.createElement('button');
    title.textContent = tile.userTitle || tile.filePath?.split('/').at(-1) || 'Worker';
    close.textContent = '×'; close.title = '关闭视图（任务继续运行）'; close.onclick = () => remove(tile.id);
    header.append(title, close);
    const content = document.createElement('div'); content.className = 'agent-tile-content';
    const webview = document.createElement('webview');
    const config = tile.type === 'agent' ? configs.agentChat : configs.viewer;
    const query = tile.type === 'agent' ? new URLSearchParams({ mode: 'worker', sessionId: tile.agentSessionId, cwd: tile.cwd || '' })
      : new URLSearchParams({ tilePath: tile.filePath, tileMode: tile.type });
    webview.setAttribute('src', `${config.src}?${query}`); webview.setAttribute('preload', config.preload);
    webview.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=yes');
    const cover = document.createElement('div'); cover.className = 'agent-tile-cover';
    cover.addEventListener('mousedown', e => { if (spaceHeld || e.button === 1) return; e.preventDefault(); e.stopPropagation(); select(tile.id); });
    webview.addEventListener('focus', () => { if (selected !== tile.id) select(tile.id, false); });
    webview.addEventListener('console-message', e => window.shellApi.logFromWebview('agent-canvas', e.level, e.message, e.sourceId));
    const resize = document.createElement('div'); resize.className = 'agent-tile-resize';
    resize.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); resize.setPointerCapture(e.pointerId);
      const width = tile.width, height = tile.height, x = e.clientX, y = e.clientY;
      const move = event => { tile.width = Math.max(280, width + (event.clientX - x) / viewport.zoom); tile.height = Math.max(240, height + (event.clientY - y) / viewport.zoom); container.style.width = `${tile.width}px`; container.style.height = `${tile.height}px`; redraw(); };
      const up = () => { resize.removeEventListener('pointermove', move); save(); };
      resize.addEventListener('pointermove', move); resize.addEventListener('pointerup', up, { once: true });
    });
    content.append(webview, cover); container.append(header, content, resize); layer.append(container);
    doms.set(tile.id, { container, webview });
    header.addEventListener('dblclick', () => { fit([tile.id]); select(tile.id); });
    header.addEventListener('pointerdown', e => {
      if (e.target === close || e.button !== 0 || spaceHeld) return;
      e.preventDefault(); e.stopPropagation(); select(tile.id, false); header.setPointerCapture(e.pointerId);
      const ox = tile.x, oy = tile.y, sx = e.clientX, sy = e.clientY;
      const move = event => { tile.x = ox + (event.clientX - sx) / viewport.zoom; tile.y = oy + (event.clientY - sy) / viewport.zoom; container.style.left = `${tile.x}px`; container.style.top = `${tile.y}px`; redraw(); };
      const up = () => { header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', up); save(); };
      header.addEventListener('pointermove', move); header.addEventListener('pointerup', up, { once: true });
    });
    redraw(); save(); return tile;
  }
  function worker(params) {
    const workers = [...tiles.values()].filter(tile => tile.type === 'agent');
    const compatible = tile => !params.taskId || !tile.taskId || tile.taskId === params.taskId;
    const byId = params.tileId ? tiles.get(params.tileId) : null;
    const tile = (params.taskId && workers.find(tile => tile.taskId === params.taskId))
      || (byId?.type === 'agent' && compatible(byId) && (params.taskId || byId.agentSessionId === params.sessionId) ? byId : null)
      || workers.find(tile => tile.agentSessionId === params.sessionId && compatible(tile));
    if (!tile) return create({ type: 'agent', agentSessionId: params.sessionId, cwd: params.cwd, userTitle: params.userTitle || params.title, provider: params.provider, taskId: params.taskId });
    const previousSessionId = tile.agentSessionId, previousCwd = tile.cwd;
    for (const [key, value] of Object.entries({ agentSessionId: params.sessionId, cwd: params.cwd, provider: params.provider, taskId: params.taskId, userTitle: params.userTitle || params.title })) if (value !== undefined) tile[key] = value;
    const dom = doms.get(tile.id);
    dom.container.querySelector('header span').textContent = tile.userTitle || 'Worker';
    if (previousSessionId !== tile.agentSessionId || previousCwd !== tile.cwd) {
      const query = new URLSearchParams({ mode: 'worker', sessionId: tile.agentSessionId, cwd: tile.cwd || '' });
      dom.webview.setAttribute('src', `${configs.agentChat.src}?${query}`);
      effects.rebindSession(tile.id, previousSessionId, tile.agentSessionId);
    }
    redraw(); save(); return tile;
  }
  function show() { visible = true; stage.hidden = false; document.body.classList.add('agent-page-open'); onShow?.(); redraw(); }
  function hide() { replay?.pause(); spaceHeld = false; stage.classList.remove('is-panning', 'shift-held'); visible = false; stage.hidden = true; document.body.classList.remove('agent-page-open'); effects.refresh(); onViewChanged(); }
  stage.addEventListener('wheel', e => {
    if (replay) return;
    e.preventDefault(); e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      const rect = stage.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, prior = viewport.zoom;
      viewport.zoom = Math.max(.25, Math.min(2, prior * Math.exp(-e.deltaY * .004)));
      viewport.panX = x - (x - viewport.panX) * viewport.zoom / prior; viewport.panY = y - (y - viewport.panY) * viewport.zoom / prior;
    } else { viewport.panX -= e.deltaX; viewport.panY -= e.deltaY; }
    redraw(); save();
  }, { passive: false });
  // Guest wheel events remain in the webview; the host listener only sees blank canvas/headers.
  stage.addEventListener('mousedown', e => e.stopPropagation());
  stage.addEventListener('pointerdown', e => {
    if (replay) return;
    if (!(e.button === 1 || (e.button === 0 && spaceHeld))) return;
    e.preventDefault(); e.stopPropagation(); stage.setPointerCapture(e.pointerId);
    const x = e.clientX, y = e.clientY, px = viewport.panX, py = viewport.panY;
    const move = event => { viewport.panX = px + event.clientX - x; viewport.panY = py + event.clientY - y; redraw(); };
    const up = () => { stage.removeEventListener('pointermove', move); save(); };
    stage.addEventListener('pointermove', move); stage.addEventListener('pointerup', up, { once: true });
  });
  const key = e => {
    if (!visible || replay || e.target.closest?.('input,textarea,select,button,[role="combobox"],.tetris-dropdown')) return;
    if (e.code === 'Space') { spaceHeld = e.type === 'keydown'; stage.classList.toggle('is-panning', spaceHeld); e.preventDefault(); e.stopImmediatePropagation(); }
    if (e.key === 'Shift') stage.classList.toggle('shift-held', e.type === 'keydown');
  };
  window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true);
  const observer = new ResizeObserver(redraw); observer.observe(stage);
  const ready = window.shellApi.canvasLoadState(AGENT_CANVAS_ID).then(state => {
    if (state?.tiles) for (const tile of state.tiles) create(tile);
    if (state?.groups) for (const group of state.groups) groups.set(group.id, group);
    filter = state?.filter || {};
    if (state?.viewport) Object.assign(viewport, { panX: state.viewport.panX ?? 40, panY: state.viewport.panY ?? 70, zoom: state.viewport.zoom || 1 });
    selected = state?.selectedTileId || null;
    if (selected) select(selected, false);
    effects.restore(state?.taskLinks || []); restoring = false; redraw();
  }).catch(error => { storageError = error; empty.hidden = false; empty.textContent = `任务画布读取失败：${error.message || error}。原数据已保留。`; console.error(error); });
  async function handle(request) {
    await ready;
    const { method, params = {} } = request;
    if (storageError && method !== 'pageOpen') throw storageError;
    let result;
    switch (method) {
      case 'pageOpen': show(); result = {}; break;
      case 'workerTile': result = { tileId: worker(params).id, canvasId: AGENT_CANVAS_ID }; break;
      case 'tileCreate': {
        const type = params.tileType || 'note';
        if (!['note', 'image', 'pdf'].includes(type) || typeof params.filePath !== 'string') throw new Error('Agent 画布只接受 worker 和文档、图片、PDF 产物视图');
        const userTitle = params.userTitle || params.title;
        const tile = [...tiles.values()].find(t => t.type === type && t.filePath === params.filePath) || create({ type, filePath: params.filePath, taskId: params.taskId, userTitle });
        if (userTitle) { tile.userTitle = userTitle; doms.get(tile.id).container.querySelector('header span').textContent = userTitle; save(); }
        result = { tileId: tile.id, canvasId: AGENT_CANVAS_ID }; break;
      }
      case 'tileFocus':
        if (params.activate !== false) { replay?.destroy(); show(); }
        if (!replay && visible) { filter = {}; redraw(); fit(params.tileIds || []); }
        if (params.activate !== false && params.tileIds?.[0]) select(params.tileIds[0]);
        result = {}; break;
      case 'taskVisual': effects.event(params); result = {}; break;
      case 'taskGroup': {
        const ids = (params.tileIds || []).filter(id => tiles.has(id));
        if (!ids.length) throw new Error('没有可分组的 Agent tiles');
        const groupId = params.taskId || `group:${ids[0]}`;
        const prior = groups.get(groupId);
        const tileIds = [...new Set([...(prior?.tileIds || []), ...ids])];
        groups.set(groupId, { id: groupId, name: params.title || prior?.name || '任务', tileIds });
        const workerTile = tileIds.map(id => tiles.get(id)).find(t => t.type === 'agent');
        for (const id of tileIds) { const tile = tiles.get(id); if (tile) { tile.taskId ||= params.taskId; tile.cwd ||= workerTile?.cwd; } }
        redraw(); save(); result = { groupId }; break;
      }
      case 'taskFilter': filter = { cwd: params.cwd, taskIds: params.taskIds }; redraw(); save(); result = {}; break;
      case 'tileRemove': remove(params.tileId); result = {}; break;
      case 'tileMove': { const tile = tiles.get(params.tileId); if (!tile) throw new Error('Tile 不存在'); Object.assign(tile, params.position); const dom = doms.get(tile.id); dom.container.style.left = `${tile.x}px`; dom.container.style.top = `${tile.y}px`; redraw(); save(); result = {}; break; }
      case 'contextSnapshot': case 'tileList': result = { canvasId: AGENT_CANVAS_ID, visible, replaying: !!replay, tiles: [...tiles.values()], selectedTileIds: visible && !replay && selected ? [selected] : [], focusedTileId: visible && !replay ? selected : null }; break;
      case 'taskReplay':
        show(); replay?.destroy();
        replay = createEventReplay(stage, params, () => { replay = null; effects.refresh(); onViewChanged(); });
        effects.refresh(); onViewChanged(); result = { replayId: replay.id }; break;
      default: throw new Error(`Agent canvas 不支持 ${method}`);
    }
    return result;
  }
  return { handle, show, hide, focus() { if (!replay && selected) doms.get(selected)?.webview?.focus(); else stage.focus(); }, shortcut(action) {
    if (action === 'close-tile') { if (replay) replay.destroy(); else if (selected) remove(selected); stage.focus(); return true; }
    if (action === 'toggle-fullscreen-tile') { if (!replay && selected) fit([selected]); return true; }
    if (action.startsWith('focus-tile-')) {
      if (replay) return true;
      const direction = action.slice('focus-tile-'.length), current = tiles.get(selected);
      const cx = current ? current.x + current.width / 2 : (stage.clientWidth / 2 - viewport.panX) / viewport.zoom;
      const cy = current ? current.y + current.height / 2 : (stage.clientHeight / 2 - viewport.panY) / viewport.zoom;
      const candidates = [...tiles.values()].filter(tile => tile.id !== selected && !doms.get(tile.id).container.hidden).map(tile => ({ tile, dx: tile.x + tile.width / 2 - cx, dy: tile.y + tile.height / 2 - cy }));
      const target = candidates.filter(({ dx, dy }) => direction === 'right' ? dx > 0 : direction === 'left' ? dx < 0 : direction === 'down' ? dy > 0 : dy < 0).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0]?.tile;
      if (target) { fit([target.id]); select(target.id); } return true;
    }
    return false;
  }, viewState() {
    const viewportRect = stage.getBoundingClientRect();
    const taskIds = visible && !replay ? [...tiles.values()].filter(tile => {
      const element = doms.get(tile.id)?.container; if (!tile.taskId || !element || element.hidden) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom > viewportRect.top + 50 && rect.top < viewportRect.bottom && rect.right > viewportRect.left && rect.left < viewportRect.right;
    }).map(tile => tile.taskId) : [];
    return { visible, replaying: !!replay, taskIds: [...new Set(taskIds)] };
  }, pinch(deltaY) {
    if (replay) return;
    const prior = viewport.zoom, x = stage.clientWidth / 2, y = stage.clientHeight / 2;
    viewport.zoom = Math.max(.25, Math.min(2, prior * Math.exp(-deltaY * .004)));
    viewport.panX = x - (x - viewport.panX) * viewport.zoom / prior; viewport.panY = y - (y - viewport.panY) * viewport.zoom / prior;
    redraw(); save();
  }, refresh: () => effects.refresh(), ready, isVisible: () => visible, getWebviews: () => [...doms.values()].map(dom => ({ webview: dom.webview })), snapshot,
    destroy() { clearTimeout(saveTimer); replay?.destroy(); projectSelect.destroy(); effects.destroy(); observer.disconnect(); window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true); stage.remove(); } };
}
