/** Real Claude supervisor/model + persistent task ledger. Worker transport is a fixture.
 * Run: bun scripts/tests/tetris-agent-decision-routing.ts
 */
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Supervisor } from '../../src/main/supervisor';
import { SupervisorRuntime } from '../../src/main/supervisor-runtime';
import { SuperAgentTasks } from '../../src/main/super-agent-tasks';
const root = mkdtempSync(join(tmpdir(), 'tetris-decision-routing-'));
const workspace = join(root, 'project'); mkdirSync(workspace);
const runtime = new SupervisorRuntime(join(root, 'agent-home'));
const tasks = new SuperAgentTasks(join(root, 'tasks.json'));
const mutations: Array<{ tool: string; taskId?: string; userText: string }> = [];
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const log = (stage: string, details: object = {}) => console.log(JSON.stringify({ stage, at: new Date().toISOString(), root, ...details }));
const supervisor = new Supervisor(join(root, 'conversations.json'), {
  context: async () => ({ workspaces: [{ cwd: workspace, name: 'project' }], ide: { tiles: [], selectedTileIds: [] } }),
  tasks: () => tasks.list().map(t => ({ id: t.id, title: t.title, cwd: t.cwd, provider: t.provider, originConversationId: t.originConversationId, status: t.runs.at(-1)?.status, decisions: t.decisions })),
  run: (input, execute, onSession, onTool) => runtime.run(input, execute, onSession, onTool),
  execute: async (_id, call, _messageId, _isolated, meta) => {
    const task = tasks.get(call.taskId || '');
    if (call.tool === 'get_task_status') return { taskId: task?.id, text: JSON.stringify(task) };
    mutations.push({ tool: call.tool, ...(call.taskId ? { taskId: call.taskId } : {}), userText: meta.userText });
    if (call.tool !== 'resolve_decision' || !task) throw Error('This fixture only accepts a pending decision resolution');
    const resolved = tasks.resolveDecision(task.id, call.requestId!, { userMessageId: meta.userMessageId, userText: meta.userText, instruction: call.instruction!, interpretation: call.instruction! });
    if (!resolved.alreadyResolved) tasks.markDecisionDelivered(task.id, call.requestId!);
    return { taskId: task.id, text: '人的决定已记录并交给测试 worker transport；没有实际启动外部命令。' };
  },
});
const conversation = supervisor.create();
function seed(sessionId: string, title: string) {
  const id = tasks.register(sessionId, workspace, title, { provider: 'claude', originConversationId: conversation.id });
  const run = tasks.start(sessionId, workspace, title, {});
  tasks.applyReport({ taskId: id, runId: run, status: 'needs_decision', summary: '等待用户选择标题', decision: { question: '标题选方案 A「原始标题」还是方案 B「新标题」？', reason: '需要用户明确选择', impact: '下一轮将按选择给出建议标题，先不改文件。' } });
  return id;
}
const a = seed('fixture-worker-a', '首页标题调整'), b = seed('fixture-worker-b', '关于页标题调整');
async function turn(text: string, selected: string[] = []) {
  const messageId = supervisor.send(conversation.id, text, 'claude', false, selected);
  const start = Date.now(); let lastLog = 0;
  while (Date.now() - start < 150000) {
    const state = supervisor.snapshot(conversation.id), message = state.messages.find(m => m.id === messageId);
    if (message?.state === 'failed') throw Error(state.messages.at(-1)?.failureDetail || state.messages.at(-1)?.text || 'Supervisor turn failed');
    if (!state.busy && message?.state === 'done') return state;
    if (Date.now() - lastLog > 10000) { log('waiting', { messageId, elapsedMs: Date.now() - start }); lastLog = Date.now(); }
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('Supervisor model turn exceeded observation deadline');
}
try {
  log('started', { conversationId: conversation.id, taskA: a, taskB: b, workerTransport: 'fixture', runtime: 'real Claude session' });
  const ambiguous = await turn('那就用方案 B，继续吧。');
  assert(mutations.length === 0, 'Ambiguous decision mutated a task');
  assert(tasks.list().every(t => t.decisions?.[0]?.status === 'pending'), 'Ambiguous decision consumed a pending request');
  log('ambiguity-clarified', { mutations: 0, reply: ambiguous.messages.at(-1)?.text });
  const nativeSession = supervisor.list()[0]!.runtimeSessionId;
  const userText = '我说的是关于页标题调整这个 Task，选方案 B，标题用「新标题」。首页那个先继续等着，不要推进。';
  const clear = await turn(userText, [b]);
  assert(mutations.length === 1 && mutations[0]?.tool === 'resolve_decision' && mutations[0]?.taskId === b, 'Clear decision did not resolve exactly task B');
  const taskA = tasks.get(a)!, taskB = tasks.get(b)!;
  assert(taskA.decisions?.[0]?.status === 'pending', 'Task A was incorrectly advanced');
  assert(taskA.runs.length === 1, 'Task A got an extra run');
  assert(taskB.decisions?.[0]?.status === 'resolved', 'Task B decision is not resolved');
  assert(taskB.decisions[0].response?.userText === userText, 'Raw human decision was not preserved');
  assert(taskB.decisions[0].response?.deliveryStatus === 'delivered', 'Decision was not delivered once');
  assert(supervisor.list()[0]?.runtimeSessionId === nativeSession, 'Supervisor native session changed');
  const restored = new SuperAgentTasks(join(root, 'tasks.json'));
  assert(restored.get(b)?.decisions?.[0]?.response?.userText === userText, 'Decision was not durable');
  log('passed', { realModel: true, workerTransport: 'fixture', ambiguousMutations: 0, clearMutations: mutations.length, resolvedTask: b, otherTaskPending: true, rawHumanPreserved: true, sessionPreserved: true, reply: clear.messages.at(-1)?.text });
} catch (error) { log('failed', { error: String(error), mutations }); process.exitCode = 1; }
finally { supervisor.close(); runtime.close(); }
