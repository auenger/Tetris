/** Opt-in one-turn real Claude SDK observer smoke; no workers, temporary Agent Home. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../../src/main/supervisor';
import { SupervisorRuntime } from '../../src/main/supervisor-runtime';
const root = mkdtempSync(join(tmpdir(), 'tetris-runtime-ledger-'));
const path = join(root, 'conversations.json'), runtime = new SupervisorRuntime(join(root, 'agent-home'));
const host = { context: async () => ({ schemaVersion: 1, capturedAt: new Date().toISOString(), workspaces: [], marker: 'LEDGER_CONTEXT_4026' }), tasks: () => [],
  execute: async () => { throw Error('No task operations authorized in this smoke'); }, run: runtime.run.bind(runtime) };
const supervisor = new Supervisor(path, host), { id } = supervisor.create();
const original = '  请先调用 get_context 工具查看当前 App 上下文，再调用 read_memory 工具读取 MEMORY.md，然后仅回复 RUNTIME_LEDGER_OK。不要创建任何 Task。  ';
const log = (stage: string, details: object = {}) => console.log(JSON.stringify({ stage, at: new Date().toISOString(), root, ...details }));
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
try {
  supervisor.send(id, original, 'claude', false); log('started', { conversationId: id });
  const started = Date.now(); let logged = 0;
  while (supervisor.snapshot(id).busy && Date.now() - started < 150000) {
    if (Date.now() - logged > 10000) { log('waiting', { elapsedMs: Date.now() - started }); logged = Date.now(); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const snapshot = supervisor.snapshot(id), tools = supervisor.toolCalls(id), nativeSession = supervisor.list()[0]?.runtimeSessionId;
  assert(!snapshot.busy, 'SDK observation deadline exceeded');
  assert(snapshot.messages.at(-1)?.state === 'done', snapshot.messages.at(-1)?.failureDetail || 'Turn failed');
  assert(snapshot.messages[0]?.text === original, 'Original input was modified');
  assert(snapshot.messages.at(-1)?.text.includes('RUNTIME_LEDGER_OK'), 'Final model reply missing');
  assert(nativeSession, 'Native session not persisted');
  assert(tools.some(call => call.name === 'get_context' && call.state === 'done' && JSON.stringify(call.result).includes('LEDGER_CONTEXT_4026')), 'Raw context tool result not persisted');
  assert(tools.some(call => call.name === 'read_memory' && call.state === 'done' && JSON.stringify(call.result).includes('长期记忆')), 'Memory tool result not persisted');
  assert(tools.every(call => call.sourceMessageId === snapshot.messages[0]?.id && call.startedAt && call.endedAt), 'Tool source/timing missing');
  supervisor.close(); const restored = new Supervisor(path, host);
  assert(JSON.stringify(restored.toolCalls(id)) === JSON.stringify(tools), 'Tool ledger changed on reload');
  assert(restored.list()[0]?.runtimeSessionId === nativeSession, 'Native session mapping changed on reload');
  assert(restored.snapshot(id).messages[0]?.text === original, 'Original input changed on reload');
  restored.close(); log('passed', { nativeSession, toolNames: tools.map(call => call.name), durableRawResults: true, rawInputPreserved: true, finalReply: snapshot.messages.at(-1)?.text });
} catch(error) { log('failed', { error: String(error) }); process.exitCode = 1; }
finally { supervisor.close(); runtime.close(); }
