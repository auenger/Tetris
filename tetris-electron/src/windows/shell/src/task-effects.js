/** Screen-space relationship graph. Borders sit above webviews, never inside them. */
export function createTaskEffects(getTileElement, getSource, onLinksChanged = () => {}, options = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs = {}) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const svg = make('svg', { 'aria-hidden': 'true', class: 'tetris-task-effects' });
  Object.assign(svg.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '9999', overflow: 'hidden' });
  const linksLayer = make('g'), borderLayer = make('g'), flightLayer = make('g');
  svg.append(linksLayer, borderLayer, flightLayer); document.body.append(svg);
  const style = document.createElement('style');
  style.textContent = `
    .tetris-task-border { fill:none; pointer-events:none }
    .tetris-task-border .running-trace { stroke-dasharray:18 32; animation:tetris-task-orbit 2.4s linear infinite }
    @keyframes tetris-task-orbit { to { stroke-dashoffset:-100 } }
    @media(prefers-reduced-motion:reduce){.tetris-task-border .running-trace{animation:none;stroke-dasharray:none}}
  `;
  document.head.append(style);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const links = new Map(), borders = new Map(), running = new Map(), flights = new Map(), flashes = new Map(), seen = new Set();
  let selectedTile = null, frame = 0, destroyed = false;

  function bounds(element, allowOffscreen = false) {
    if (!element?.isConnected || !element.getClientRects().length) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || (!allowOffscreen && (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight))) return null;
    return rect;
  }
  function refresh() { if (!destroyed && !frame) frame = requestAnimationFrame(render); }
  function geometry(link) {
    const source = bounds(link.sourceTileId ? getTileElement(link.sourceTileId) : getSource(link.sourceMessageId, link), true);
    const target = bounds(getTileElement(link.targetTileId), true);
    if (!source || !target) return null;
    const rightward = target.left + target.width / 2 >= source.left + source.width / 2;
    const x = rightward ? source.right : source.left, tx = rightward ? target.left : target.right;
    const y = source.top + (link.sourceTileId ? Math.min(source.height / 2, 70) : source.height / 2), ty = target.top + Math.min(target.height / 2, 70);
    const bend = Math.max(64, Math.abs(tx - x) * .45) * (rightward ? 1 : -1);
    return { d: `M ${x} ${y} C ${x + bend} ${y}, ${tx - bend} ${ty}, ${tx} ${ty}`, x, y, tx, ty };
  }
  function addLink(data) {
    const existing = links.get(data.key);
    if (existing) { Object.assign(existing.data, data); refresh(); return existing; }
    const group = make('g', { class: 'tetris-task-link', 'data-link-id': data.key });
    const halo = make('path', { fill: 'none', 'stroke-width': 5, opacity: .1 });
    const path = make('path', { fill: 'none', 'stroke-width': 1.5, opacity: .5 });
    const start = make('circle', { r: 2.5 }), end = make('circle', { r: 2.5 });
    group.append(halo, path, start, end); linksLayer.append(group);
    const link = { data: { ...data }, group, halo, path, start, end };
    links.set(data.key, link); refresh(); return link;
  }
  function removeLink(key) {
    const link = links.get(key); if (!link) return;
    link.group.remove(); links.delete(key);
    for (const [id, flight] of flights) if (flight.key === key) { flight.group.remove(); flights.delete(id); }
  }
  function pulse(key, reverse = false) {
    if (reduced.matches || document.hidden || options.isVisible?.() === false || flights.size >= 8) return;
    const link = links.get(key); if (!link || !geometry(link.data)) return;
    // Re-clicking the same relationship restarts its emphasis, rather than stacking flights.
    const prior = flights.get(key); prior?.group.remove();
    const group = make('g', { class: 'tetris-task-flight' });
    const trail = make('path', { fill: 'none', stroke: link.data.color, 'stroke-width': 3, 'stroke-linecap': 'round' });
    const glow = make('circle', { r: 8, fill: link.data.color, opacity: .22 });
    const dot = make('circle', { r: 3.5, fill: '#fff', stroke: link.data.color, 'stroke-width': 1.5 });
    group.append(trail, glow, dot); flightLayer.append(group);
    flights.set(key, { key, group, trail, glow, dot, reverse, started: performance.now() }); refresh();
  }
  function emphasize(tileId, color) { flashes.set(tileId, { until: performance.now() + 1600, color }); refresh(); }
  function selectTile(tileId, animate = true) {
    selectedTile = tileId || null;
    for (const [key, { data }] of links) if (data.targetTileId === tileId || data.sourceTileId === tileId) {
      if (animate) { emphasize(tileId, data.color); pulse(key); }
    }
    refresh();
  }
  function render(now) {
    frame = 0; if (destroyed) return;
    svg.style.display = options.isVisible?.() === false ? 'none' : '';
    let changed = false;
    for (const [key, link] of links) {
      const target = getTileElement(link.data.targetTileId);
      const source = link.data.sourceTileId ? getTileElement(link.data.sourceTileId) : null;
      if (!target?.isConnected || (link.data.sourceTileId && !source?.isConnected)) { removeLink(key); changed = true; continue; }
      const shape = geometry(link.data);
      link.group.style.display = shape && !document.hidden ? '' : 'none';
      if (!shape) continue;
      const selected = link.data.targetTileId === selectedTile || link.data.sourceTileId === selectedTile;
      for (const path of [link.path, link.halo]) { path.setAttribute('d', shape.d); path.setAttribute('stroke', link.data.color); }
      link.path.setAttribute('opacity', selected ? '.85' : '.38'); link.path.setAttribute('stroke-width', selected ? '2' : '1.3');
      link.halo.setAttribute('opacity', selected ? '.16' : '.06');
      for (const [dot, x, y] of [[link.start, shape.x, shape.y], [link.end, shape.tx, shape.ty]]) {
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('fill', link.data.color); dot.setAttribute('opacity', selected ? '.9' : '.5');
      }
    }
    if (changed) onLinksChanged();
    const desired = new Map();
    for (const { tileIds, color } of running.values()) for (const tileId of tileIds) desired.set(tileId, { color, running: true });
    for (const { data } of links.values()) if (data.targetTileId === selectedTile || data.sourceTileId === selectedTile) {
      if (!desired.has(selectedTile)) desired.set(selectedTile, { color: data.color, running: false });
    }
    for (const [tileId, flash] of flashes) {
      if (now >= flash.until || reduced.matches) flashes.delete(tileId);
      else if (!desired.has(tileId)) desired.set(tileId, { color: flash.color, running: false });
    }
    for (const [tileId, group] of borders) if (!desired.has(tileId)) { group.remove(); borders.delete(tileId); }
    for (const [tileId, state] of desired) {
      let group = borders.get(tileId);
      if (!group) {
        group = make('g', { class: 'tetris-task-border', 'data-tile-id': tileId });
        group.append(make('rect', { class: 'border-halo', 'stroke-width': 7 }), make('rect', { class: 'border-base', 'stroke-width': 1.5 }), make('rect', { class: 'border-trace', 'stroke-width': 2.5, pathLength: 100 }));
        borderLayer.append(group); borders.set(tileId, group);
      }
      const rect = bounds(getTileElement(tileId));
      group.style.display = rect && !document.hidden ? '' : 'none'; if (!rect) continue;
      const remaining = flashes.get(tileId)?.until - now;
      const emphasis = remaining > 0 ? Math.sin((1 - remaining / 1600) * Math.PI) : 0;
      const [halo, base, trace] = group.children;
      for (const node of group.children) {
        // Numeric viewport geometry avoids SVG percentage/calc sizing and webview occlusion.
        for (const [key, value] of Object.entries({ x: rect.left + 1.5, y: rect.top + 1.5, width: Math.max(0, rect.width - 3), height: Math.max(0, rect.height - 3), rx: 4, stroke: state.color })) node.setAttribute(key, value);
      }
      halo.setAttribute('opacity', .05 + emphasis * .28); halo.setAttribute('stroke-width', 7 + emphasis * 5);
      base.setAttribute('opacity', selectedTile === tileId ? '.65' : '.3');
      trace.classList.toggle('running-trace', state.running);
      trace.setAttribute('opacity', state.running ? '.95' : String(emphasis * .85));
    }
    for (const [id, flight] of flights) {
      const link = links.get(flight.key), shape = link && geometry(link.data);
      const progress = (now - flight.started) / 1600;
      if (!shape || progress >= 1 || reduced.matches || document.hidden) { flight.group.remove(); flights.delete(id); continue; }
      flight.trail.setAttribute('d', shape.d);
      const length = flight.trail.getTotalLength();
      const eased = progress * progress * (3 - 2 * progress);
      const distance = length * (flight.reverse ? 1 - eased : eased);
      const point = flight.trail.getPointAtLength(distance), tail = Math.min(90, length * .22);
      flight.trail.setAttribute('stroke-dasharray', `${tail} ${length + tail}`);
      flight.trail.setAttribute('stroke-dashoffset', String(-(flight.reverse ? distance : Math.max(0, distance - tail))));
      for (const dot of [flight.dot, flight.glow]) { dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y); }
      flight.group.setAttribute('opacity', String(Math.min(1, (1 - progress) * 5)));
    }
    if (flights.size || flashes.size) refresh();
  }
  const observer = new MutationObserver(refresh);
  const tileLayer = options.layer || document.getElementById('tile-layer');
  if (tileLayer) observer.observe(tileLayer, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  const resize = new ResizeObserver(refresh); resize.observe(document.body);
  window.addEventListener('resize', refresh); document.addEventListener('visibilitychange', refresh); reduced.addEventListener('change', refresh);
  return {
    refresh, selectTile,
    rebindSession(tileId, previousSessionId, sessionId) {
      for (const { data } of links.values()) if ((data.targetTileId === tileId || data.sourceTileId === tileId) && data.sessionId === previousSessionId) data.sessionId = sessionId;
      const active = running.get(previousSessionId);
      if (active?.tileIds.includes(tileId)) { running.delete(previousSessionId); running.set(sessionId, active); }
      onLinksChanged(); refresh();
    },
    getLinks: () => [...links.values()].map(link => ({ ...link.data })),
    restore(saved = []) {
      for (const data of Array.isArray(saved) ? saved : []) if (data && typeof data.key === 'string' && typeof data.targetTileId === 'string' && typeof data.color === 'string') addLink(data);
      onLinksChanged(); refresh();
    },
    event({ id, sessionId, tileIds = [], state, color = '#2789c3', sourceMessageId, sourceTileId, reverse = false }) {
      if (id && seen.has(id)) return;
      if (id) { seen.add(id); if (seen.size > 256) seen.delete(seen.values().next().value); }
      if (state === 'running' || state === 'resume') running.set(sessionId, { tileIds, color });
      else if (state === 'finished' || state === 'waiting') running.delete(sessionId);
      if (['running', 'focus', 'delivery'].includes(state)) {
        for (const tileId of tileIds.slice(0, 4)) {
          const existingWorkerLink = !sourceTileId && [...links].find(([, link]) => !link.data.sourceTileId && link.data.targetTileId === tileId);
          const key = sourceTileId ? `report:${sourceTileId}:${tileId}` : existingWorkerLink?.[0] || `worker:${sessionId || sourceMessageId || 'panel'}:${tileId}`;
          addLink({ key, sessionId, sourceTileId, sourceMessageId, targetTileId: tileId, color });
          emphasize(tileId, color); pulse(key, reverse);
        }
        if (state !== 'delivery' || !reverse) selectedTile = tileIds[0] || selectedTile;
        onLinksChanged();
      }
      refresh();
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      window.removeEventListener('resize', refresh); document.removeEventListener('visibilitychange', refresh); reduced.removeEventListener('change', refresh);
      links.clear(); borders.clear(); running.clear(); flights.clear(); flashes.clear(); seen.clear(); svg.remove(); style.remove();
    },
  };
}
