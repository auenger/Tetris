import './select.css';

/** Shared anchored menu behavior for non-select commands and window navigation. */
export function attachMenu(trigger, menu, { onClose = () => {} } = {}) {
  const doc = trigger.ownerDocument, win = doc.defaultView;
  menu.classList.add('tetris-dropdown', 'tetris-menu'); menu.setAttribute('popover', 'manual'); menu.setAttribute('role', 'menu'); menu.hidden = true;
  trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  let opened = false, anchorFrame = 0, anchorRect = '';
  const rectKey = rect => `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
  const items = () => [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')].filter(item => !item.hidden && !item.disabled && item.getAttribute('aria-disabled') !== 'true');
  function position() {
    if (!opened) return;
    const rect = trigger.getBoundingClientRect();
    if (!trigger.isConnected || !rect.width || !rect.height || rect.bottom <= 0 || rect.top >= win.innerHeight || rect.right <= 0 || rect.left >= win.innerWidth) { close(); return; }
    anchorRect = rectKey(rect);
    const width = Math.min(Number(menu.dataset.menuWidth) || 240, win.innerWidth - 16), below = win.innerHeight - rect.bottom - 8, above = rect.top - 8;
    const upwards = below < Math.min(280, menu.scrollHeight) && above > below, maxHeight = Math.max(28, Math.min(320, upwards ? above - 5 : below - 5));
    Object.assign(menu.style, { width: `${width}px`, maxHeight: `${maxHeight}px`, left: `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`, top: `${upwards ? Math.max(8, rect.top - Math.min(maxHeight, menu.scrollHeight) - 5) : rect.bottom + 5}px` });
  }
  function followAnchor() {
    if (!opened) return;
    if (rectKey(trigger.getBoundingClientRect()) !== anchorRect) position();
    if (opened) anchorFrame = win.requestAnimationFrame(followAnchor);
  }
  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false; win.cancelAnimationFrame(anchorFrame); anchorFrame = 0; if (menu.matches(':popover-open')) menu.hidePopover(); menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('scroll', scroll, true); win.removeEventListener('resize', position); win.removeEventListener('blur', blur);
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true }); onClose();
  }
  function open(edge = 'selected') {
    if (trigger.disabled) return;
    opened = true; menu.hidden = false; if (!menu.matches(':popover-open') && menu.showPopover) menu.showPopover(); trigger.setAttribute('aria-expanded', 'true'); position(); if (!opened) return;
    win.cancelAnimationFrame(anchorFrame); anchorFrame = win.requestAnimationFrame(followAnchor);
    const list = items(), target = edge === 'last' ? list.at(-1) : edge === 'first' ? list[0] : list.find(item => item.getAttribute('aria-checked') === 'true') || list[0];
    target?.focus({ preventScroll: true });
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('scroll', scroll, true); win.addEventListener('resize', position); win.addEventListener('blur', blur);
  }
  function outside(event) { if (!menu.contains(event.target) && !trigger.contains(event.target)) close(); }
  function scroll(event) { if (!menu.contains(event.target)) position(); }
  function blur() { close(); }
  function key(event) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    if (event.target.matches('input,textarea,[contenteditable=true]')) return;
    const list = items(), current = list.indexOf(doc.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[index]?.focus({ preventScroll: true }); list[index]?.scrollIntoView({ block: 'nearest' });
    } else if ((event.key === 'Enter' || event.key === ' ') && doc.activeElement.getAttribute('role')?.startsWith('menuitem') && doc.activeElement.tagName !== 'BUTTON') { event.preventDefault(); doc.activeElement.click(); }
  }
  function triggerKey(event) { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); open(event.key === 'ArrowDown' ? 'first' : 'last'); } else if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); close(true); } }
  menu.addEventListener('keydown', key); trigger.addEventListener('keydown', triggerKey);
  menu.addEventListener('wheel', stop); menu.addEventListener('pointerdown', stop); menu.addEventListener('mousedown', stop);
  function stop(event) { event.stopPropagation(); }
  const resize = new ResizeObserver(position); resize.observe(trigger); resize.observe(menu);
  return { open, close, refresh: position, get opened() { return opened; }, destroy() { close(); resize.disconnect(); menu.removeEventListener('keydown', key); trigger.removeEventListener('keydown', triggerKey); menu.removeEventListener('wheel', stop); menu.removeEventListener('pointerdown', stop); menu.removeEventListener('mousedown', stop); } };
}
