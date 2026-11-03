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
  expect(s.receive(event,7000)).toBeNull();
  expect(s.beginTurn({route:'wrong',kind:'started'})).toBe(false);
  expect(s.beginTurn({route:'route',kind:'started'})).toBe(true);
  expect(s.receive(event,8000)?.read).toBe(false);
  s.forget('terminal'); expect(s.receive(event,14000)).toBeNull();
});
test('attention is distinct; messages are bounded and sanitized', () => {
  const s=createAgentNotificationState();s.register('r','t');
  expect(s.receive({route:'r',kind:'oops'})).toBeNull();
  const n=s.receive({route:'r',kind:'attention',title:'x\x07\u202e',body:'a'.repeat(1000)},10);
  expect(n?.title).toBe('x'); expect(n?.body.length).toBe(300);
  expect(n?.kind).toBe('attention');
  expect(s.receive({route:'r',kind:'complete'},500)?.kind).toBe('complete');
  expect(s.receive({route:'r',kind:'complete'},1500)).toBeNull();
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

test('read turns cannot reappear after delayed replay or a newer turn', () => {
  const s = createAgentNotificationState(); s.register('r', 't');
  const first = { route:'r', kind:'complete', title:'Codex', body:'Done', eventId:'turn-1' };
  s.receive(first, 1000); s.read('t');
  expect(s.receive(first, 60_000)).toBeNull();
  expect(s.list()[0]?.read).toBe(true);
  const second = {...first, eventId:'turn-2'};
  expect(s.receive(second, 60_001)?.read).toBe(false);
  s.read('t');
  expect(s.receive(first, 3_600_000)).toBeNull();
  expect(s.receive(second, 3_600_001)).toBeNull();
  expect(s.list()[0]).toMatchObject({eventId:'turn-2', read:true});
  s.forget('t'); s.register('r', 't');
  expect(s.receive(first, 3_600_002)?.read).toBe(false);
});

test('distinct turns with identical content are accepted even within a second', () => {
  const s = createAgentNotificationState(); s.register('r', 't');
  const event = {route:'r',kind:'complete',body:'Done',eventId:'first'};
  expect(s.receive(event, 1000)?.time).toBe(1000);
  s.read('t');
  expect(s.receive({...event,eventId:'second'}, 1000)).toMatchObject({time:1001,read:false});
});

test('legacy dismissed notifications stay read until an explicit new turn', () => {
  const s=createAgentNotificationState(); s.register('r','t');
  const event={route:'r',kind:'complete',body:'Done'};
  s.receive(event, 1000); s.read('t');
  expect(s.receive(event, 3_600_000)).toBeNull();
  s.receive({...event,kind:'attention',body:'Confirm'},3_600_001); s.read('t');
  expect(s.receive(event, 7_200_000)).toBeNull();
  expect(s.beginTurn({route:'r',kind:'complete'})).toBe(false);
  expect(s.beginTurn({route:'r',kind:'started'})).toBe(true);
  expect(s.receive(event, 7_200_001)?.read).toBe(false);
});

test('unread and superseded legacy notices do not produce repeated banners after a delay', () => {
  const s = createAgentNotificationState(); s.register('r', 't');
  const first = {route:'r',kind:'attention',body:'Confirm command'};
  s.receive(first, 1);
  expect(s.receive(first, 60_000)).toBeNull();
  s.receive({...first,kind:'complete',body:'Finished'}, 60_001);
  expect(s.receive(first, 120_000)).toBeNull();
  expect(s.list()[0]?.body).toBe('Finished');
});

test('identified notices also suppress legacy replays, while new identified turns are accepted', () => {
  const s = createAgentNotificationState(); s.register('r', 't');
  const event = {route:'r',kind:'complete',body:'Done'};
  s.receive({...event,eventId:'first'}, 1); s.read('t');
  expect(s.receive(event, 60_000)).toBeNull();
  expect(s.receive({...event,eventId:'second'}, 60_001)?.read).toBe(false);
});

test('a delayed acknowledgement cannot clear a newer notification', () => {
  const s = createAgentNotificationState(); s.register('r', 't');
  const event = {route:'r',kind:'complete',eventId:'first'};
  s.receive(event, 100);
  s.receive({...event,eventId:'second'}, 101);
  expect(s.read('t', 100)).toBe(false);
  expect(s.list()[0]?.read).toBe(false);
  expect(s.read('t', 101)).toBe(true);
});

test('replaying a prompt-start event cannot reset legacy deduplication', () => {
  const s = createAgentNotificationState(); s.register('r', 't');
  const start = {route:'r',kind:'started',eventId:'prompt'};
  const event = {route:'r',kind:'complete',body:'Done'};
  s.beginTurn(start); s.receive(event, 1); s.read('t');
  s.beginTurn(start);
  expect(s.receive(event, 60_000)).toBeNull();
  s.beginTurn({...start,eventId:'next'});
  expect(s.receive(event, 60_001)?.read).toBe(false);
});

test('replayed prompt does not restart shared activity',()=>{
 const s=createAgentNotificationState();s.register('route','session');let starts=0;
 const payload={route:'route',kind:'started',eventId:'turn'};
 s.beginTurn(payload,()=>starts++);s.beginTurn(payload,()=>starts++);expect(starts).toBe(1);
});
