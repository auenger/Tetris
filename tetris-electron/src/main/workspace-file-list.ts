import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createTaskQueue } from "@tetris/shared/task-queue";
import type { TreeNode } from "@tetris/shared/types";
import { createFileFilter } from "./file-filter";

const scanQueue = createTaskQueue(2);
const PAGE_SIZE = 200;

interface Session {
  root: string;
  query: string;
  abort: AbortController;
  iterator: AsyncGenerator<TreeNode>;
  timer?: ReturnType<typeof setTimeout>;
  pending?: Promise<{ files: TreeNode[]; cursor: string | null }>;
}

async function* walk(root: string, query: string, signal: AbortSignal): AsyncGenerator<TreeNode> {
  const filter = createFileFilter();
  const directories = [root];
  for (let i = 0; i < directories.length; i++) {
    signal.throwIfAborted();
    const directory = directories[i]!;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (directory === root) throw error; else continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      signal.throwIfAborted();
      const path = join(directory, entry.name);
      if (filter.isIgnored(relative(root, path).replace(/\\/g, "/") + (entry.isDirectory() ? "/" : ""))) continue;
      if (entry.isDirectory()) { directories.push(path); continue; }
      if (!entry.isFile() || !entry.name.toLowerCase().includes(query)) continue;
      try {
        const stats = await stat(path);
        signal.throwIfAborted();
        yield { name: entry.name, path, kind: "file", ctime: stats.birthtime.toISOString(), mtime: stats.mtime.toISOString() };
      } catch (error) { if (signal.aborted) throw error; }
    }
  }
}

/** Each renderer owns its cursors; only requested pages are visited and returned. */
export class WorkspaceFileLists {
  private sessions = new Map<string, Session>();

  cancel(root?: string): void {
    for (const [cursor, session] of this.sessions) {
      if (root !== undefined && session.root !== root) continue;
      session.abort.abort();
      clearTimeout(session.timer);
      this.sessions.delete(cursor);
      // Release any directory entries retained by a suspended generator.
      void session.iterator.return(undefined).catch(() => {});
    }
  }

  read(root: string, query = "", cursor?: string): Promise<{ files: TreeNode[]; cursor: string | null }> {
    let session: Session;
    const normalizedQuery = query.trim().toLowerCase();
    if (cursor) {
      const existing = this.sessions.get(cursor);
      if (!existing || existing.root !== root || existing.query !== normalizedQuery) throw new Error("File list expired; refresh to reload");
      session = existing;
      if (session.pending) return session.pending;
      clearTimeout(session.timer);
    } else {
      this.cancel(root);
      cursor = randomUUID();
      const abort = new AbortController();
      session = { root, query: normalizedQuery, abort, iterator: walk(root, normalizedQuery, abort.signal) };
      this.sessions.set(cursor, session);
    }
    const token = cursor;
    session.timer = setTimeout(() => {
      if (this.sessions.get(token) === session) this.cancel(root);
    }, 300_000);
    session.timer.unref();
    const request = scanQueue(async () => {
      const files: TreeNode[] = [];
      try {
        for (let i = 0; i < PAGE_SIZE; i++) {
          session.abort.signal.throwIfAborted();
          const next = await session.iterator.next();
          if (next.done) {
            clearTimeout(session.timer);
            this.sessions.delete(token);
            return { files, cursor: null };
          }
          files.push(next.value);
        }
        return { files, cursor: token };
      } catch (error) {
        if (this.sessions.get(token) === session) this.cancel(root);
        throw error;
      } finally { delete session.pending; }
    });
    session.pending = request;
    return request;
  }
}
