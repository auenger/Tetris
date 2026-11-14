import './select.css';

let nextId = 0;
let activeSelect = null;

/** A styled single-select. The native element remains the form/React source of truth. */
export function enhanceSelect(select, { variant = 'outline' } = {}) {
  if (select.multiple) throw new Error('Tetris Select supports one selection');
  const document = select.ownerDocument, window = document.defaultView;
  const ownWrapper = !select.parentElement?.classList.contains('tetris-select-wrap');
  const wrapper = ownWrapper ? document.createElement('span') : select.parentElement;
  if (ownWrapper) { wrapper.className = 'tetris-select-wrap'; select.replaceWith(wrapper); wrapper.append(select); }
  const original = { tabIndex: select.getAttribute('tabindex'), ariaHidden: select.getAttribute('aria-hidden') };
  select.classList.add('tetris-native-select'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'tetris-select';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span'); label.className = 'tetris-select-value';
  const arrow = document.createElement('span'); arrow.className = 'tetris-select-arrow'; arrow.setAttribute('aria-hidden', 'true');
  trigger.append(label, arrow); wrapper.append(trigger);
  const menu = document.createElement('div'); menu.className = 'tetris-dropdown'; menu.id = `tetris-select-${++nextId}`;
  menu.setAttribute('role', 'listbox'); menu.setAttribute('popover', 'manual'); menu.hidden = true;
  trigger.setAttribute('aria-controls', menu.id);
  let opened = false, disposed = false, active = -1, options = [], items = [], search = '', searchTime = 0, anchorFrame = 0, anchorRect = '';
  const rectKey = rect => `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
  const enabled = index => options[index] && !options[index].disabled && !options[index].parentElement?.disabled;

  function refresh() {
    if (disposed) return;
    const option = select.selectedOptions[0];
    label.textContent = option?.label || select.getAttribute('placeholder') || '选择…';
    trigger.title = select.title || option?.title || option?.label || '';
    trigger.disabled = select.disabled;
    trigger.dataset.variant = select.dataset.variant || variant;
    trigger.tabIndex = original.tabIndex === null ? 0 : Number(original.tabIndex);
    const accessibleLabel = select.getAttribute('aria-label');
    if (accessibleLabel) { trigger.setAttribute('aria-label', accessibleLabel); menu.setAttribute('aria-label', accessibleLabel); }
    else { trigger.removeAttribute('aria-label'); menu.setAttribute('aria-label', '选项'); }
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-invalid', 'aria-required']) {
      const value = select.getAttribute(attribute); if (value) trigger.setAttribute(attribute, value); else trigger.removeAttribute(attribute);
    }
    if (opened) {
      if (select.disabled) { close(); return; }
      const activeValue = options[active]?.value;
      renderOptions(); active = options.findIndex(option => option.value === activeValue);
      if (!enabled(active)) active = enabled(select.selectedIndex) ? select.selectedIndex : options.findIndex((_, index) => enabled(index));
      highlight(); position();
    }
  }
  function renderOptions() {
    options = Array.from(select.options); items = []; menu.replaceChildren();
    let previousGroup = null;
    for (const [index, option] of options.entries()) {
      const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement : null;
      if (group && group !== previousGroup) { const heading = document.createElement('div'); heading.className = 'tetris-dropdown-heading'; heading.textContent = group.label; menu.append(heading); }
      previousGroup = group;
      const item = document.createElement('div'); item.className = 'tetris-dropdown-option'; item.id = `${menu.id}-${index}`;
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected)); item.setAttribute('aria-disabled', String(!enabled(index)));
      item.title = option.title || option.label;
      const text = document.createElement('span'); text.className = 'tetris-dropdown-label'; text.textContent = option.label;
      const check = document.createElement('span'); check.className = 'tetris-dropdown-check'; check.setAttribute('aria-hidden', 'true'); item.append(text, check);
      item.addEventListener('pointermove', () => { if (enabled(index)) { active = index; highlight(false); } });
      item.addEventListener('click', event => { event.stopPropagation(); choose(index); });
      menu.append(item); items.push(item);
    }
    if (!options.length) { const empty = document.createElement('div'); empty.className = 'tetris-dropdown-empty'; empty.textContent = '暂无选项'; menu.append(empty); }
  }
  function position() {
    if (!opened) return;
    const rect = trigger.getBoundingClientRect();
    if (!trigger.isConnected || !rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) { close(); return; }
    anchorRect = rectKey(rect);
    const width = Math.min(Math.max(180, rect.width), Math.min(420, window.innerWidth - 16));
    const below = window.innerHeight - rect.bottom - 8, above = rect.top - 8;
    const desired = Math.min(280, menu.scrollHeight || 280), upwards = below < desired && above > below;
    const height = Math.max(28, Math.min(280, upwards ? above - 5 : below - 5));
    Object.assign(menu.style, { width: `${width}px`, maxHeight: `${height}px`, left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`, top: `${upwards ? Math.max(8, rect.top - Math.min(menu.scrollHeight, height) - 5) : rect.bottom + 5}px` });
  }
  function followAnchor() {
    if (!opened) return;
    if (rectKey(trigger.getBoundingClientRect()) !== anchorRect) position();
    if (opened) anchorFrame = window.requestAnimationFrame(followAnchor);
  }
  function highlight(scroll = true) {
    items.forEach((item, index) => item.dataset.active = String(index === active));
    if (items[active]) { trigger.setAttribute('aria-activedescendant', items[active].id); if (scroll) items[active].scrollIntoView({ block: 'nearest' }); }
    else trigger.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (opened || disposed || select.disabled) return;
    activeSelect?.close(); opened = true; activeSelect = handle; renderOptions();
    document.body.append(menu); menu.hidden = false;
    if (menu.showPopover) menu.showPopover();
    trigger.setAttribute('aria-expanded', 'true');
    active = enabled(select.selectedIndex) ? select.selectedIndex : options.findIndex((_, index) => enabled(index));
    position(); if (!opened) return; highlight();
    anchorFrame = window.requestAnimationFrame(followAnchor);
    document.addEventListener('pointerdown', outside, true); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', position); window.addEventListener('blur', onBlur);
  }
  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false; window.cancelAnimationFrame(anchorFrame); anchorFrame = 0; if (activeSelect === handle) activeSelect = null;
    if (menu.matches(':popover-open')) menu.hidePopover(); menu.hidden = true; menu.remove();
    trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', position); window.removeEventListener('blur', onBlur);
    if (restoreFocus && trigger.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
  }
  function outside(event) { if (!wrapper.contains(event.target) && !menu.contains(event.target)) close(); }
  function scroll(event) { if (!menu.contains(event.target)) position(); }
  function onBlur() { close(); }
  function choose(index) {
    if (!enabled(index)) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index; close(true); refresh();
    if (changed) { select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); refresh(); }
  }
  function move(direction) {
    let index = active;
    for (let count = 0; count < options.length; count++) { index = (index + direction + options.length) % options.length; if (enabled(index)) { active = index; highlight(); break; } }
  }
  trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); opened ? close() : open(); });
  trigger.addEventListener('pointerdown', event => event.stopPropagation());
  trigger.addEventListener('mousedown', event => event.stopPropagation());
  trigger.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') { if (opened) { event.preventDefault(); close(true); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!opened) { open(); if (event.key === 'Home' || event.key === 'End') { active = event.key === 'Home' ? -1 : 0; move(event.key === 'Home' ? 1 : -1); } return; }
      if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
      if (event.key === 'Home' || event.key === 'End') active = event.key === 'Home' ? -1 : 0;
      move(event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1); return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault(); if (!opened) open();
      const now = Date.now(); search = now - searchTime > 650 ? event.key : search + event.key; searchTime = now;
      const query = search.toLocaleLowerCase(), start = active + (query.length === 1 ? 1 : 0);
      for (let count = 0; count < options.length; count++) { const index = (start + count) % options.length; if (enabled(index) && options[index].label.toLocaleLowerCase().startsWith(query)) { active = index; highlight(); break; } }
    }
  });
  menu.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); });
  menu.addEventListener('wheel', event => event.stopPropagation());
  select.addEventListener('change', refresh);
  const observer = new MutationObserver(refresh); observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
  const resize = new ResizeObserver(() => { if (opened) position(); }); resize.observe(trigger);
  const form = select.form, onReset = () => queueMicrotask(refresh); form?.addEventListener('reset', onReset);
  function destroy() {
    if (disposed) return; close(); disposed = true; observer.disconnect(); resize.disconnect(); form?.removeEventListener('reset', onReset); select.removeEventListener('change', refresh); trigger.remove();
    select.classList.remove('tetris-native-select');
    for (const [attribute, value] of [['tabindex', original.tabIndex], ['aria-hidden', original.ariaHidden]]) if (value === null) select.removeAttribute(attribute); else select.setAttribute(attribute, value);
    if (ownWrapper) wrapper.replaceWith(select);
  }
  const handle = { trigger, menu, wrapper, refresh, open, close, destroy }; refresh(); return handle;
}
