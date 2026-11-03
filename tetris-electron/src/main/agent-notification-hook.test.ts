import { test, expect } from 'bun:test';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
async function run(mode: string, input: object, accept: boolean) {
  const dir=mkdtempSync(join(tmpdir(),'collab-hook-'));
  const socketPath=join(dir,'rpc.sock'), file=join(dir,'path');
  const received: any[]=[];
  const server=createServer(socket=>socket.on('data',data=>{received.push(JSON.parse(data.toString()));socket.end('{"ok":true}\n');}));
  await new Promise<void>(r=>server.listen(socketPath,r)); writeFileSync(file,socketPath);
  try {
    const helper=resolve(import.meta.dir,'../../resources/agent-notify.cjs');
    const args=[helper,mode,...(mode==='codex'?[JSON.stringify(input)]:[])];
    const child=spawn(process.execPath,args,{env:{...process.env,COLLAB_NOTIFY_ROUTE:'route-123',COLLAB_NOTIFY_SOCKET_FILE:file},stdio:['pipe','pipe','pipe']});
    child.stdin.end(mode==='codex'?'':JSON.stringify(input));
    const code=await new Promise(r=>child.on('exit',r));
    expect(code).toBe(0); expect(received).toHaveLength(accept?1:0);
    if(accept){expect(received[0].method).toBe(mode==='claude-tool'?'terminal.island-event':'terminal.notify');expect(received[0].params.route).toBe('route-123');}
    return received[0]?.params;
  } finally { await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true}); }
}
test('Codex hook forwards only agent-turn-complete',async()=>{
  expect((await run('codex',{type:'agent-turn-complete'},true)).kind).toBe('complete');
  await run('codex',{type:'other'},false);
});
test('Claude Stop and permission events are distinct and idle/subsequent stop noise is ignored',async()=>{
  expect((await run('claude-stop',{},true)).kind).toBe('complete');
  expect((await run('claude-attention',{notification_type:'permission_prompt'},true)).kind).toBe('attention');
  await run('claude-attention',{notification_type:'idle_prompt'},false);
  await run('claude-stop',{stop_hook_active:true},false);
});
test('completion previews use the actual final reply from both agents', async () => {
  expect((await run('codex', {type:'agent-turn-complete', 'last-assistant-message':'修复了登录失败。\n全部测试通过。'}, true)).body).toBe('修复了登录失败。 全部测试通过。');
  expect((await run('claude-stop', {last_assistant_message:'已完成文件树懒加载'}, true)).body).toBe('已完成文件树懒加载');
  expect((await run('claude-attention', {notification_type:'permission_prompt', message:'需要确认执行 npm test'}, true)).body).toBe('需要确认执行 npm test');
});
test('previews sanitize controls, bound long replies, and fall back for absent content', async () => {
  const body = (await run('codex', {type:'agent-turn-complete', 'last-assistant-message':'\x1b[31m完成\x1b[0m\x07\u202e\n' + '测'.repeat(400)}, true)).body;
  expect(body.startsWith('完成 测')).toBe(true);
  expect(body.length).toBe(300);
  expect(body.endsWith('…')).toBe(true);
  expect((await run('claude-stop', {last_assistant_message:42}, true)).body).toBe('本轮回复已完成');
  expect((await run('codex', {type:'agent-turn-complete', 'last-assistant-message':'  \n '}, true)).body).toBe('本轮回复已完成');
});

test('completion hooks retain stable turn identities across delayed replays', async () => {
  for (const mode of ['codex','claude-stop']) {
    const payload = mode === 'codex'
      ? {type:'agent-turn-complete','thread-id':'session','turn-id':'first','last-assistant-message':'Done'}
      : {session_id:'session',prompt_id:'first',last_assistant_message:'Done'};
    const first = await run(mode, payload, true);
    const replay = await run(mode, payload, true);
    const next = await run(mode, {...payload, ...(mode === 'codex' ? {'turn-id':'second'} : {prompt_id:'second'})}, true);
    expect(first.eventId).toMatch(/^[a-f0-9]{64}$/);
    expect(replay.eventId).toBe(first.eventId);
    expect(next.eventId).not.toBe(first.eventId);
  }
});

test('Claude user prompts establish a new turn for legacy notification deduplication',async()=>{
  expect((await run('claude-start', {session_id:'session',prompt:'Next task'}, true)).kind).toBe('started');
});

test('completion identity is stable if a replay updates its message', async () => {
  const payload = {type:'agent-turn-complete','thread-id':'session','turn-id':'turn','last-assistant-message':'Done'};
  const first = await run('codex', payload, true);
  expect((await run('codex', {...payload,'last-assistant-message':'Done with details'}, true)).eventId).toBe(first.eventId);
});

test('Claude attention events distinguish prompts and preserve replay identity', async () => {
  const payload = {session_id:'s',prompt_id:'p',notification_type:'permission_prompt',message:'Allow command?'};
  const first = await run('claude-attention', payload, true);
  expect(first.eventId).toMatch(/^[a-f0-9]{64}$/);
  expect((await run('claude-attention', payload, true)).eventId).toBe(first.eventId);
  expect((await run('claude-attention', {...payload,message:'Allow another command?'}, true)).eventId).not.toBe(first.eventId);
  expect((await run('claude-attention', {...payload,prompt_id:'next'}, true)).eventId).not.toBe(first.eventId);
  expect((await run('claude-start', payload, true)).eventId).toBe((await run('claude-stop', payload, true)).eventId);
});

test('Claude tool lifecycle reports semantic activity with session routing',async()=>{
 const p=await run('claude-tool',{hook_event_name:'PostToolUse',tool_name:'Bash',cwd:'/work/project'},true);
 expect(p.event).toBe('PostToolUse');expect(p.agent).toBe('Claude Code');expect(p.cwd).toBe('/work/project');expect(p.tool).toBe('Bash');
});

test('subagent hooks cannot finish or restart the parent terminal',async()=>{
 await run('claude-stop',{agent_id:'child',last_assistant_message:'child done'},false);
 await run('claude-tool',{agent_id:'child',hook_event_name:'PreToolUse',tool_name:'Bash'},false);
});
