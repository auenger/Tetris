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
    if(accept){expect(received[0].method).toBe('terminal.notify');expect(received[0].params.route).toBe('route-123');}
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
