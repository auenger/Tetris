import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);

export async function createTaskWorktree(cwd: string, storage: string) {
  cwd = await realpath(cwd);
  const { stdout } = await exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  const root = stdout.trim();
  const { stdout: dirty } = await exec('git', ['-C', root, 'status', '--porcelain']);
  if (dirty.trim()) throw new Error('独立工作目录从已提交版本创建，请先提交或暂存到 stash 当前改动。');
  const id = randomUUID();
  const path = join(storage, id);
  const branch = `tetris/task-${id}`;
  await mkdir(storage, { recursive: true });
  await exec('git', ['-C', root, 'worktree', 'add', '-b', branch, path, 'HEAD']);
  return { cwd: join(path, relative(root, cwd)), root: path, branch, sourceCwd: cwd };
}

export async function inspectTaskWorktree(cwd: string, sourceCwd: string) {
  const { stdout: base } = await exec('git', ['-C', cwd, 'merge-base', 'HEAD', await head(sourceCwd)]);
  const [{ stdout: diff }, { stdout: status }] = await Promise.all([
    exec('git', ['-C', cwd, 'diff', '--no-ext-diff', base.trim(), '--'], { maxBuffer: 4 * 1024 * 1024 }),
    exec('git', ['-C', cwd, 'status', '--short']),
  ]);
  return { diff, status };
}
async function head(cwd: string): Promise<string> {
  return (await exec('git', ['-C', cwd, 'rev-parse', 'HEAD'])).stdout.trim();
}
async function requireClean(cwd: string) {
  if ((await exec('git', ['-C', cwd, 'status', '--porcelain'])).stdout.trim()) throw new Error('请先提交当前改动，集成或清理仅适用于干净的工作目录。');
}
export async function integrateTaskWorktree(cwd: string, sourceCwd: string) {
  await requireClean(cwd); await requireClean(sourceCwd);
  const commit = await head(cwd);
  // Fast-forward only: never creates conflicts or merges unrelated source changes.
  await exec('git', ['-C', sourceCwd, 'merge', '--ff-only', commit]);
  return commit;
}
export async function removeIntegratedWorktree(cwd: string, sourceCwd: string, storage: string) {
  await requireClean(cwd);
  const taskHead = await head(cwd);
  await exec('git', ['-C', sourceCwd, 'merge-base', '--is-ancestor', taskHead, await head(sourceCwd)]);
  const root = (await exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])).stdout.trim();
  const storageRoot = await realpath(storage);
  const path = relative(storageRoot, await realpath(root));
  if (!path || path.startsWith('..') || path.includes('/') || path.includes('\\')) throw new Error('只能清理由 Tetris 管理的独立工作目录');
  await exec('git', ['-C', sourceCwd, 'worktree', 'remove', root]);
}
