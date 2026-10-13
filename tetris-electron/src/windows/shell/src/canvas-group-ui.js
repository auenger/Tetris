import { updateNotificationBadge } from './notification-badge.js';
import { createGroupModel } from './canvas-groups.js';

export function createCanvasGroups({ tiles, tileLayer, viewport, getDOMs, selected, clearSelection, syncSelection, save, reposition, blur, isSpaceHeld, getAllWebviews }) {
  const model = createGroupModel(tiles);
  const cards = new Map();
  const toolbar = document.createElement('form');
  toolbar.className = 'canvas-group-toolbar';
  toolbar.hidden = true;
  const input = document.createElement('input');
  input.placeholder = '给选中的元素命名';
  input.setAttribute('aria-label', '分组名称');
  input.maxLength = 80;
  const submit = document.createElement('button');
  submit.textContent = '命名并收起';
  toolbar.append(input, submit);
  tileLayer.parentElement.append(toolbar);
  toolbar.addEventListener('mousedown', e => e.stopPropagation());
  toolbar.addEventListener('keydown', e => e.stopPropagation());
  toolbar.addEventListener('submit', e => {
    e.preventDefault();
    if (!model.create(selected().map(t => t.id), input.value)) return;
    input.value = '';
    blur();
    clearSelection();
    syncSelection();
    reposition();
    save();
  });
  function selectionChanged() {
    const items = selected();
    toolbar.hidden = items.length < 2 || items.some(t => model.groupFor(t.id));
  }
  function update() {
    model.prune();
    for (const [id, el] of cards) {
      if (!model.groups.some(g => g.id === id)) { el.remove(); cards.delete(id); }
    }
    for (const tile of tiles) {
      const hidden = model.isHidden(tile.id);
      tile.groupHidden = hidden;
      const dom = getDOMs().get(tile.id);
      if (dom) dom.container.style.display = hidden ? 'none' : '';
    }
    for (const group of model.groups) {
      model.containMembers(group);
      let card = cards.get(group.id);
      if (!card) {
        card = document.createElement('div');
        card.className = 'canvas-group';
        const header = document.createElement('div');
        header.className = 'canvas-group-header';
        header.title = '拖动标题栏空白处移动整组';
        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'canvas-group-label';
        name.textContent = group.name;
        name.title = '点击修改分组名称';
        name.addEventListener('click', () => {
          const input = document.createElement('input');
          input.className = 'canvas-group-name';
          input.value = group.name;
          input.maxLength = 80;
          input.setAttribute('aria-label', '分组名称');
          let finished = false;
          function finish(commit) {
            if (finished) return;
            finished = true;
            if (commit) { group.name = input.value.trim() || group.name; save(); }
            name.textContent = group.name;
            input.replaceWith(name);
          }
          input.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
          });
          input.addEventListener('blur', () => finish(true));
          name.replaceWith(input); input.focus(); input.select();
        });
        const spacer = document.createElement('span');
        spacer.className = 'canvas-group-drag-space';
        const count = document.createElement('span');
        count.className = 'canvas-group-count';
        const toggle = document.createElement('button');
        toggle.className = 'canvas-group-toggle';
        toggle.addEventListener('click', () => {
          group.collapsed = !group.collapsed;
          blur(); clearSelection(); syncSelection(); reposition(); save();
        });
        const ungroup = document.createElement('button');
        ungroup.className = 'canvas-group-ungroup';
        ungroup.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><path d="M8 8h8v8H8z" stroke-dasharray="2 2"/></svg>';
        ungroup.setAttribute('aria-label', '解组');
        ungroup.title = '解除分组，保留所有元素';
        ungroup.addEventListener('click', () => { model.remove(group); reposition(); selectionChanged(); save(); });
        header.append(name, spacer, count, toggle, ungroup);
        card.append(header);
        card.addEventListener('contextmenu', e => e.stopPropagation());
        header.addEventListener('mousedown', e => {
          if (e.button !== 0 || isSpaceHeld() || e.target.closest('input,button')) return;
          e.preventDefault(); e.stopPropagation();
          blur();
          const start = { ...model.bounds(group) };
          const sx = e.clientX, sy = e.clientY;
          const px = viewport.panX, py = viewport.panY, zoom = viewport.zoom;
          let dx = 0, dy = 0;
          const webviews = getAllWebviews();
          const previous = webviews.map(w => w.webview.style.pointerEvents);
          webviews.forEach(w => { w.webview.style.pointerEvents = 'none'; });
          function move(event) {
            const nx = (event.clientX - sx - viewport.panX + px) / zoom;
            const ny = (event.clientY - sy - viewport.panY + py) / zoom;
            model.move(group, nx - dx, ny - dy); dx = nx; dy = ny;
            reposition();
          }
          function end() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', end);
            webviews.forEach((w, i) => { w.webview.style.pointerEvents = previous[i]; });
            model.move(group, Math.round((start.x + dx) / 20) * 20 - start.x - dx,
              Math.round((start.y + dy) / 20) * 20 - start.y - dy);
            reposition(); save();
          }
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', end);
        });
        for (const dir of ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) {
          const handle = document.createElement('div');
          handle.className = `group-resize tile-resize-handle ${dir.length === 1 ? 'edge' : 'corner'}-${dir}`;
          handle.title = '调整分组范围';
          handle.addEventListener('mousedown', e => {
            if (e.button !== 0 || isSpaceHeld() || group.collapsed) return;
            e.preventDefault(); e.stopPropagation();
            const start = { ...model.bounds(group) };
            const sx = e.clientX, sy = e.clientY, px = viewport.panX, py = viewport.panY, zoom = viewport.zoom;
            const webviews = getAllWebviews();
            const previous = webviews.map(w => w.webview.style.pointerEvents);
            webviews.forEach(w => { w.webview.style.pointerEvents = 'none'; });
            function move(ev) {
              const dx = (ev.clientX - sx - viewport.panX + px) / zoom;
              const dy = (ev.clientY - sy - viewport.panY + py) / zoom;
              const rect = { ...start };
              if (dir.includes('e')) rect.width += dx;
              if (dir.includes('s')) rect.height += dy;
              if (dir.includes('w')) { rect.x += dx; rect.width -= dx; }
              if (dir.includes('n')) { rect.y += dy; rect.height -= dy; }
              model.resize(group, rect); reposition();
            }
            function end() {
              document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', end);
              webviews.forEach((w,i) => { w.webview.style.pointerEvents = previous[i]; });
              save();
            }
            document.addEventListener('mousemove', move); document.addEventListener('mouseup', end);
          });
          card.append(handle);
        }
        tileLayer.append(card);
        cards.set(group.id, card);
      }
      const b = model.bounds(group);
      const z = viewport.zoom;
      card.classList.toggle('collapsed', group.collapsed);
      updateNotificationBadge(card, model.members(group).filter(t => t.notificationNotice).map(t => ({
        ...t.notificationNotice, title: t.userTitle || t.notificationNotice.title,
      })));
      card.style.left = `${(b.x - (group.collapsed ? 0 : 12)) * z + viewport.panX}px`;
      card.style.top = `${(b.y - (group.collapsed ? 0 : 44)) * z + viewport.panY}px`;
      card.style.width = `${group.collapsed ? 340 : Math.max(340, b.width + 24)}px`;
      card.style.height = `${group.collapsed ? 64 : b.height + 56}px`;
      card.style.transform = `scale(${z})`;
      const toggle = card.querySelector('.canvas-group-toggle');
      const action = group.collapsed ? '展开' : '收起';
      toggle.title = action; toggle.setAttribute('aria-label', action);
      toggle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${group.collapsed ? 'M9 5l7 7-7 7' : 'M5 9l7 7 7-7'}"/></svg>`;
      card.querySelector('.canvas-group-count').textContent = String(group.tileIds.length);
    }
  }
  return { ...model, update, selectionChanged,
    getCard: id => cards.get(id),
    drop(items, event) {
      const rect = tileLayer.parentElement.getBoundingClientRect();
      const x = (event.clientX - rect.left - viewport.panX) / viewport.zoom;
      const y = (event.clientY - rect.top - viewport.panY) / viewport.zoom;
      const group = model.adoptAt(items, x, y);
      if (group) { reposition(); selectionChanged(); save(); }
    },
    expandFor(id) {
    const group = model.groupFor(id);
    if (group?.collapsed) { group.collapsed = false; reposition(); save(); }
  } };
}
