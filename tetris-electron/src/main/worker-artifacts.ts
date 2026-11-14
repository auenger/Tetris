import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { SuperAgentTasks } from './super-agent-tasks';

/** Declared deliverables are file references within this run's actual execution root. */
export async function snapshotWorkerArtifacts(store: SuperAgentTasks, taskId: string, runId: string, cwd: string, paths: string[]) {
  const issues: string[] = [];
  for (const declaredPath of [...new Set(paths)]) {
    try {
      const root = await realpath(cwd), path = await realpath(resolve(root, declaredPath)), fromRoot = relative(root, path);
      if (fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot)) throw new Error('产物不在 Task 执行目录内');
      const info = await stat(path);
      if (!info.isFile()) throw new Error('产物不是普通文件');
      if (info.size > 64 * 1024 * 1024) throw new Error('产物超过 64 MiB，未自动归档');
      store.attachArtifact(runId, path, 'deliverable');
    } catch (error) {
      issues.push(`${declaredPath}：${String(error)}`);
      store.recordEvent(taskId, 'artifact.unavailable', { declaredPath, reason: String(error) }, { runId, actor: 'app', operationId: `artifact-unavailable:${runId}:${declaredPath}` });
    }
  }
  return issues;
}
export function artifactIsText(path: string, bytes: Uint8Array): boolean {
  if (/\.(?:pdf|png|jpe?g|gif|webp|avif|ico|zip|gz|tgz|woff2?|ttf|mp[34]|mov|wav|xlsx?|docx?|pptx?|bin)$/i.test(extname(path))) return false;
  if (bytes.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
}
