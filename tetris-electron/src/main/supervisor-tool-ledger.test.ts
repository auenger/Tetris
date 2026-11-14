import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from './supervisor';
import { SupervisorRuntime } from './supervisor-runtime';

type Handler = (args: any) => Promise<any>;
function fakeSdk(exercise: (call: (name: string, args: any) => Promise<any>) => Promise<void>) {
  const schema: any = { optional: () => schema };
  const z = { string: () => schema, array: () => schema, enum: () => schema };
  const sdk = {
    tool: (name: string, _description: string, _schema: unknown, handler: Handler) => ({ name, handler }),
    createSdkMcpServer: (options: any) => options,
    query: ({ options }: any) => ({ close() {}, async *[Symbol.asyncIterator]() {
      const definitions = options.mcpServers.tetris.tools as Array<{ name: string; handler: Handler }>;
      const call = (name: string, args: unknown) => definitions.find(tool => tool.name === name)!.handler(args);
      yield { type: 'system', subtype: 'init', session_id: options.sessionId || options.resume };
      await exercise(call);
      yield { type: 'result', subtype: 'success', is_error: false, result: 'Concise final answer.', session_id: options.sessionId || options.resume };
    } }),
  };
  return async () => ({ sdk, z });
}
async function settled(supervisor: Supervisor, id: string) {
  for (let i = 0; i < 100 && supervisor.snapshot(id).busy; i++) await new Promise(resolve => setTimeout(resolve, 2));
  expect(supervisor.snapshot(id).busy).toBe(false);
}

test('App ledger preserves every runtime tool input/raw result/error independently of final prose', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-tool-ledger-')), path = join(dir, 'conversations.json');
  let supervisor: Supervisor | undefined;
  const observedBeforeEffect: string[] = [];
  const runtime = new SupervisorRuntime(join(dir, 'home'), fakeSdk(async call => {
    await call('get_context', {});
    const memory = JSON.parse((await call('read_memory', { path: 'MEMORY.md' })).content[0].text);
    await call('update_memory', { path: 'MEMORY.md', content: 'User-confirmed durable preference.', expectedRevision: memory.revision });
    await call('create_task', { cwd: '/project', provider: 'claude', title: 'Inspect', instruction: 'Inspect only', scope: ['No writes'], expectedArtifacts: ['Summary'], acceptance: ['Check links'] });
    await call('get_task_status', { taskId: 'task-new' });
    await call('send_task_message', { taskId: 'task-new', instruction: 'Check footer too' });
    await call('resolve_decision', { taskId: 'task-new', requestId: 'decision-1', instruction: 'Keep layout' });
    await call('cancel_task', { taskId: 'task-new' });
    try { await call('read_memory', { path: '../outside.md' }); } catch { /* SDK surfaces tool exceptions to the model. */ }
  }));
  const host = { context: async () => ({ schemaVersion: 1, workspaces: [{ cwd: '/project' }] }), tasks: () => [],
    run: runtime.run.bind(runtime), execute: async (_id: string, call: any) => {
      const saved = JSON.parse(readFileSync(path, 'utf8')).conversations[0].toolCalls;
      expect(saved.at(-1).state).toBe('running'); expect(saved.at(-1).name).toBe(call.tool); observedBeforeEffect.push(call.tool);
      if (call.tool === 'cancel_task') throw Error('Injected tool failure');
      return { taskId: 'task-new', text: `RAW_RESULT_${call.tool}` };
    } };
  try {
    supervisor = new Supervisor(path, host); const { id } = supervisor.create();
    const raw = '  用户原话\n保留空白和换行。  ', sourceMessageId = supervisor.send(id, raw, 'claude', false);
    await settled(supervisor, id);
    expect(supervisor.snapshot(id).messages[0]?.text).toBe(raw);
    expect(supervisor.snapshot(id).messages.at(-1)?.text).toBe('Concise final answer.');
    const calls = supervisor.toolCalls(id);
    expect(calls).toHaveLength(9); expect(new Set(calls.map(call => call.id)).size).toBe(9);
    expect(calls.every(call => call.conversationId === id && call.sourceMessageId === sourceMessageId && call.startedAt && call.endedAt)).toBe(true);
    expect(observedBeforeEffect).toEqual(['create_task', 'get_task_status', 'send_task_message', 'resolve_decision', 'cancel_task']);
    expect(calls.find(call => call.name === 'create_task')?.input).toMatchObject({ scope: ['No writes'], expectedArtifacts: ['Summary'], acceptance: ['Check links'] });
    expect(JSON.stringify(calls.find(call => call.name === 'create_task')?.result)).toContain('RAW_RESULT_create_task');
    expect(JSON.stringify(calls.find(call => call.name === 'get_context')?.result)).toContain('schemaVersion');
    expect(calls.find(call => call.name === 'update_memory')?.state).toBe('done');
    expect(calls.find(call => call.name === 'cancel_task')?.error).toContain('Injected tool failure');
    expect(calls.at(-1)?.error).toContain('记忆路径'); expect(calls.at(-1)?.state).toBe('failed');
    expect(runtime.home.read()).toContain('User-confirmed durable preference.');
    expect(supervisor.list()[0]).not.toHaveProperty('toolCalls');
    supervisor.close(); const restored = new Supervisor(path, host);
    expect(restored.toolCalls(id)).toEqual(calls); restored.close();
  } finally { supervisor?.close(); runtime.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('model failure and interrupted restart retain raw messages and completed tool evidence without replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-tool-fault-')), path = join(dir, 'conversations.json');
  const runtime = new SupervisorRuntime(join(dir, 'home'), fakeSdk(async call => { await call('get_context', {}); throw Error('Injected model failure'); }));
  let executions = 0;
  const host = { context: async () => ({ token: 'ORIGINAL_TOOL_RESULT' }), tasks: () => [], run: runtime.run.bind(runtime), execute: async () => { executions++; return { text: 'Unexpected' }; } };
  const supervisor = new Supervisor(path, host);
  try {
    const { id } = supervisor.create(); supervisor.send(id, 'Keep original message', 'claude', false); await settled(supervisor, id);
    expect(supervisor.snapshot(id).messages[0]?.text).toBe('Keep original message');
    expect(supervisor.snapshot(id).messages.at(-1)?.failureDetail).toBe('Injected model failure');
    expect(JSON.stringify(supervisor.toolCalls(id)[0]?.result)).toContain('ORIGINAL_TOOL_RESULT');
    supervisor.close();
    const data = JSON.parse(readFileSync(path, 'utf8')), conversation = data.conversations[0];
    conversation.messages[0].state = 'pending'; delete conversation.messages[0].failureDetail;
    conversation.toolCalls.push({ ...conversation.toolCalls[0], id: 'interrupted-tool', state: 'running', result: undefined, endedAt: undefined });
    writeFileSync(path, JSON.stringify(data));
    const restored = new Supervisor(path, host);
    expect(restored.snapshot(id).messages[0]?.text).toBe('Keep original message');
    expect(restored.snapshot(id).messages[0]?.failureDetail).toContain('未自动重放');
    expect(restored.toolCalls(id).at(-1)?.state).toBe('interrupted');
    expect(restored.toolCalls(id)[0]?.state).toBe('done'); expect(executions).toBe(0);
    restored.close();
  } finally { supervisor.close(); runtime.close(); rmSync(dir, { recursive: true, force: true }); }
});
