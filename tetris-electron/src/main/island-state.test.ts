import {test,expect} from 'bun:test';
import {createIslandState} from './island-state';
const event=(event:string,time:number,tool='')=>({sessionId:'one',event,time,tool,cwd:'/work/collab'});
test('hooks drive tool, attention, recovery, stop and timed toast',()=>{
 const state=createIslandState();state.event(event('UserPromptSubmit',100));
 state.event(event('PreToolUse',200,'Bash'));expect(state.snapshot(200).sessions[0]!.tool).toBe('Bash');
 state.event(event('PermissionRequest',300));expect(state.snapshot(300).sessions[0]!.status).toBe('attention');
 state.event(event('PostToolUse',400));expect(state.snapshot(400).sessions[0]!.status).toBe('working');
 state.event(event('Stop',500));expect(state.snapshot(500).toast).toBe('collab 本轮回复完成');
 state.event(event('Stop',600));expect(state.snapshot(4600).toast).toBe('');
 expect(state.snapshot(4600).sessions[0]!.status).toBe('done');
});
test('older events cannot override newer state and exiting removes a session',()=>{
 const state=createIslandState();state.event(event('Stop',500));state.event(event('PreToolUse',400));
 expect(state.snapshot().sessions[0]!.status).toBe('done');state.event(event('SessionEnd',600));expect(state.snapshot().sessions).toHaveLength(0);
});
test('CLI discovery creates idle cards before hooks and keeps identity through polling and events',()=>{
 const state=createIslandState();const roots=[{sessionId:'one',cwdHostPath:'/work/collab'}];
 state.reconcile(roots);
 const first=state.snapshot().sessions[0]!;
 expect(first.title).toBe('collab');expect(first.tool).toBe('状态未知');expect(first.started).toBe(0);
 state.reconcile(roots);expect(state.snapshot().sessions[0]!.avatar).toBe(first.avatar);
 state.event(event('UserPromptSubmit',100));state.reconcile(roots);
 expect(state.snapshot().sessions).toHaveLength(1);expect(state.snapshot().sessions[0]!.status).toBe('working');
 expect(state.snapshot().sessions[0]!.avatar).toBe(first.avatar);
 state.reconcile([]);expect(state.snapshot().sessions).toHaveLength(0);
});
test('external CLI processes appear independently without terminal hooks',()=>{
 const state=createIslandState();state.reconcile([{sessionId:'external:42',cwdHostPath:'',name:'外部 CLI · 42'}]);
 expect(state.snapshot().sessions[0]!.title).toBe('外部 CLI · 42');
});
test('manual refresh changes avatars without changing session activity',()=>{
 const state=createIslandState();const roots=[{sessionId:'one',cwdHostPath:'/work/collab'}];
 state.reconcile(roots);state.event(event('UserPromptSubmit',100));
 const previous={...state.snapshot().sessions[0]!};state.shuffleAvatars();
 const next=state.snapshot().sessions[0]!;expect(next.avatar).not.toBe(previous.avatar);
 expect(next.avatar).toBeGreaterThanOrEqual(0);expect(next.avatar).toBeLessThan(8);
 expect({...next,avatar:previous.avatar}).toEqual(previous);
 const shuffled=next.avatar;state.reconcile(roots);expect(state.snapshot().sessions[0]!.avatar).toBe(shuffled);
});

test('reading attention never resolves it; running time excludes waiting',()=>{
 const s=createIslandState();s.event(event('UserPromptSubmit',100));s.event(event('PermissionRequest',300));
 s.read('one',400);expect(s.snapshot().sessions[0]!.status).toBe('attention');expect(s.snapshot().sessions[0]!.waitingSince).toBe(300);
 s.event(event('PermissionRequest',500));expect(s.snapshot().sessions[0]!.waitingSince).toBe(300);
 s.event(event('PostToolUse',700));expect(s.snapshot().sessions[0]!.waitingSince).toBe(0);
 s.event(event('Stop',800));expect(s.snapshot().sessions[0]!.runningMs).toBe(300);
});
test('completion survives toast expiry; stale reads and repeated stop cannot clear or reopen it',()=>{
 const s=createIslandState();s.event(event('Stop',100));expect(s.snapshot(5000).sessions[0]!.unread).toBe(true);
 s.read('one',100);s.event(event('Stop',101));expect(s.snapshot().sessions[0]!.unread).toBe(false);
 s.event(event('UserPromptSubmit',200));s.event(event('Stop',300));s.read('one',100);expect(s.snapshot().sessions[0]!.unread).toBe(true);
 s.read('one',300);expect(s.snapshot().sessions[0]!.unread).toBe(false);
});
test('shared snapshots cannot mutate the store and retain Claude identity',()=>{
 const s=createIslandState();s.event({...event('UserPromptSubmit',100),agent:'Claude Code'});
 const row=s.snapshot().sessions[0]!;row.status='done';expect(s.snapshot().sessions[0]!.status).toBe('working');expect(s.snapshot().sessions[0]!.agent).toBe('Claude Code');
});

test('task title stays consistent across tool events and directory refreshes',()=>{
 const s=createIslandState();s.event(event('UserPromptSubmit',100));expect(s.setTitle('one','修复登录')).toBe(true);
 s.event(event('PreToolUse',200));s.reconcile([{sessionId:'one',cwdHostPath:'/work/collab'}]);expect(s.snapshot().sessions[0]!.title).toBe('修复登录');
 s.setTitle('one','');expect(s.snapshot().sessions[0]!.title).toBe('collab');
});
