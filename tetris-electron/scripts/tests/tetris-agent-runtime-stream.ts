/** Opt-in real Claude SDK stream smoke. Uses an isolated Agent Home and never starts workers. */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../../src/main/supervisor';
import { SupervisorRuntime } from '../../src/main/supervisor-runtime';
const root = mkdtempSync(join(tmpdir(), 'tetris-runtime-stream-'));
const path = join(root, 'conversations.json'), runtime = new SupervisorRuntime(join(root, 'agent-home'));
let partials = 0, firstPartialAt = 0;
const host = { context: async () => ({ schemaVersion: 1, workspaces: [] }), tasks: () => [],
  execute: async () => { throw Error('Task operations are not authorized by this smoke'); }, run: runtime.run.bind(runtime),
  changed: (snapshot: ReturnType<Supervisor['snapshot']>) => {
    const reply = snapshot.messages.at(-1);
    if (reply?.role === 'assistant' && reply.state === 'pending' && reply.text) {
      partials++; firstPartialAt ||= Date.now();
      const saved = JSON.parse(readFileSync(path, 'utf8')).conversations.find((c: { id: string }) => c.id === snapshot.conversationId);
      if (saved.messages.at(-1).text !== reply.text) throw Error('Stream update was published before persistence');
      log('partial', { length: reply.text.length, revision: snapshot.revision });
    }
  } };
const supervisor = new Supervisor(path, host), { id } = supervisor.create();
const log = (stage: string, details: object = {}) => console.log(JSON.stringify({ stage, at: new Date().toISOString(), root, ...details }));
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
try {
  supervisor.send(id, '这是对话流式传输测试，请不要调用任何工具或派发任务。请用中文写八句话，解释如何把一个模糊需求逐步整理成明确任务，每句约三十字。最后单独写 STREAM_RUNTIME_OK。', 'claude', false);
  log('started', { conversationId: id });
  const started = Date.now(); let lastLog = 0;
  while (supervisor.snapshot(id).busy && Date.now() - started < 150000) {
    if (Date.now() - lastLog > 10000) { log('waiting', { elapsedMs: Date.now() - started }); lastLog = Date.now(); }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const snapshot = supervisor.snapshot(id), final = snapshot.messages.at(-1)!, session = supervisor.list()[0]?.runtimeSessionId;
  assert(!snapshot.busy, 'SDK stream deadline exceeded');
  assert(final.state === 'done', final.failureDetail || 'Turn failed');
  assert(final.text.includes('STREAM_RUNTIME_OK'), 'Final text missing');
  assert(partials > 1 && firstPartialAt < Date.now(), 'No incremental native text updates observed');
  assert(session, 'Native session mapping was not saved');
  supervisor.archive(id); supervisor.restore(id); supervisor.close();
  const restored = new Supervisor(path, host);
  assert(restored.list()[0]?.runtimeSessionId === session, 'Restored conversation lost native session');
  assert(JSON.stringify(restored.snapshot(id).messages) === JSON.stringify(snapshot.messages), 'Restored conversation changed messages');
  assert(supervisor.toolCalls(id).length === 0, 'Unexpected tool invocation');
  restored.close(); log('passed', { nativeSession: session, partials, firstPartialMs: firstPartialAt - started, finalLength: final.text.length, restoredId: id });
} catch (error) { log('failed', { error: String(error) }); process.exitCode = 1; }
finally { supervisor.close(); runtime.close(); }
