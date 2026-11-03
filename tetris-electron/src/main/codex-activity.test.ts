import {test,expect} from 'bun:test';
import {createActivityTracker} from './codex-activity';
test('completion overrides residual spinner and stays complete beyond ten seconds',()=>{
 const t=createActivityTracker(); const spinner='Working (esc to interrupt)';
 expect(t.resolve(1,spinner,undefined,1000)).toBe('working');
 expect(t.resolve(1,spinner,{time:1100,kind:'complete'},1200)).toBe('done');
 expect(t.resolve(1,spinner,{time:1100,kind:'complete'},50000)).toBe('done');
 t.resolve(1,'› prompt',{time:1100,kind:'complete'},51000);
 expect(t.resolve(1,spinner,{time:1100,kind:'complete'},52000)).toBe('working');
});
test('silent stale footer loses working status without claiming completion',()=>{
 const t=createActivityTracker();
 t.resolve(1,'esc to interrupt',undefined,1000);
 expect(t.resolve(1,'esc to interrupt',undefined,32000)).toBe('状态未接入');
});
