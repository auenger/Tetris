import { randomUUID } from 'node:crypto';
import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';

export class AgentPermissions {
  private pending = new Map<string, {
    request: RequestPermissionRequest;
    resolve: (response: RequestPermissionResponse) => void;
  }>();
  request(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return new Promise(resolve => this.pending.set(randomUUID(), { request, resolve }));
  }
  list(sessionId: string) {
    return [...this.pending].filter(([, entry]) => entry.request.sessionId === sessionId)
      .map(([id, { request }]) => ({ id, sessionId, title: request.toolCall.title,
        input: request.toolCall.rawInput, options: request.options }));
  }
  answer(sessionId: string, id: string, optionId?: string): void {
    const entry = this.pending.get(id);
    if (!entry || entry.request.sessionId !== sessionId) throw new Error('Permission request is no longer pending');
    if (optionId && !entry.request.options.some(option => option.optionId === optionId)) throw new Error('Invalid permission option');
    this.pending.delete(id);
    entry.resolve(optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } });
  }
  cancel(sessionId?: string): void {
    for (const [id, entry] of this.pending) {
      if (!sessionId || entry.request.sessionId === sessionId) this.answer(entry.request.sessionId, id);
    }
  }
}
