import { test, expect } from 'bun:test';
import { createAgentNotificationState } from './agent-notification-state';
test('routes are scoped and repeated events are deduplicated', () => {
  const s=createAgentNotificationState(); s.register('route','terminal');
  expect(s.receive({route:'wrong',kind:'complete'})).toBeNull();
  const event={route:'route',kind:'complete',title:'Codex'};
  expect(s.receive(event,1000)?.sessionId).toBe('terminal');
  expect(s.receive(event,2000)).toBeNull();
  expect(s.list()).toHaveLength(1);
  s.read('terminal'); expect(s.list()).toHaveLength(1); expect(s.list()[0]?.read).toBe(true);
  expect(s.receive(event,7000)?.read).toBe(false);
  s.forget('terminal'); expect(s.receive(event,14000)).toBeNull();
});
test('attention is distinct; messages are bounded and sanitized', () => {
  const s=createAgentNotificationState();s.register('r','t');
  expect(s.receive({route:'r',kind:'oops'})).toBeNull();
  const n=s.receive({route:'r',kind:'attention',title:'x\x07\u202e',body:'a'.repeat(1000)},10);
  expect(n?.title).toBe('x'); expect(n?.body.length).toBe(300);
  expect(n?.kind).toBe('attention');
  expect(s.receive({route:'r',kind:'complete'},500)).toBeNull();
  expect(s.receive({route:'r',kind:'complete'},1500)?.kind).toBe('complete');
  expect(s.list()).toHaveLength(1);
});
test('each terminal retains only its latest message, including after it was read', () => {
  const s = createAgentNotificationState();
  s.register('route-a', 'tile-a');
  s.register('route-b', 'tile-b');
  s.receive({route:'route-a', kind:'complete', body:'第一轮结果'}, 1000);
  s.receive({route:'route-b', kind:'complete', body:'另一个终端的结果'}, 2000);
  s.read('tile-a');
  s.receive({route:'route-a', kind:'complete', body:'第二轮结果'}, 3000);
  const displayed = s.list().sort((a, b) => b.time - a.time);
  expect(displayed).toHaveLength(2);
  expect(displayed.map(n => n.sessionId)).toEqual(['tile-a', 'tile-b']);
  expect(displayed[0]).toMatchObject({body:'第二轮结果', time:3000, read:false});
  expect(displayed.some(n => n.body === '第一轮结果')).toBe(false);
  s.forget('tile-a');
  expect(s.list().map(n => n.sessionId)).toEqual(['tile-b']);
});
