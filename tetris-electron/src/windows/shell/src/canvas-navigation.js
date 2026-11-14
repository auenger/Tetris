import './canvas-navigation.css';
import { attachMenu } from '../../../shared/ui/menu.js';

/** Page navigation belongs to the window chrome, never either canvas's viewport. */
export function createCanvasNavigation({ onNavigate }) {
  const root = document.getElementById('canvas-switcher');
  const trigger = document.getElementById('canvas-switcher-trigger');
  const label = document.getElementById('canvas-switcher-label');
  const menu = document.getElementById('canvas-switcher-menu');
  const items = [...menu.querySelectorAll('[data-canvas-page]')];
  let page = 'ide', unread = 0;
  const dropdown = attachMenu(trigger, menu);

  function close(restoreFocus = false) {
    dropdown.close(restoreFocus);
  }
  function open(edge) {
    dropdown.open(edge);
  }
  function render() {
    label.textContent = page === 'agent' ? 'Tetris Agent' : 'Tetris Canvas';
    const notice = unread ? `，${unread} 条未读任务消息` : '';
    trigger.setAttribute('aria-label', `切换画布，当前 ${label.textContent}${notice}`);
    for (const item of items) item.setAttribute('aria-checked', String(item.dataset.canvasPage === page));
    document.getElementById('super-agent-open').setAttribute('aria-label', `Tetris Agent${notice}`);
    for (const badge of root.querySelectorAll('[data-canvas-unread]')) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = !unread;
      badge.setAttribute('aria-hidden', 'true');
    }
  }
  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  for (const item of items) item.addEventListener('click', () => {
    close(); onNavigate(item.dataset.canvasPage);
  });
  // Escape closes only the switcher, not the canvas selection beneath it.
  document.addEventListener('keydown', event => {
    if (menu.hidden || event.key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation(); close(true);
  }, true);
  root.addEventListener('mousedown', event => event.stopPropagation());
  render();
  return {
    setPage(value) { if (value !== page) { page = value; close(); render(); } },
    setUnread(value) { unread = Math.max(0, value); render(); },
  };
}
