import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rename, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as index from "./wikilink-index";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { index.forgetWorkspace(root); await rm(root, { recursive: true, force: true }); } });
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "collab-wiki-")); roots.push(root);
  await writeFile(join(root, "Target.md"), "target");
  await writeFile(join(root, "Source.md"), "[[Target]]");
  return root;
}
test("filename discovery is lazy about content and concurrent workspaces stay isolated", async () => {
  const a = await workspace(), b = await workspace();
  await mkdir(join(a, ".venv")); await writeFile(join(a, ".venv", "Ignored.md"), "");
  await Promise.all([index.buildIndex(a), index.buildIndex(b)]);
  expect(index.resolve("Target", a)).toBe(join(a, "Target.md"));
  expect(index.resolve("Target", b)).toBe(join(b, "Target.md"));
  expect(index.suggest("Ignored", a)).toEqual([]);
  expect(await index.backlinksWithContext(join(a, "Target.md"))).toEqual([]);
  await Promise.all([index.buildLinkIndex(a), index.buildLinkIndex(b)]);
  expect((await index.backlinksWithContext(join(a, "Target.md"))).map((f) => f.path)).toEqual([join(a, "Source.md")]);
  await rename(join(a, "Target.md"), join(a, "Renamed.md"));
  await index.handleRename(join(a, "Target.md"), join(a, "Renamed.md"));
  expect(await readFile(join(a, "Source.md"), "utf8")).toBe("[[Renamed]]");
  expect(await readFile(join(b, "Source.md"), "utf8")).toBe("[[Target]]");
  expect((await index.backlinksWithContext(join(b, "Target.md"))).map((f) => f.path)).toEqual([join(b, "Source.md")]);
});
test("forgetting a workspace cancels an in-flight build and refresh rebuilds it", async () => {
  const root = await workspace();
  const pending = index.buildIndex(root); index.forgetWorkspace(root); await pending;
  expect(index.resolve("Target", root)).toBeNull();
  await index.buildIndex(root);
  expect(index.resolve("Target", root)).toBe(join(root, "Target.md"));
});
