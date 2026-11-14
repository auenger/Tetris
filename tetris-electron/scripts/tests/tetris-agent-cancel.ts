/** Real Electron IPC/Task store cancellation regression; model/provider transports are fixtures. */
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { registerAgentIpc, killAllAgents } from '../../src/main/acp-agent';
import { registerCanvasRpc } from '../../src/main/canvas-rpc';
import { SuperAgentTasks } from '../../src/main/super-agent-tasks';
import { faults } from './fixtures/agent-fault-boundary';
const root = realpathSync(process.env.TETRIS_CANCEL_ROOT!), reload = process.env.TETRIS_CANCEL_RELOAD === '1';
const workspace = join(root, 'workspace'), data = join(root, 'data');
mkdirSync(workspace, { recursive: true }); mkdirSync(data, { recursive: true });
mkdirSync(join(root, 'node_modules/@agentclientprotocol/claude-agent-acp/dist'), { recursive: true });
writeFileSync(join(root, 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js'), 'process.stdin.resume();\n');
app.setPath('userData', data); app.setAppPath(root);
if (!reload) {
  const store = new SuperAgentTasks(join(data, 'super-agent-tasks.json'));
  const ids = [];
  for (const name of ['first-review', 'second-review', 'accepted', 'race-followup', 'race-decision']) {
    const id = store.register(name, workspace, name, name === 'first-review' ? { originConversationId: 'origin' } : {});
    const runId = store.start(name, workspace, `Original ${name}`, {});
    let requestId: string | undefined;
    if (name === 'race-decision') requestId = store.requestDecision(id, runId, { question: 'Proceed?' }).id;
    else store.applyReport({ taskId: id, runId, status: 'completed', summary: `Historical ${name} report` });
    if (name === 'accepted') store.complete(id);
    ids.push({ id, runId, sessionId: name, requestId });
  }
  writeFileSync(join(root, 'ids.json'), JSON.stringify(ids));
  const now = new Date().toISOString();
  writeFileSync(join(data, 'supervisor-conversations.json'), JSON.stringify({ version: 2, conversations: [{ id: 'origin', title: 'Original result', createdAt: now, updatedAt: now, unread: 0,
    messages: [{ id: 'old-result', role: 'event', text: 'Earlier ready_for_review result', state: 'done', createdAt: now, taskIds: [ids[0]!.id], eventId: `${ids[0]!.runId}:result` }] }] }));
}
const ids = JSON.parse(readFileSync(join(root, 'ids.json'), 'utf8'));
const assert = (value: unknown, text: string) => { if (!value) throw Error(text); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let win: BrowserWindow;
const invoke = (channel: string, ...args: unknown[]) => win.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke(${JSON.stringify(channel)},...${JSON.stringify(args)})`);
async function send(id: string, request: object) {
  const messageId = await invoke('supervisor:send', id, JSON.stringify(request), 'claude', false, []);
  for (let n = 0; n < 100; n++) {
    const snapshot = await invoke('supervisor:snapshot', id), message = snapshot.messages.find((item: any) => item.id === messageId);
    if (message?.state === 'failed') throw Error(message.failureDetail);
    if (message?.state === 'done') return snapshot.messages.find((item: any) => item.sourceMessageId === messageId);
    await sleep(20);
  }
  throw Error('Supervisor IPC timeout');
}
void app.whenReady().then(async () => {
  app.dock?.hide();
  try {
    win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('data:text/html,Task cancellation regression');
    await win.webContents.executeJavaScript(`window.contextCount=0;require('electron').ipcRenderer.on('canvas:rpc-request',(_e,{requestId,method})=>{if(method==='contextSnapshot' && ++window.contextCount===window.holdNthContext){window.heldContext=requestId;return;}require('electron').ipcRenderer.send('canvas:rpc-response',{requestId,result:method==='contextSnapshot'?{tiles:[],groups:[],selectedTileIds:[]}: method==='workerTile'?{tileId:'fixture-worker'}:{}})});void 0;`);
    registerCanvasRpc(win); registerAgentIpc(win, { workspaces: [workspace], expanded_workspaces: [], window_state: null, ui: { defaultWorker: 'claude', taskSystemNotifications: false } });
    const conversation = await invoke('supervisor:create');
    if (!reload) {
      const calls = ids.slice(0, 2).map((task: any) => ({ tool: 'cancel_task', taskId: task.id }));
      const reply = await send(conversation.id, { calls });
      const results = JSON.parse(reply.text);
      assert(results.length === 2 && results.every((result: any) => result.text.includes('已取消（cancelled）')), 'cancel tools reported success without confirmed state');
      await send(conversation.id, { calls });
      const rejected = await send(conversation.id, { tool: 'cancel_task', taskId: ids[2].id }).then(() => false, error => /验收完成/.test(String(error)));
      assert(rejected, 'accepted task was silently cancelled');
      for (const [index, tool] of [[3, 'send_task_message'], [4, 'resolve_decision']] as const) {
        await win.webContents.executeJavaScript('window.contextCount=0;window.holdNthContext=3;window.heldContext=null;');
        const request = { tool, taskId: ids[index].id, instruction: 'Continue after canvas context', ...(tool === 'resolve_decision' ? { requestId: ids[index].requestId } : {}) };
        const messageId = await invoke('supervisor:send', conversation.id, JSON.stringify(request), 'claude', false, []);
        let held = false;
        for (let n = 0; n < 100; n++) { if (await win.webContents.executeJavaScript('!!window.heldContext')) { held = true; break; } await sleep(20); }
        assert(held, 'did not reach delayed dispatch context boundary');
        await invoke('agent:cancel', { sessionId: ids[index].sessionId });
        await win.webContents.executeJavaScript(`require('electron').ipcRenderer.send('canvas:rpc-response',{requestId:window.heldContext,result:{tiles:[],groups:[],selectedTileIds:[]}});window.holdNthContext=0;`);
        let failed = false;
        for (let n = 0; n < 100; n++) { const s = await invoke('supervisor:snapshot', conversation.id); if (s.messages.find((m: any) => m.id === messageId)?.state === 'failed') { failed = true; break; } await sleep(20); }
        assert(failed, 'stale in-flight instruction was accepted after cancellation');
        const current = (await invoke('agent:tasks')).find((task: any) => task.id === ids[index].id);
        assert(current.runs.length === 1 && current.runs[0].status === 'cancelled', 'delayed context revived cancelled run');
      }
      assert(faults.prompts.length === 0 && faults.sessions === 0, 'cancel or stale instruction created a worker');
      // A genuinely later user instruction is allowed to start a fresh run.
      await send(conversation.id, { tool: 'send_task_message', taskId: ids[3].id, instruction: 'Explicit new instruction after cancellation' });
      let resumed = false;
      for (let n = 0; n < 100; n++) { const task = (await invoke('agent:tasks')).find((task: any) => task.id === ids[3].id); if (task.runs.length === 2 && task.runs.at(-1).status === 'ready_for_review') { resumed = true; break; } await sleep(20); }
      assert(resumed && faults.prompts.length === 1, 'explicit later continuation was rejected');
      await invoke('agent:cancel', { sessionId: (await invoke('agent:tasks')).find((task: any) => task.id === ids[3].id).sessionId });
    }
    const status = await send(conversation.id, { tool: 'get_task_status', taskId: ids[0].id });
    assert(JSON.parse(status.text).text.includes('状态：cancelled'), 'new conversation reports stale task status');
    const input = faults.supervisorInputs.findLast((input: any) => input.conversationId === conversation.id && !input.eventOnly);
    assert(ids.slice(0, 2).every((task: any) => input.tasks.find((item: any) => item.id === task.id)?.status === 'cancelled'), 'new conversation injected stale context');
    const tasks = await invoke('agent:tasks');
    for (const id of ids.slice(0, 2)) {
      const task = tasks.find((task: any) => task.id === id.id);
      assert(task.runs.length === 1 && task.runs[0].status === 'cancelled' && !task.completed, 'cancelled run was recreated or accepted');
      assert(task.runs[0].report.summary.includes('Historical'), 'original report lost');
      assert(task.events.filter((event: any) => event.type === 'run.cancelled').length === 1, 'repeated cancel duplicated transition');
    }
    assert(tasks.find((task: any) => task.id === ids[2].id).completed, 'acceptance was overwritten');
    const origin = await invoke('supervisor:snapshot', 'origin');
    assert(origin.messages.filter((m: any) => m.eventId === `${ids[0].runId}:result`).length === 1, 'original result lost');
    assert(origin.messages.filter((m: any) => m.eventId === `${ids[0].runId}:cancelled`).length === 1, 'cancel return missing or duplicated across restart');
    if (reload) assert(faults.prompts.length === 0 && faults.sessions === 0, 'restart replayed worker');
    console.log(JSON.stringify({ passed: true, phase: reload ? 'restarted-new-conversation' : 'two-cancel-tools', root, statuses: tasks.map((task: any) => [task.title, task.runs[0].status, task.completed]), nativeRequests: false }));
    killAllAgents(); win.destroy(); app.exit(0);
  } catch (error) { console.error(error, { root }); killAllAgents(); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); }
});
