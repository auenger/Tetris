import {test,expect} from 'bun:test';
import {activityPresentation} from './island-presentation';
import {createIslandState} from './island-state';
const session=(status:string,unread=false)=>({id:status,title:status,taskTitle:'',agent:'Codex',cwd:'',status,tool:'',started:0,activeSince:0,runningMs:0,updated:0,waitingSince:0,completedAt:0,unread,avatar:0});
test('compact presentation distinguishes evidence-free sessions from idle',()=>{
 expect(activityPresentation([]).label).toBe('空闲');
 expect(activityPresentation([session('idle')]).status).toBe('idle');
 expect(activityPresentation([session('unknown')]).label).toBe('未接入');
});
test('working remains visible even alongside unread completions; attention wins',()=>{
 expect(activityPresentation([session('done',true),session('working')])).toMatchObject({status:'working',label:'工作中 1',unread:1});
 expect(activityPresentation([session('attention'),session('working')])).toMatchObject({status:'attention',label:'待处理 1',working:1});
});
test('reading a completion changes persistent badge to idle',()=>{
 const state=createIslandState();state.event({sessionId:'s',event:'Stop',time:1});
 expect(activityPresentation(state.snapshot().sessions).label).toBe('新完成 1');
 state.read('s');expect(activityPresentation(state.snapshot().sessions).label).toBe('空闲');
});
test('native payload stays bounded and excludes terminal text, directories and secrets',()=>{
 const p=activityPresentation(Array.from({length:100},(_,i)=>({...session('working'),id:String(i),title:'x'.repeat(1000),cwd:'/private',tool:'sensitive'})));
 expect(p.sessions.length).toBe(4);expect(p.sessions[0]!.title.length).toBe(80);
 expect(JSON.stringify(p)).not.toContain('/private');expect(JSON.stringify(p).length).toBeLessThan(4000);
});
