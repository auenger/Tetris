import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentHome } from './agent-home';

test('memory initialization preserves user content; stale concurrent updates and escapes are rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-home-'));
  try {
    const home = new AgentHome(root), source = { conversationId: 'c', messageId: 'm' };
    const revision = home.revision();
    home.update('MEMORY.md', '用户偏好：中文', source, revision);
    expect(new AgentHome(root).read()).toContain('用户偏好：中文');
    expect(home.read()).toContain('conversation=c message=m');
    expect(() => home.update('MEMORY.md', 'stale', source, revision)).toThrow('重新读取');
    expect(() => home.read('../secret')).toThrow();
    symlinkSync('/etc/passwd', join(root, 'memory/workspaces/link.md'));
    expect(() => home.read('memory/workspaces/link.md')).toThrow('符号链接');
    expect(home.workspaceMemoryPath('/project')).toBe(home.workspaceMemoryPath('/project'));
    expect(home.workspaceMemoryPath('/project')).not.toBe(home.workspaceMemoryPath('/other'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
