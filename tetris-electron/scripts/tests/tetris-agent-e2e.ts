/** Opt-in real-provider smoke. Run with node scripts/test-tetris-agent-e2e.mjs.
 * Uses temporary app data and a temporary workspace with a read-only task.
 * Canvas rendering is stubbed; supervisor, IPC, provider, reports and decisions are real.
 */
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { registerAgentIpc, killAllAgents } from '../../src/main/acp-agent';
import { registerCanvasRpc } from '../../src/main/canvas-rpc';
const repo = resolve(process.env.TETRIS_E2E_REPO || process.cwd());
const routing = process.env.TETRIS_E2E_CASE === 'routing';
const provider = routing || process.env.TETRIS_E2E_WORKER === 'codex' ? 'codex' : 'claude';
const root = mkdtempSync(join(tmpdir(), 'tetris-e2e-'));
const workspace = join(root, routing ? 'project-alpha' : 'project');
const secondWorkspace = join(root, 'project-beta');
mkdirSync(workspace);
// Codex exec requires a Git worktree unless its native trust check is bypassed.
// Keep the native check intact and make this disposable fixture a repository.
execFileSync('git', ['init', '--quiet', workspace]);
writeFileSync(join(workspace, 'INPUT.md'), '# Demo\n\nContent token: E2E_INPUT_7351.\n');
if (routing) {
  mkdirSync(secondWorkspace); execFileSync('git', ['init', '--quiet', secondWorkspace]);
  writeFileSync(join(secondWorkspace, 'INPUT.md'), '# Demo beta\n\nContent token: E2E_BETA_8642.\n');
}
app.setPath('userData', join(root, 'app-data')); app.setAppPath(repo);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let win: BrowserWindow;
const invoke = (name: string, ...args: unknown[]) => win.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},...${JSON.stringify(args)})`);
const log = (stage: string, details: unknown = {}) => console.log(JSON.stringify({ stage, at: new Date().toISOString(), ...details as object }));
async function poll<T>(stage: string, probe: () => Promise<T | undefined>, ms = 180000): Promise<T> {
  const start = Date.now(); let last = 0;
  while (Date.now() - start < ms) {
    const value = await probe(); if (value !== undefined) return value;
    if (Date.now() - last > 10000) { log(stage, { waiting: true, elapsedMs: Date.now() - start }); last = Date.now(); }
    await sleep(800);
  }
  throw new Error(`${stage} timed out after ${ms}ms; state preserved at ${root}`);
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function answer(id: string, text: string, preferred = provider) {
  const messageId = await invoke('supervisor:send', id, text, preferred, false, []);
  return poll<any>('supervisor-answer', async () => {
    const state = await invoke('supervisor:snapshot', id), message = state.messages.find((m: any) => m.id === messageId);
    if (message?.state === 'failed') throw Error('Supervisor failed: ' + (state.messages.at(-1)?.failureDetail || state.messages.at(-1)?.text));
    return message?.state === 'done' ? state : undefined;
  });
}
async function verifyReplay(conversationId: string, taskId: string) {
  const before = JSON.stringify(await invoke('agent:tasks'));
  await invoke('supervisor:task-replay', conversationId, taskId);
  const after = JSON.stringify(await invoke('agent:tasks'));
  assert(before === after, 'replay mutated task execution');
  const calls = await win.webContents.executeJavaScript('window.canvasCalls');
  const replay = calls.findLast((c: any) => c.method === 'taskReplay');
  assert(replay?.params.canvasId === 'agent:live', 'replay targeted wrong canvas');
  assert(replay.params.events.length > 0 && replay.params.artifacts.length > 0, 'replay omitted saved history');
  return { events: replay.params.events.length, artifacts: replay.params.artifacts.length };
}
async function main() {
try {
  win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  // Persistent notifications are real; config below suppresses desktop test banners.
  win.isFocused = () => true;
  await win.loadURL('data:text/html,<html><body>Tetris Agent integration verification</body></html>');
  await win.webContents.executeJavaScript(`{
    const {ipcRenderer}=require('electron'); window.canvasCalls=[]; window.canvasTiles=[];
    ipcRenderer.on('canvas:rpc-request',(_event,request)=>{
      const {requestId,method,params}=request;window.canvasCalls.push({method,params});let result={};
      if(method==='contextSnapshot'||method==='tileList')result={canvasId:'ide:default',tiles:[],groups:[],selectedTileIds:[],focusedTileId:null};
      else if(method==='workerTile'){let tile=window.canvasTiles.find(t=>t.sessionId===params.sessionId);if(!tile){tile={tileId:'worker-'+params.sessionId,sessionId:params.sessionId};window.canvasTiles.push(tile);}result=tile;}
      else if(method==='tileCreate')result={tileId:'report-'+Date.now()};
      ipcRenderer.send('canvas:rpc-response',{requestId,result});
    }); void 0;
  }`);
  registerCanvasRpc(win);
  const config = {workspaces:routing ? [workspace,secondWorkspace] : [workspace],expanded_workspaces:[],window_state:null,ui:{defaultWorker:provider,taskSystemNotifications:false}};
  registerAgentIpc(win, config);
  const a = await invoke('supervisor:create'), b = await invoke('supervisor:create');
  log('started', { root, workspace, provider, conversationA: a.id, conversationB: b.id });
  if (routing) {
    const ambiguous = await answer(a.id, '帮我检查一下项目内容，只读，不要修改文件。');
    assert((await invoke('agent:tasks')).length === 0, 'ambiguous request dispatched a task');
    log('ambiguous-project', { noDispatch: true, reply: ambiguous.messages.at(-1).text });
    await invoke('supervisor:send', a.id, '指的是 project-alpha，使用默认执行器。创建独立 Task，只读取 INPUT.md 并返回其中标记，不做任何修改。允许通过只读 cat 命令查看文件。', provider, false, []);
    const defaultTask = await poll<any>('default-worker', async () => (await invoke('agent:tasks')).find((t:any) => t.originConversationId === a.id));
    assert(defaultTask.provider === 'codex' && defaultTask.cwd === realpathSync(workspace), 'default provider or named workspace routing wrong');
    log('default-worker', { taskId: defaultTask.id, provider: defaultTask.provider, cwd: defaultTask.cwd });
    await invoke('supervisor:send', b.id, '请在 project-beta 创建一个独立 Task，这次明确使用 Claude Code。只读取 INPUT.md 并返回其中标记，不修改文件，不执行终端命令。', provider, false, []);
    const overrideTask = await poll<any>('explicit-worker', async () => (await invoke('agent:tasks')).find((t:any) => t.originConversationId === b.id));
    assert(overrideTask.provider === 'claude' && overrideTask.cwd === realpathSync(secondWorkspace), 'explicit executor override or second workspace wrong');
    config.ui.defaultWorker = 'claude';
    assert((await invoke('agent:tasks')).find((t:any) => t.id === defaultTask.id).provider === 'codex', 'changing preference changed existing task executor');
    // The default-provider routing assertion needs no duplicate long Codex inference.
    await invoke('agent:cancel', defaultTask.sessionId);
    const finished = await poll<any>('override-result', async () => {
      const t = (await invoke('agent:tasks')).find((t:any) => t.id === overrideTask.id);
      if(t.runs.at(-1)?.status === 'failed') throw Error('Override worker failed: ' + t.runs.at(-1)?.detail);
      return t.runs.at(-1)?.status === 'ready_for_review' ? t : undefined;
    });
    assert(finished.runs.at(-1).output.includes('E2E_BETA_8642'), 'worker read wrong workspace content');
    const replay = await verifyReplay(b.id, finished.id);
    log('routing-passed', { defaultProvider: 'codex', explicitProvider: 'claude', oldProviderPreserved: true, exactWorkspace: true, replay, root });
    killAllAgents();win.destroy();app.exit(0);return;
  }
  const request = `请在已添加的项目 ${workspace} 创建一个独立 ${provider === 'codex' ? 'Codex' : 'Claude Code'} Task，名称“集成验证”。明确派发以下要求：只读取 INPUT.md，确认其中的内容标记，然后在标题方案 A“原始标题”和 B“新标题”之间向我请求自然语言决定。这一轮必须停止并回报 needs_decision；先不要替我决定，不修改任何文件、不执行终端命令。等我回复后在同一个 Task 继续，给出建议标题即可完成。`;
  await invoke('supervisor:send', a.id, request, provider, false, []);
  let task = await poll<any>('task-created', async () => (await invoke('agent:tasks')).find((t:any)=>t.originConversationId===a.id));
  log('task-created', { taskId: task.id, provider: task.provider, cwd: task.cwd, status:task.runs.at(-1)?.status });
  assert(task.provider===provider, 'wrong executor'); assert(task.cwd===realpathSync(workspace),'wrong task directory');
  await invoke('supervisor:send', b.id, '我在新对话中，只问你是谁，不创建任务。请简短回复。', 'claude', false, []);
  const second = await poll<any>('independent-chat', async()=>{const s=await invoke('supervisor:snapshot',b.id);return !s.busy&&s.messages.some((m:any)=>m.role==='assistant'&&m.state==='done')?s:undefined;});
  assert(second.messages.every((m:any)=>!m.taskIds.length),'task leaked into new conversation');
  log('independent-chat', { answered: true });
  task = await poll<any>('worker-decision', async()=>{
    const t=(await invoke('agent:tasks')).find((t:any)=>t.id===task.id);
    if(t.runs.at(-1)?.status==='failed')throw Error('Worker failed: '+t.runs.at(-1)?.detail);
    return t.decisions?.some((d:any)=>d.status==='pending'&&d.kind!=='permission')?t:undefined;
  });
  const originalSession = task.sessionId, decision = task.decisions.find((d:any)=>d.status==='pending');
  const userDecision = '选择方案 B，建议标题就用「新标题」。只输出建议，不改文件。请让原来的 worker 继续这个任务并完成。';
  log('decision-received', { taskId:task.id, decisionId:decision.id, status:task.runs.at(-1)?.status });
  await invoke('supervisor:send', a.id, userDecision, provider, false, [task.id]);
  task = await poll<any>('worker-resumed', async()=>{
    const t=(await invoke('agent:tasks')).find((t:any)=>t.id===task.id);
    if(t.runs.at(-1)?.status==='failed')throw Error('Resumed worker failed: '+t.runs.at(-1)?.detail);
    return t.runs.length>=2&&t.runs.at(-1)?.status==='ready_for_review'?t:undefined;
  });
  assert(task.sessionId===originalSession,'worker session replaced');
  assert(task.originConversationId===a.id,'task origin changed');
  assert(task.decisions.some((d:any)=>d.response?.userText===userDecision),'raw decision missing');
  assert(existsSync(task.runs.at(-1).artifactPath),'report not saved');
  assert(readFileSync(join(workspace,'INPUT.md'),'utf8')==='# Demo\n\nContent token: E2E_INPUT_7351.\n','worker edited readonly fixture');
  const notices = await invoke('supervisor:notifications');
  assert(notices.some((n:any)=>n.taskId===task.id&&n.conversationId===a.id),'task notification missing/origin wrong');
  const allTasks=await invoke('agent:tasks'); assert(allTasks.length===1,'duplicate task created');
  const calls=await win.webContents.executeJavaScript('window.canvasCalls');
  assert(calls.some((c:any)=>c.method==='workerTile'),'no worker tile dispatch');
  const replay = await verifyReplay(a.id, task.id);
  log('passed',{taskId:task.id,runs:task.runs.length,sameWorkerSession:true,decisionPersisted:true,report:task.runs.at(-1).artifactPath,notifications:notices.length,replay,root});
  killAllAgents();win.destroy();app.exit(0);
} catch(error) {
  log('failed',{error:String(error),root});killAllAgents();if(win!&&!win.isDestroyed())win.destroy();app.exit(1);
}

}
void app.whenReady().then(main);
