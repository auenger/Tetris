import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexExecutor } from './codex-executor';

test('streams events, resumes the exact thread and rejects incomplete exits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-codex-'));
  try {
    const executable = join(dir, 'codex');
    writeFileSync(executable, `#!/usr/bin/env node
let text = ''; process.stdin.on('data', d => text += d);
process.stdin.on('end', () => {
 if (text === 'fail') { process.stderr.write('fixture failure'); process.exit(1); }
 if (text === 'resume' && !process.argv.includes('thread-1')) process.exit(2);
 console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'done'}}));
 console.log(JSON.stringify({type:'turn.completed'}));
 if (text === 'linger') setInterval(() => {}, 1000);
});
`, { mode: 0o700 });
    const events: string[] = [];
    const executor = new CodexExecutor(dir, undefined, event => events.push(event.type), executable);
    expect(await executor.prompt('first')).toEqual({ stopReason: 'end_turn' });
    expect(executor.threadId).toBe('thread-1');
    expect(events).toContain('item.completed');
    expect(await executor.prompt('resume')).toEqual({ stopReason: 'end_turn' });
    await expect(executor.prompt('fail')).rejects.toThrow('fixture failure');
    const lingering = new CodexExecutor(dir, undefined, event => {
      if (event.type === 'turn.completed') lingering.cancel();
    }, executable);
    expect(await lingering.prompt('linger')).toEqual({ stopReason: 'end_turn' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
