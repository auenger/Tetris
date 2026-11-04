import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from './supervisor';
import { validateDecision } from './supervisor-runtime';

test('supervisor can answer during worker execution and does not replay completed dispatch on reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-test-'));
  let calls = 0;
  const host = {
    context: async () => ({ tiles: [] }),
    tasks: () => calls ? [{ id: 'worker', status: 'running', provider: 'claude' }] : [],
    decide: async (input: any) => input.incoming.text === '检查首页'
      ? validateDecision({ reply: '安排检查', calls: [{ tool: 'create_task', title: '首页检查', instruction: '只检查，不修改', provider: 'claude' }] }, [])
      : validateDecision({ reply: 'Claude Code 正在检查首页。', calls: [] }, ['worker']),
    execute: async () => { calls++; return { taskId: 'worker', text: '已派发' }; },
  };
  try {
    const file = join(dir, 'state.json'); const manager = new Supervisor(file, host);
    manager.send('/workspace', '检查首页', 'claude', false);
    manager.send('/workspace', '谁在做？', 'claude', false);
    for (let n = 0; n < 50 && manager.snapshot('/workspace').busy; n++) await new Promise(r => setTimeout(r, 5));
    const state = manager.snapshot('/workspace');
    expect(calls).toBe(1);
    expect(state.messages.at(-1)?.text).toBe('Claude Code 正在检查首页。');
    expect(host.tasks()[0]?.status).toBe('running');
    manager.close();
    const restored = new Supervisor(file, host);
    expect(restored.snapshot('/workspace').messages).toEqual(state.messages);
    expect(calls).toBe(1); restored.close();
    expect(() => validateDecision({ reply: '停止', calls: [{ tool: 'cancel_task', taskId: 'other-workspace' }] }, ['worker'])).toThrow();
    expect(() => validateDecision({ reply: '下一步', calls: [{ tool: 'create_task', title: '新任务', instruction: '修改', provider: 'claude' }] }, [], true)).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
