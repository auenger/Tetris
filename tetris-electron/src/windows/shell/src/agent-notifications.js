import { getTileLabel } from './tile-renderer.js';
import { updateNotificationBadge } from './notification-badge.js';

export function createAgentNotificationUI({ tiles, tileManager, navigateToTile, container }) {
  let notices = [];
  const panel = document.createElement('section');
  panel.className = 'agent-notification-panel';
  panel.setAttribute('aria-label', '消息提醒');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'agent-notification-panel-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  const label = document.createElement('span');
  label.className = 'agent-notification-panel-label';
  const list = document.createElement('div');
  list.className = 'agent-notification-items';
  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
  });
  for (const event of ['mousedown', 'pointerdown', 'click', 'dblclick', 'contextmenu', 'wheel', 'keydown']) {
    panel.addEventListener(event, e => e.stopPropagation());
  }
  const header = document.createElement('div');
  header.className = 'agent-notification-panel-header';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'agent-notification-clear';
  clear.setAttribute('aria-label', '全部已读');
  clear.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 12 4 4L17 6m-5 10 4 4L23 10"/></svg>';
  clear.title = '标记全部已读并清空列表';
  clear.addEventListener('click', () => {
    const sessions = new Set(tiles.map(t => t.ptySessionId));
    markRead(notices.filter(n => !n.read && sessions.has(n.sessionId)).map(n => n.sessionId));
  });
  header.append(label, clear, toggle);
  panel.append(header, list);
  container.append(panel);
  function renderList() {
    const bySession = new Map(tiles.filter(t => t.ptySessionId).map(t => [t.ptySessionId, t]));
    const relevant = notices.filter(n => !n.read && bySession.has(n.sessionId)).sort((a, b) => b.time - a.time);
    const unreadCount = relevant.length;
    clear.disabled = unreadCount === 0;
    label.textContent = `消息提醒${unreadCount ? ` · ${unreadCount}` : ''}`;
    toggle.title = list.hidden ? '展开提醒列表' : '收起提醒列表';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${list.hidden ? 'm9 5 7 7-7 7' : 'm5 9 7 7 7-7'}"/></svg>`;
    list.replaceChildren();
    if (!relevant.length) {
      const empty = document.createElement('p');
      empty.className = 'agent-notification-panel-empty';
      empty.textContent = '暂无消息提醒';
      list.append(empty);
    }
    for (const notice of relevant) {
      const tile = bySession.get(notice.sessionId);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'agent-notification-item';
      item.classList.toggle('unread', !notice.read);
      item.dataset.sessionId = notice.sessionId;
      const heading = document.createElement('span');
      heading.className = 'agent-notification-item-title';
      heading.textContent = getTileLabel(tile).name || notice.title;
      const status = document.createElement('span');
      status.className = 'agent-notification-item-status';
      status.textContent = `${notice.title} · ${notice.kind === 'attention' ? '待确认' : '回复完成'} · ${notice.read ? '已读' : '未读'}`;
      const body = document.createElement('span');
      body.className = 'agent-notification-item-body';
      body.textContent = notice.body;
      item.title = `${notice.title} · ${notice.body}`;
      item.append(heading, status, body);
      item.addEventListener('click', () => open(notice.sessionId));
      list.append(item);
    }
  }
  toggle.addEventListener('click', renderList);
  renderList();
  function markRead(sessionIds) {
    if (!sessionIds.length) return;
    const ids = new Set(sessionIds);
    notices = notices.map(n => ids.has(n.sessionId) ? { ...n, read: true } : n);
    window.shellApi.readAgentNotification(sessionIds.length === 1 ? sessionIds[0] : sessionIds);
    render();
  }
  function read(tile) {
    if (!tile?.ptySessionId || !notices.some(n => n.sessionId === tile.ptySessionId && !n.read)) return;
    markRead([tile.ptySessionId]);
  }
  function open(sessionId) {
    const tile = tiles.find(t => t.ptySessionId === sessionId);
    if (!tile) return;
    navigateToTile(tile.id, true);
    read(tile);
  }
  function render() {
    const bySession = new Map(notices.map(n => [n.sessionId, n]));
    for (const tile of tiles) {
      const latest = bySession.get(tile.ptySessionId);
      const notice = latest && !latest.read ? latest : undefined;
      tile.notificationNotice = notice;
      const dom = tileManager.getTileDOMs().get(tile.id);
      if (dom) updateNotificationBadge(dom.container, notice ? [notice] : []);
    }
    renderList();
    tileManager.repositionAllTiles();
  }
  window.shellApi.onAgentNotifications(items => { notices = items; render(); });
  window.shellApi.onAgentNotificationOpen(open);
  // Restore only after the viewport and terminal sessions have initialized.
  async function restore() { notices = await window.shellApi.getAgentNotifications(); render(); }
  return { read, restore, refresh: render };
}
