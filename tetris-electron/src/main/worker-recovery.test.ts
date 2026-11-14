import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SuperAgentTasks } from './super-agent-tasks';
import { isMissingSessionResponse, recoveryInstruction } from './worker-recovery';

test('only authoritative exact-session missing errors permit replacement', () => {
  expect(isMissingSessionResponse({code:-32002,message:'Resource not found: s',data:{uri:'s'}},'s','claude')).toBe(true);
  for(const error of [new Error('Authentication failed'),new Error('Network timeout'),new Error('Resource not found: s'),{code:-32002,data:{uri:'/file'}},{code:401,message:'session_not_found'}]) expect(isMissingSessionResponse(error,'s','claude')).toBe(false);
  expect(isMissingSessionResponse({code:'thread_not_found',data:{thread_id:'thread'}},'thread','codex')).toBe(true);
  expect(isMissingSessionResponse({code:'thread_not_found',data:{thread_id:'another'}},'thread','codex')).toBe(false);
});

test('recovery keeps task, decisions and artifact versions while replacing run/session once', () => {
  const dir=mkdtempSync(join(tmpdir(),'tetris-recovery-'));
  try {
    const path=join(dir,'tasks.json'),store=new SuperAgentTasks(path);
    const taskId=store.register('original','/worktree','Task',{originConversationId:'conversation'});
    store.updateSession('original',{sourceCwd:'/source',threadId:'old-thread'});
    const first=store.start('original','/worktree','Original goal',{});
    const request=store.requestDecision(taskId,first,{question:'Change layout?'});
    store.resolveDecision(taskId,request.id,{userMessageId:'m',userText:'先补内容，布局别动。',instruction:'Keep layout'});
    store.markDecisionDelivered(taskId,request.id);
    const source=join(dir,'report.md');writeFileSync(source,'prior report');const artifact=store.attachArtifact(first,source);
    const continuation=store.start('original','/worktree','Keep layout',{},true,'continue');
    const task=store.get(taskId)!,run=task.runs.at(-1)!;
    const instruction=recoveryInstruction(task,run,'Session missing');
    expect(instruction).toContain('Original goal');expect(instruction).toContain('先补内容，布局别动。');expect(instruction).toContain(artifact.hash);expect(instruction).toContain('/worktree');
    const recovered=store.reserveRecovery(taskId,continuation,'Session missing',instruction);
    expect(store.reserveRecovery(taskId,continuation,'Session missing',instruction)).toBe(recovered);
    expect(store.get(taskId)?.runs).toHaveLength(3);expect(store.get(taskId)?.threadId).toBeUndefined();
    store.bindSession(taskId,'new-native-session');expect(store.get(taskId)?.sessionId).toBe('new-native-session');
    expect(store.get(taskId)?.runs.at(-1)?.recovery?.previousSessionId).toBe('original');
    expect(store.get(taskId)?.originConversationId).toBe('conversation');
    expect(()=>store.reserveRecovery(taskId,recovered,'again','again')).toThrow('already attempted');
    // Simulate a crash after durable reservation/bind, before external prompt delivery.
    const restarted=new SuperAgentTasks(path);expect(restarted.get(taskId)?.runs.at(-1)?.status).toBe('interrupted');
    expect(restarted.get(taskId)?.runs).toHaveLength(3);expect(readFileSync(artifact.path,'utf8')).toBe('prior report');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('cancelled attempts never recover and editable report views cannot change archived bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tetris-recovery-cancel-'));
 try{
 const store=new SuperAgentTasks(join(dir,'tasks.json')),task=store.register('s','/p','Task'),run=store.start('s','/p','Work',{},true);
 store.finish(run,'cancelled','User cancelled');expect(()=>store.reserveRecovery(task,run,'missing','retry')).toThrow('cancelled');
 const source=join(dir,'report.md');writeFileSync(source,'archived version');const artifact=store.attachArtifact(run,source);
 const view=store.artifactView(run);writeFileSync(view,'user edits');expect(readFileSync(artifact.path,'utf8')).toBe('archived version');
 writeFileSync(artifact.path,'tampered archive');expect(()=>store.artifactView(run)).toThrow('内容已变化');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
