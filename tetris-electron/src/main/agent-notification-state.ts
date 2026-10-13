export type AgentNotice = { sessionId: string; title: string; body: string; kind: 'complete' | 'attention'; time: number; read: boolean };
export function createAgentNotificationState() {
  const routes = new Map<string, string>();
  const unread = new Map<string, AgentNotice>();
  const recent = new Map<string, { key: string; time: number }>();
  const clean = (value: unknown, limit: number) => typeof value === 'string'
    ? value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, limit) : '';
  return {
    register(route: string, sessionId: string) { routes.set(route, sessionId); },
    forget(sessionId: string) {
      for (const [key,id] of routes) if (id === sessionId) routes.delete(key);
      unread.delete(sessionId); recent.delete(sessionId);
    },
    read(sessionId: string) { const notice = unread.get(sessionId); if (notice) notice.read = true; },
    list: () => [...unread.values()],
    receive(raw: unknown, now = Date.now()): AgentNotice | null {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Record<string, unknown>;
      const sessionId = typeof p.route === 'string' ? routes.get(p.route) : null;
      if (!sessionId || (p.kind !== 'complete' && p.kind !== 'attention')) return null;
      const title = clean(p.title, 80) || 'Coding agent';
      const body = clean(p.body, 300) || (p.kind === 'complete' ? '本轮回复已完成' : '需要你的处理');
      const key = `${p.kind}:${title}:${body}`;
      const prev = recent.get(sessionId);
      if (prev && (now - prev.time < 1000 || (prev.key === key && now - prev.time < 5000))) return null;
      recent.set(sessionId, { key, time: now });
      const notice = { sessionId, title, body, kind: p.kind, time: now, read: false } as AgentNotice;
      unread.set(sessionId, notice);
      return notice;
    },
  };
}
