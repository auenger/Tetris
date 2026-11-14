import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupervisorSnapshot } from '../../packages/shared/src/supervisor-types';
import { Supervisor } from './supervisor';
import { SupervisorRuntime } from './supervisor-runtime';
import { SupervisorTextStream } from './supervisor-stream';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const partial = (uuid: string, event: unknown) => ({ type: 'stream_event', uuid, parent_tool_use_id: null, event });
const start = (id: string) => partial(`${id}:start`, { type: 'message_start', message: { id } });
const delta = (uuid: string, text: string) => partial(uuid, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
const full = (id: string, text: string) => ({ type: 'assistant', uuid: `${id}:full`, parent_tool_use_id: null, message: { id, content: [{ type: 'text', text }] } });
async function idle(manager: Supervisor, id: string) {
  for (let i = 0; i < 100 && manager.snapshot(id).busy; i++) await sleep(5);
  expect(manager.snapshot(id).busy).toBe(false);
}

test('Claude partial text reconciles complete messages without duplicating text or exposing tool/reasoning output', () => {
  const stream = new SupervisorTextStream();
  expect(stream.accept(start('one'))).toBeUndefined();
  expect(stream.accept(delta('d1', '正在'))).toBe('正在');
  expect(stream.accept(delta('d1', '正在'))).toBeUndefined();
  expect(stream.accept(partial('thinking', { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'private' } }))).toBeUndefined();
  expect(stream.accept(partial('tool', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: 'private' } }))).toBeUndefined();
  expect(stream.accept({ ...delta('child', 'child output'), parent_tool_use_id: 'worker' })).toBeUndefined();
  expect(stream.accept(delta('d2', '检查。'))).toBe('正在检查。');
  expect(stream.accept(full('one', '正在检查。'))).toBeUndefined();
  expect(stream.accept(full('one', '正在检查。'))).toBeUndefined();
  stream.accept(start('two'));
  expect(stream.accept(delta('d3', '检查完成。'))).toBe('正在检查。\n\n检查完成。');
  expect(stream.accept(full('two', '检查完成。'))).toBeUndefined();
  expect(stream.accept({ ...full('error', 'Rate limit protocol message'), error: 'rate_limit' })).toBeUndefined();
  expect(stream.finish('检查完成。')).toBe('检查完成。');
});

test('native stream updates are durable before completion, throttled, isolated, and do not block queued human messages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-stream-')), file = join(dir, 'conversations.json');
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve), order: string[] = [];
  const schema: any = { optional: () => schema };
  const sdk = {
    tool: (name: string) => ({ name }), createSdkMcpServer: (options: unknown) => options,
    query: ({ prompt, options }: any) => ({ close() {}, async *[Symbol.asyncIterator]() {
      expect(options.includePartialMessages).toBe(true);
      const input = JSON.parse(prompt), text = input.incoming.text, session = options.sessionId || options.resume;
      order.push(text);
      yield { type: 'system', subtype: 'init', session_id: session };
      yield start(input.incoming.id);
      if (text === 'first') {
        yield delta('chunk1', '实时'); yield delta('chunk2', '输出'); yield delta('chunk3', '已到达');
        await gate;
        yield full(input.incoming.id, '实时输出已到达');
      } else if (text === 'second') {
        yield delta('second-chunk', '这是失败前收到的文本');
        yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Injected stream failure'], session_id: session };
        return;
      } else yield delta(`chunk-${text}`, text);
      yield { type: 'result', subtype: 'success', is_error: false, result: `final:${text}`, session_id: session };
    } }),
  };
  const runtime = new SupervisorRuntime(join(dir, 'home'), async () => ({ sdk, z: { string: () => schema, array: () => schema, enum: () => schema } }));
  const snapshots: SupervisorSnapshot[] = [];
  const manager = new Supervisor(file, { context: async () => ({}), tasks: () => [], execute: async () => { throw Error('Unexpected dispatch'); },
    run: runtime.run.bind(runtime), changed: snapshot => snapshots.push(snapshot) });
  try {
    const a = manager.create(), b = manager.create();
    const first = manager.send(a.id, 'first', 'claude', false);
    await sleep(100);
    const streaming = manager.snapshot(a.id), partialReply = streaming.messages.at(-1)!;
    expect(streaming.busy).toBe(true); expect(partialReply).toMatchObject({ text: '实时输出已到达', state: 'pending', sourceMessageId: first });
    expect(JSON.parse(readFileSync(file, 'utf8')).conversations.find((c: any) => c.id === a.id).messages.at(-1).text).toBe(partialReply.text);
    expect(snapshots.filter(s => s.conversationId === a.id && s.messages.at(-1)?.text === partialReply.text)).toHaveLength(1);
    const event = manager.completed(a.id, 'task-a', 'worker report', 'report-1');
    const second = manager.send(a.id, 'second', 'claude', false);
    manager.send(b.id, 'other conversation', 'claude', false);
    await idle(manager, b.id);
    expect(manager.snapshot(a.id).busy).toBe(true);
    expect(manager.snapshot(b.id).messages.at(-1)?.text).toBe('final:other conversation');
    release(); await idle(manager, a.id);
    expect(order.filter(text => text !== 'other conversation')).toEqual(['first', 'second', 'worker report']);
    const replies = manager.snapshot(a.id).messages.filter(message => message.role === 'assistant');
    expect(replies).toHaveLength(3);
    expect(replies[0]).toMatchObject({ id: partialReply.id, text: 'final:first', state: 'done', sourceMessageId: first });
    expect(replies[1]).toMatchObject({ text: '这是失败前收到的文本', state: 'failed', failureDetail: 'Injected stream failure', sourceMessageId: second });
    expect(replies[2]).toMatchObject({ text: 'final:worker report', state: 'done', sourceMessageId: event, taskIds: ['task-a'] });
    const revisions = snapshots.filter(s => s.conversationId === a.id).map(s => s.revision!);
    expect(revisions.every((revision, i) => i === 0 || revision > revisions[i - 1]!)).toBe(true);
    expect(snapshots.filter(s => s.conversationId === a.id).at(-1)?.busy).toBe(false);
    manager.close(); const restored = new Supervisor(file, { context: async () => ({}), tasks: () => [], execute: async () => ({ text: '' }) });
    expect(restored.snapshot(a.id).messages).toEqual(manager.snapshot(a.id).messages); restored.close();
  } finally { release(); manager.close(); runtime.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('late text callbacks cannot change a finalized answer or spill into the next turn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-late-stream-'));
  const callbacks: Array<(text: string) => void> = [];
  const manager = new Supervisor(join(dir, 'conversations.json'), { context: async () => ({}), tasks: () => [], execute: async () => ({ text: '' }),
    run: async (input, _execute, _session, _tool, onText) => { callbacks.push(onText); onText('partial'); return { reply: input.incoming.text, sessionId: 'native' }; } });
  try {
    const { id } = manager.create(); manager.send(id, 'first answer', 'claude', false); await idle(manager, id);
    manager.send(id, 'second answer', 'claude', false); await idle(manager, id);
    const before = manager.snapshot(id); callbacks[0]!('stale first text'); callbacks[1]!('stale second text'); await sleep(90);
    expect(manager.snapshot(id)).toEqual(before);
    expect(before.messages.filter(m => m.role === 'assistant').map(m => m.text)).toEqual(['first answer', 'second answer']);
  } finally { manager.close(); rmSync(dir, { recursive: true, force: true }); }
});
