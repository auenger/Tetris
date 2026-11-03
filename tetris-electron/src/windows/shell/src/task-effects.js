/** Event-driven SVG overlay in viewport coordinates, independent of canvas zoom. */
export function createTaskEffects(getTileElement, getSource) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  Object.assign(svg.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '9999', overflow: 'hidden' });
  svg.setAttribute('aria-hidden', 'true');
  document.body.append(svg);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const flights = new Map();
  const running = new Map();
  const style = document.createElement('style');
  style.textContent = '.tetris-task-border{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:20}.tetris-task-border rect{fill:none;stroke:var(--task-color);stroke-width:2;stroke-dasharray:12 6;animation:tetris-task-flow 1.5s linear infinite}@keyframes tetris-task-flow{to{stroke-dashoffset:-36}}@media(prefers-reduced-motion:reduce){.tetris-task-border rect{animation:none;stroke-dasharray:none}}';
  document.head.append(style);
  function bounds(element) {
    if (!element?.isConnected || !element.getClientRects().length) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) return null;
    return rect;
  }
  function pulse(id, tileId, color) {
    if (reduced.matches || document.hidden || flights.has(id) || flights.size >= 8) return;
    if (!bounds(getSource()) || !bounds(getTileElement(tileId))) return;
    const group = document.createElementNS(ns, 'g');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', '2');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('r', '4'); dot.setAttribute('fill', color);
    group.append(path, dot); svg.append(group);
    const start = performance.now();
    let frame;
    const cancel = () => { cancelAnimationFrame(frame); group.remove(); flights.delete(id); };
    flights.set(id, cancel);
    function tick(now) {
      const a = bounds(getSource()), b = bounds(getTileElement(tileId));
      if (!a || !b || document.hidden || reduced.matches) { cancel(); return; }
      const progress = Math.min(1, (now - start) / 1100);
      const x = a.right, y = a.top + a.height / 2;
      const tx = b.left + Math.min(b.width / 2, 24), ty = b.top + 20;
      const bend = Math.max(60, Math.abs(tx - x) * 0.45);
      path.setAttribute('d', `M ${x} ${y} C ${x + bend} ${y}, ${tx - bend} ${ty}, ${tx} ${ty}`);
      const length = path.getTotalLength();
      const point = path.getPointAtLength(length * (progress * progress * (3 - 2 * progress)));
      dot.setAttribute('cx', String(point.x)); dot.setAttribute('cy', String(point.y));
      path.setAttribute('stroke-dasharray', `${Math.max(10, length * 0.18)} ${length}`);
      path.setAttribute('stroke-dashoffset', String(-length * progress));
      group.setAttribute('opacity', String(1 - progress * 0.7));
      if (progress === 1) cancel(); else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function refreshBorders() {
    document.querySelectorAll('.tetris-task-border').forEach(element => element.remove());
    for (const { tileIds, color } of running.values()) for (const id of tileIds) {
      const element = getTileElement(id);
      if (!element || element.querySelector('.tetris-task-border')) continue;
      const border = document.createElementNS(ns, 'svg'); border.classList.add('tetris-task-border'); border.setAttribute('aria-hidden', 'true'); border.style.setProperty('--task-color', color);
      const rect = document.createElementNS(ns, 'rect');
      for (const [key, value] of Object.entries({ x: '1', y: '1', width: 'calc(100% - 2px)', height: 'calc(100% - 2px)', rx: '8' })) rect.setAttribute(key, value);
      border.append(rect); element.append(border);
    }
  }
  return {
    event({ id, sessionId, tileIds = [], state, color = '#2789c3' }) {
      if (state === 'running') running.set(sessionId, { tileIds, color });
      else if (state !== 'delivery') running.delete(sessionId);
      refreshBorders();
      if (state === 'running' || state === 'delivery') tileIds.slice(0, 4).forEach((tileId, index) => pulse(`${id}:${index}`, tileId, color));
    },
    destroy() { for (const cancel of flights.values()) cancel(); running.clear(); refreshBorders(); svg.remove(); style.remove(); },
  };
}
