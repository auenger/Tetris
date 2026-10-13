// One lazily-created badge per surface; group movement does not rebuild its contents.
export function updateNotificationBadge(container, notices) {
  let badge = container.querySelector(':scope > .agent-notification-badge');
  if (!notices.length) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'agent-notification-badge';
    badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="agent-notification-tooltip" role="tooltip"></span>';
    for (const event of ['mousedown', 'pointerdown', 'click', 'dblclick', 'contextmenu']) {
      badge.addEventListener(event, e => e.stopPropagation());
    }
    container.append(badge);
  }
  const message = notices.map(n => `${n.title} · ${n.body}`).join('\n');
  if (badge.getAttribute('aria-label') !== message) {
    badge.setAttribute('aria-label', message);
    badge.querySelector('.agent-notification-tooltip').textContent = message;
  }
  badge.classList.toggle('unread', notices.some(n => !n.read));
}
