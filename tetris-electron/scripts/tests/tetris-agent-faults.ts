import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerAgentIpc, killAllAgents } from '../../src/main/acp-agent';
import { registerCanvasRpc } from '../../src/main/canvas-rpc';
import { SuperAgentTasks } from '../../src/main/super-agent-tasks';
import { faults } from './fixtures/agent-fault-boundary';
const root = mkdtempSync(join(tmpdir(), 'tetris-faults-'));
const workspace = join(root, 'project'), deletedWorkspace = join(root, 'deleted-project');
mkdirSync(workspace); mkdirSync(deletedWorkspace);
mkdirSync(join(root, 'node_modules/@agentclientprotocol/claude-agent-acp/dist'), { recursive: true });
writeFileSync(join(root, 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js'), 'process.stdin.resume();\n');
app.setPath('userData', join(root, 'data')); app.setAppPath(root);
// An older run can have more than one archived report version.
const history = new SuperAgentTasks(join(root, 'data/super-agent-tasks.json'));
const historyId = history.register('historical-worker', workspace, 'historical-replay');
history.updateSession('historical-worker', { historyIncomplete: true, provider: 'codex' });
const historyRun = history.start('historical-worker', workspace, 'Original historical goal', {});
const reportPath = join(root, 'history.md');
writeFileSync(reportPath, 'Version one'); const firstVersion = history.attachArtifact(historyRun, reportPath);
writeFileSync(reportPath, 'Version two'); const secondVersion = history.attachArtifact(historyRun, reportPath);
history.finish(historyRun, 'ready_for_review');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let win: BrowserWindow;
const invoke = (name: string, ...args: unknown[]) => win.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},...${JSON.stringify(args)})`);
function assert(value: unknown, text: string): asserts value { if (!value) throw new Error(text); }
async function poll<T>(probe: () => Promise<T | undefined>, name: string): Promise<T> {
  for (let i = 0; i < 200; i++) { const value = await probe(); if (value !== undefined) return value; await sleep(25); }
  throw Error('Timed out: ' + name);
}
const task = async (id: string) => (await invoke('agent:tasks')).find((t: any) => t.id === id);
async function send(id: string, call: object) {
  const messageId = await invoke('supervisor:send', id, JSON.stringify(call), 'claude', false, []);
  return poll(async () => {
    const s = await invoke('supervisor:snapshot', id), m = s.messages.find((m: any) => m.id === messageId);
    if (m?.state === 'failed') throw Error(s.messages.at(-1)?.text);
    return m?.state === 'done' ? s : undefined;
  }, 'supervisor turn');
}
async function create(id: string, title: string, cwd = workspace) {
  await send(id, { tool: 'create_task', title, cwd, provider: 'claude', instruction: `Read-only original goal ${title}` });
  return poll(async () => (await invoke('agent:tasks')).find((t: any) => t.title === title), 'task creation');
}
const finished = (id: string, count: number, status: string) => poll(async () => {
  const t = await task(id); return t.runs.length === count && t.runs.at(-1).status === status ? t : undefined;
}, `${status} ${id}`);
const kill = (sessionId: string) => invoke('agent:kill', { sessionId });
async function main() {
  try {
    app.dock?.hide();
    win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('data:text/html,<html>Native lifecycle fault verification</html>');
    await win.webContents.executeJavaScript(`{
      const {ipcRenderer}=require('electron'); window.canvasCalls=[];
      ipcRenderer.on('canvas:rpc-request',(_e,{requestId,method,params})=>{
        window.canvasCalls.push({method,params});let result={};
        if(method==='contextSnapshot')result={canvasId:'ide:default',tiles:[],groups:[],selectedTileIds:[],focusedTileId:null};
        if(method==='workerTile')result={tileId:'worker-'+params.sessionId};
        ipcRenderer.send('canvas:rpc-response',{requestId,result});
      }); void 0;
    }`);
    registerCanvasRpc(win);
    registerAgentIpc(win, { workspaces: [workspace, deletedWorkspace], expanded_workspaces: [], window_state: null, ui: { defaultWorker: 'claude', taskSystemNotifications: false } });
    const conversation = await invoke('supervisor:create');
    await invoke('supervisor:task-replay', conversation.id, historyId);
    let replay = await win.webContents.executeJavaScript('window.canvasCalls.findLast(c=>c.method==="taskReplay").params');
    assert(replay.artifacts.length === 2 && replay.artifacts[0].content === 'Version one' && replay.artifacts[1].content === 'Version two', 'replay omitted earlier same-run artifact version');
    assert(replay.historyIncomplete === true && replay.provider === 'codex', 'replay dropped task history completeness or provider');
    assert(replay.artifacts.every((artifact: any) => artifact.kind === 'report' && artifact.sourcePath === reportPath), 'replay dropped artifact kind or original filename');
    writeFileSync(firstVersion.path, 'Tampered archive');
    await invoke('supervisor:task-replay', conversation.id, historyId);
    replay = await win.webContents.executeJavaScript('window.canvasCalls.findLast(c=>c.method==="taskReplay").params');
    assert(replay.artifacts.find((a: any) => a.id === firstVersion.id)?.missing === true && replay.artifacts.find((a: any) => a.id === secondVersion.id)?.content === 'Version two', 'replay accepted modified history or lost intact version');
    assert(replay.artifacts.find((a: any) => a.id === firstVersion.id)?.sourcePath === reportPath, 'unavailable artifact lost its display metadata');
    console.log('PASS replay: all archived versions retained and modified history rejected');
    if (process.env.TETRIS_REPLAY_ONLY === '1') {
      console.log(JSON.stringify({ passed: true, scope: 'replay IPC metadata and immutable artifacts', nativeRequests: false }));
      killAllAgents(); win.destroy(); app.exit(0); return;
    }
    let t = await create(conversation.id, 'missing-session'); t = await finished(t.id, 1, 'ready_for_review');
    const originalSession = t.sessionId, originalTask = t.id, oldArtifact = t.artifacts[0].path;
    await kill(t.sessionId); faults.resume = 'missing';
    await send(conversation.id, { tool: 'send_task_message', taskId: t.id, instruction: 'Continue original goal after session loss.' });
    t = await finished(t.id, 3, 'ready_for_review');
    assert(t.sessionId !== originalSession && t.id === originalTask, 'missing session replaced Task or retained nonexistent native session');
    assert(t.runs[1].status === 'failed' && t.runs[2].recovery.previousSessionId === originalSession, 'failed resume or recovery relationship missing');
    assert(faults.prompts.at(-1)!.text.includes('Read-only original goal missing-session') && faults.prompts.at(-1)!.text.includes(oldArtifact), 'recovery omitted goal or immutable artifact');
    assert((await invoke('agent:tasks')).length === 2 && faults.sessions === 2, 'missing native session created duplicate Task/worker');
    console.log('PASS missing native session: same Task, new run and worker, explicit recovery context');

    await kill(t.sessionId); faults.resume = 'network'; const priorSessions = faults.sessions;
    await send(conversation.id, { tool: 'send_task_message', taskId: t.id, instruction: 'Network failure must not create another worker.' });
    t = await finished(t.id, 4, 'failed');
    assert(faults.sessions === priorSessions && !t.runs[3].recovery && /ECONNRESET/.test(t.runs[3].detail), 'network failure triggered blind recovery');
    console.log('PASS transient native failure: no automatic replacement execution');

    faults.resume = 'ok'; let deleted = await create(conversation.id, 'directory-removed', deletedWorkspace);
    deleted = await finished(deleted.id, 1, 'ready_for_review'); await kill(deleted.sessionId); rmSync(deletedWorkspace, { recursive: true });
    const beforeDeleted = faults.initialized;
    await send(conversation.id, { tool: 'send_task_message', taskId: deleted.id, instruction: 'Continue in missing workspace.' });
    deleted = await finished(deleted.id, 2, 'failed');
    assert(faults.initialized === beforeDeleted && /ENOENT/.test(deleted.runs[1].detail), 'deleted workspace spawned worker or lost error');
    console.log('PASS deleted workspace: durable failure with original Task preserved');

    faults.permission = true; let permission = await create(conversation.id, 'cancel-permission');
    permission = await poll(async () => { const t = await task(permission.id); return t.decisions?.some((d: any) => d.status === 'pending') ? t : undefined; }, 'permission');
    const permissionId = permission.decisions.at(-1).id;
    await invoke('agent:cancel', { sessionId: permission.sessionId });
    permission = await finished(permission.id, 1, 'cancelled');
    assert(permission.decisions.every((d: any) => d.status !== 'pending'), 'cancel left stale permission decision');
    const promptsBeforeStale = faults.prompts.length;
    const rejected = await send(conversation.id, { tool: 'resolve_decision', taskId: permission.id, requestId: permissionId, instruction: 'Allow once', optionId: 'allow' }).then(() => false, () => true);
    assert(rejected && faults.prompts.length === promptsBeforeStale, 'stale cancelled permission resumed execution');
    console.log('PASS pending native permission cancellation: closed decision, stale reply rejected');

    writeFileSync(join(workspace, 'deliverable.md'), 'Immutable formal output');
    faults.artifacts = ['deliverable.md']; faults.stopReason = 'max_tokens';
    let truncated = await create(conversation.id, 'abnormal-stop');truncated=await finished(truncated.id,1,'blocked');
    assert(truncated.spec.goal === 'Read-only original goal abnormal-stop' && faults.prompts.at(-1)!.text.includes('Task specification'), 'TaskSpec missing in ledger or worker prompt');
    assert(truncated.runs[0].stopReason==='max_tokens' && truncated.events.some((e:any)=>e.type==='run.stopped'), 'native stop reason missing');
    const completion = await poll(async () => {
      const snapshot = await invoke('supervisor:snapshot', conversation.id);
      return snapshot.messages.find((message: any) => message.role === 'event' && message.taskIds.includes(truncated.id));
    }, 'blocked result reaches supervisor');
    assert(completion.text.includes('max_tokens') && completion.text.includes('App 状态说明'), 'supervisor lost App blocking reason behind worker success claim');
    assert(['raw-execution-log','result-summary','deliverable'].every(kind=>truncated.artifacts.some((a:any)=>a.kind===kind)), 'execution/result/formal artifact classes missing');
    const formal=truncated.artifacts.find((a:any)=>a.kind==='deliverable');
    assert(readFileSync(formal.path,'utf8')==='Immutable formal output' && truncated.runs[0].artifactPath!==formal.path,'formal archive missing or replaced primary summary');
    await invoke('agent:artifact-open',truncated.runs[0].id,formal.id);
    assert((await task(truncated.id)).events.some((e:any)=>e.type==='artifact.opened'&&e.payload.artifactId===formal.id),'opening explicit artifact did not retain exact version identity');
    const wrongOwner=await invoke('agent:artifact-open',permission.runs[0].id,formal.id).then(()=>false,()=>true);assert(wrongOwner,'artifact opened under wrong run');
    faults.artifacts=[];faults.stopReason='end_turn';
    console.log('PASS TaskSpec, raw abnormal stop, distinct artifact classes and exact artifact opening');

    let release!: () => void; faults.holdInitialize = new Promise(resolve => { release = resolve; });
    const beforeInitialize = faults.initialized, beforePrompts = faults.prompts.length;
    const delayed = await create(conversation.id, 'shutdown-during-spawn');
    await poll(async () => faults.initialized > beforeInitialize ? true : undefined, 'held initialization');
    assert((await task(delayed.id)).runs.at(-1).status === 'queued', 'durable run not reserved before native initialize');
    const tilesBefore = await win.webContents.executeJavaScript('window.canvasCalls.filter(c=>c.method==="workerTile").length');
    killAllAgents(); release(); await sleep(150);
    const disk = JSON.parse(readFileSync(join(root, 'data/super-agent-tasks.json'), 'utf8'));
    const saved = disk.tasks.find((t: any) => t.id === delayed.id);
    assert(saved.runs.at(-1).status === 'interrupted' && faults.prompts.length === beforePrompts, 'shutdown resurrected queued execution');
    assert(tilesBefore === await win.webContents.executeJavaScript('window.canvasCalls.filter(c=>c.method==="workerTile").length'), 'shutdown created delayed worker tile');
    console.log('PASS shutdown during native initialization: interrupted once, no late tile/prompt');
    console.log(JSON.stringify({ passed: true, root, tasks: disk.tasks.length, prompts: faults.prompts.length, nativeRequests: false }));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error, { root }); killAllAgents(); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); }
}
void app.whenReady().then(main);
