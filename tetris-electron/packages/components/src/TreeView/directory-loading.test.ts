import { expect, test } from "bun:test";
import { visibleDirectoryPaths, queueDirectoryRead } from "./directory-loading";
import type { TreeNode } from "@tetris/shared/types";
test("restores only directories with visible expanded ancestors", () => {
  const contents = new Map<string, TreeNode[]>([
    ["/ws", [{ path: "/ws/open", name: "open", kind: "folder" }, { path: "/ws/closed", name: "closed", kind: "folder" }]],
    ["/ws/open", [{ path: "/ws/open/deep", name: "deep", kind: "folder" }]],
    ["/ws/closed", [{ path: "/ws/closed/deep", name: "deep", kind: "folder" }]],
  ]);
  expect(visibleDirectoryPaths("/ws", new Set(["/ws/open", "/ws/open/deep", "/ws/closed/deep", "/other"]), contents)).toEqual(["/ws", "/ws/open", "/ws/open/deep"]);
});
test("many workspace loads share a four-request budget and release failed slots", async () => {
  let active = 0, peak = 0;
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => queueDirectoryRead(async () => {
    peak = Math.max(peak, ++active);
    try { await Bun.sleep(5); if (i === 3) throw new Error("read failed"); return i; }
    finally { active--; }
  })));
  expect(peak).toBe(4);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(19);
  expect(await queueDirectoryRead(async () => "next")).toBe("next");
});
