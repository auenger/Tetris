export type AgentNotice = { sessionId: string; title: string; body: string; kind: 'complete' | 'attention'; time: number; read: boolean; eventId?: string };
export function createAgentNotificationState() {
  const routes = new Map<string, string>();
  const unread = new Map<string, AgentNotice>();
  // Acknowledging a notice must not allow a delayed replay of the same turn.
  const seenEvents = new Map<string, Set<string>>();
  const seenLegacy = new Map<string, Set<string>>();
  const clean = (value: unknown, limit: number) => typeof value === 'string'
    ? value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, limit) : '';
  return {
    resolveRoute(route: unknown) { return typeof route === 'string' ? routes.get(route) : undefined; },
    register(route: string, sessionId: string) { routes.set(route, sessionId); },
    forget(sessionId: string) {
      for (const [key,id] of routes) if (id === sessionId) routes.delete(key);
      unread.delete(sessionId); seenEvents.delete(sessionId); seenLegacy.delete(sessionId);
    },
    beginTurn(raw: unknown, onStart?: (sessionId:string)=>void): boolean {
      if (!raw || typeof raw !== 'object') return false;
      const p = raw as Record<string, unknown>;
      const sessionId = typeof p.route === 'string' ? routes.get(p.route) : undefined;
      if (!sessionId || p.kind !== 'started') return false;
      const eventId = clean(p.eventId, 200);
      if (eventId) {
        const seen = seenEvents.get(sessionId) ?? new Set<string>();
        const identity = `started:${eventId}`;
        if (seen.has(identity)) return true;
        seen.add(identity);
        seenEvents.set(sessionId, seen);
      }
      // Older Claude versions have no prompt ID. A new user prompt provides
      // an explicit boundary so the next identical reply is still allowed.
      seenLegacy.delete(sessionId);
      onStart?.(sessionId);
      return true;
    },
    read(sessionId: string, throughTime = Infinity): boolean {
      const notice = unread.get(sessionId);
      if (!notice || notice.time > throughTime) return false;
      notice.read = true;
      return true;
    },
    list: () => [...unread.values()],
    receive(raw: unknown, now = Date.now()): AgentNotice | null {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Record<string, unknown>;
      const sessionId = typeof p.route === 'string' ? routes.get(p.route) : null;
      if (!sessionId || (p.kind !== 'complete' && p.kind !== 'attention')) return null;
      const title = clean(p.title, 80) || 'Coding agent';
      const body = clean(p.body, 300) || (p.kind === 'complete' ? '本轮回复已完成' : '需要你的处理');
      const key = `${p.kind}:${title}:${body}`;
      const eventId = clean(p.eventId, 200);
      if (!eventId && seenLegacy.get(sessionId)?.has(key)) return null;
      const identity = `${p.kind}:${eventId}`;
      if (eventId && seenEvents.get(sessionId)?.has(identity)) return null;
      if (eventId) {
        const seen = seenEvents.get(sessionId) ?? new Set<string>();
        seen.add(identity);
        seenEvents.set(sessionId, seen);
      }
      // Remember identified previews too: older hooks can replay without an ID.
      const legacy = seenLegacy.get(sessionId) ?? new Set<string>();
      legacy.add(key);
      seenLegacy.set(sessionId, legacy);
      const time = Math.max(now, (unread.get(sessionId)?.time ?? -Infinity) + 1);
      const notice: AgentNotice = { sessionId, title, body, kind: p.kind, time, read: false,
        ...(eventId ? { eventId } : {}) };
      unread.set(sessionId, notice);
      return notice;
    },
  };
}
