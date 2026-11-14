import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTaskWorktree, integrateTaskWorktree, removeIntegratedWorktree } from './task-worktree';
test('creates an isolated branch from committed state and rejects dirty sources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tetris-worktree-'));
  const repo = join(dir, 'repo');
  try {
    execFileSync('git', ['init', repo]);
    execFileSync('git', ['-C', repo, '-c', 'user.name=Tetris Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'initial']);
    const result = await createTaskWorktree(repo, join(dir, 'worktrees'));
    expect(execFileSync('git', ['-C', result.cwd, 'branch', '--show-current'], { encoding: 'utf8' }).trim()).toBe(result.branch);
    expect(result.sourceCwd).toBe(realpathSync(repo));
    writeFileSync(join(result.cwd, 'result.txt'), 'verified');
    execFileSync('git', ['-C', result.cwd, 'add', 'result.txt']);
    execFileSync('git', ['-C', result.cwd, '-c', 'user.name=Tetris Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'result']);
    await integrateTaskWorktree(result.cwd, repo);
    await removeIntegratedWorktree(result.cwd, repo, join(dir, 'worktrees'));
    writeFileSync(join(repo, 'uncommitted'), 'keep');
    await expect(createTaskWorktree(repo, join(dir, 'worktrees'))).rejects.toThrow('当前改动');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
