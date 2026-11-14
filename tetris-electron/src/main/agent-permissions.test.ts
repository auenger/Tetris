import { test, expect } from 'bun:test';
import { AgentPermissions } from './agent-permissions';

test('permission answers are scoped to a live request and cancellation resolves pending work', async () => {
  const permissions = new AgentPermissions();
  const request = { sessionId: 's', toolCall: { toolCallId: 'tool', title: 'Run command' }, options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' as const }] };
  const result = permissions.request(request);
  const id = permissions.list('s')[0]!.id;
  expect(() => permissions.answer('other', id, 'once')).toThrow();
  expect(() => permissions.answer('s', id, 'invalid')).toThrow();
  permissions.answer('s', id, 'once');
  expect(await result).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } });
  expect(permissions.list('s')).toEqual([]);
  const cancelled = permissions.request(request);
  permissions.cancel('s');
  expect(await cancelled).toEqual({ outcome: { outcome: 'cancelled' } });
});
