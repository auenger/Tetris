import { beforeEach, afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceFileLists } from "./workspace-file-list";
let root: string;
let lists: WorkspaceFileLists;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "collab-pages-")); lists = new WorkspaceFileLists(); });
afterEach(async () => { lists.cancel(); await rm(root, { recursive: true, force: true }); });
test("returns 200 metadata rows and resumes without duplicates", async () => {
  await Promise.all(Array.from({ length: 205 }, (_, i) => writeFile(join(root, `${String(i).padStart(3, "0")}.md`), "---\nsecret: value\n---\nbody")));
  const first = await lists.read(root);
  expect(first.files).toHaveLength(200);
  expect(first.cursor).toBeTruthy();
  expect(first.files[0]!.frontmatter).toBeUndefined();
  expect(first.files[0]!.preview).toBeUndefined();
  const second = await lists.read(root, "", first.cursor!);
  expect(second.files).toHaveLength(5);
  expect(second.cursor).toBeNull();
  expect(new Set([...first.files, ...second.files].map((f) => f.path)).size).toBe(205);
});
test("search ignores environment, build and app metadata directories", async () => {
  for (const dir of [".venv", "node_modules", "dist", ".collaborator", "src"]) {
    await mkdir(join(root, dir)); await writeFile(join(root, dir, "MATCH.md"), "body");
  }
  const page = await lists.read(root, "match");
  expect(page.files.map((f) => f.path)).toEqual([join(root, "src", "MATCH.md")]);
});
test("cancelled reads reject and a fresh refresh sees new files", async () => {
  await writeFile(join(root, "old.md"), "old");
  const pending = lists.read(root);
  lists.cancel(root);
  await expect(pending).rejects.toThrow();
  await writeFile(join(root, "new.md"), "new");
  const page = await lists.read(root);
  expect(page.files.map((f) => f.name).sort()).toEqual(["new.md", "old.md"]);
});
test("a cursor cannot be reused for another root or query", async () => {
  await Promise.all(Array.from({ length: 201 }, (_, i) => writeFile(join(root, `${i}.md`), "")));
  const page = await lists.read(root);
  expect(() => lists.read(root, "different", page.cursor!)).toThrow();
  expect(() => lists.read(root + "-other", "", page.cursor!)).toThrow();
});
