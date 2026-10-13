import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

mock.module("@tetris/shared/image", () => ({
  IMAGE_EXTENSIONS: new Set([".png", ".jpg"]),
  isImageFile: (p: string) => /\.(png|jpg)$/i.test(p),
}));

const { fsWriteFile, atomicWriteFileSync, fsReadDir } = await import("./files");
const { createFileFilter } = await import("./file-filter");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "files-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("fsWriteFile", () => {
  test("writes file and returns ok with mtime", async () => {
    const p = join(tmp, "a.txt");
    const result = await fsWriteFile(p, "hello");

    expect(result.ok).toBe(true);
    expect(result.mtime).toBeTruthy();
    expect(result.conflict).toBeUndefined();
    expect(readFileSync(p, "utf-8")).toBe("hello");
  });

  test("writes without guard when expectedMtime is omitted", async () => {
    const p = join(tmp, "b.txt");
    await writeFile(p, "old", "utf-8");

    const result = await fsWriteFile(p, "new");

    expect(result.ok).toBe(true);
    expect(readFileSync(p, "utf-8")).toBe("new");
  });

  test("succeeds when expectedMtime matches", async () => {
    const p = join(tmp, "c.txt");
    await writeFile(p, "v1", "utf-8");
    const mtime = (await stat(p)).mtime.toISOString();

    // Wait so the new write gets a distinct mtime
    await Bun.sleep(10);
    const result = await fsWriteFile(p, "v2", mtime);

    expect(result.ok).toBe(true);
    expect(readFileSync(p, "utf-8")).toBe("v2");
  });

  test("returns conflict when expectedMtime is stale", async () => {
    const p = join(tmp, "d.txt");
    await writeFile(p, "v1", "utf-8");
    const staleMtime = (await stat(p)).mtime.toISOString();

    // External write changes the mtime — sleep to ensure distinct mtime
    await Bun.sleep(10);
    await writeFile(p, "v2-external", "utf-8");

    const result = await fsWriteFile(p, "v2-mine", staleMtime);

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    // File should NOT be overwritten
    expect(readFileSync(p, "utf-8")).toBe("v2-external");
    // Returned mtime should be the current (external) mtime
    const currentMtime = (await stat(p)).mtime.toISOString();
    expect(result.mtime).toBe(currentMtime);
  });

  test("skips guard for new file even with expectedMtime", async () => {
    const p = join(tmp, "new.txt");

    const result = await fsWriteFile(p, "content", "2020-01-01T00:00:00.000Z");

    expect(result.ok).toBe(true);
    expect(readFileSync(p, "utf-8")).toBe("content");
  });

  test("returns updated mtime after successful guarded write", async () => {
    const p = join(tmp, "e.txt");
    const r1 = await fsWriteFile(p, "v1");

    await Bun.sleep(10);
    const r2 = await fsWriteFile(p, "v2", r1.mtime);
    expect(r2.ok).toBe(true);

    // Chain: use r2.mtime for next write
    await Bun.sleep(10);
    const r3 = await fsWriteFile(p, "v3", r2.mtime);
    expect(r3.ok).toBe(true);
    expect(readFileSync(p, "utf-8")).toBe("v3");
  });

  test("conflict breaks the mtime chain", async () => {
    const p = join(tmp, "f.txt");
    const r1 = await fsWriteFile(p, "v1");

    // External edit breaks the chain — sleep for distinct mtime
    await Bun.sleep(10);
    await writeFile(p, "external", "utf-8");

    const r2 = await fsWriteFile(p, "stale", r1.mtime);
    expect(r2.ok).toBe(false);
    expect(r2.conflict).toBe(true);

    // Using the conflict's mtime allows the next write to succeed
    await Bun.sleep(10);
    const r3 = await fsWriteFile(p, "resolved", r2.mtime);
    expect(r3.ok).toBe(true);
    expect(readFileSync(p, "utf-8")).toBe("resolved");
  });
});

describe("atomicWriteFileSync", () => {
  test("writes file content", () => {
    const p = join(tmp, "config.json");
    atomicWriteFileSync(p, '{"key": "value"}');

    expect(readFileSync(p, "utf-8")).toBe('{"key": "value"}');
  });

  test("overwrites existing file atomically", () => {
    const p = join(tmp, "config.json");
    atomicWriteFileSync(p, "v1");
    atomicWriteFileSync(p, "v2");

    expect(readFileSync(p, "utf-8")).toBe("v2");
  });

  test("leaves no temp files behind", () => {
    const p = join(tmp, "clean.json");
    atomicWriteFileSync(p, "data");

    const files = Bun.spawnSync(["ls", tmp]).stdout.toString().trim().split("\n");
    expect(files).toEqual(["clean.json"]);
  });

  test("preserves content through multiple writes", () => {
    const p = join(tmp, "multi.json");
    for (let i = 0; i < 10; i++) {
      atomicWriteFileSync(p, `iteration-${i}`);
    }
    expect(readFileSync(p, "utf-8")).toBe("iteration-9");
  });
});

describe("lazy directory reads", () => {
  test("does not visit or sniff descendants to count folder files", async () => {
    await mkdir(join(tmp, "child", "deep"), { recursive: true });
    await writeFile(join(tmp, "child", "deep", "hidden.md"), "descendant");
    await writeFile(join(tmp, "visible.md"), "visible");
    const base = createFileFilter();
    const sniffed: string[] = [];
    const entries = await fsReadDir(tmp, { ...base, isBinaryFile: async (path) => {
      sniffed.push(path); return base.isBinaryFile(path);
    } }, tmp);
    expect(entries.map((e) => e.name).sort()).toEqual(["child", "visible.md"]);
    expect(sniffed).toEqual([join(tmp, "visible.md")]);
    expect(entries.find((e) => e.name === "child")!.fileCount).toBeUndefined();
    expect(entries.find((e) => e.name === "visible.md")!.modifiedAt).toBeTruthy();
  });

  test("manual invalidation rechecks binary content only inside its directory", async () => {
    await mkdir(join(tmp, "active"));
    const path = join(tmp, "active", "file.data");
    const other = join(tmp, "other.data");
    const filter = createFileFilter();
    await writeFile(path, "text"); await writeFile(other, "text");
    expect(await filter.isBinaryFile(path)).toBe(false);
    expect(await filter.isBinaryFile(other)).toBe(false);
    await writeFile(path, Buffer.from([0, 1, 2]));
    await writeFile(other, Buffer.from([0, 1, 2]));
    filter.invalidateBinaryCacheUnder(join(tmp, "active"));
    expect(await filter.isBinaryFile(path)).toBe(true);
    expect(await filter.isBinaryFile(other)).toBe(false);
  });
});
