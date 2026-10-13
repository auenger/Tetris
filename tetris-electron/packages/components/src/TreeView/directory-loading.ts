import type { TreeNode } from '@tetris/shared/types';
import { createTaskQueue } from '@tetris/shared/task-queue';

// Shared by all workspace trees so restoring many branches cannot flood IPC.
export const queueDirectoryRead = createTaskQueue(4);

export function visibleDirectoryPaths(
  root: string,
  expanded: Set<string>,
  contents: Map<string, TreeNode[]>,
): string[] {
  const paths = [root];
  for (let i = 0; i < paths.length; i++) {
    for (const child of contents.get(paths[i]!) ?? []) {
      if (child.kind === 'folder' && expanded.has(child.path)) paths.push(child.path);
    }
  }
  return paths;
}
