import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { FsChangeEvent } from "./watcher";

/** Watch only the directory that was loaded, never its descendants. */
export function subscribeDirectory(path: string, notify: (events: FsChangeEvent[]) => void): { close: () => void } {
  const changes = new Map<string, "rename" | "change">();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let unknownChange = false;
  const subscription = watch(path, { recursive: false }, (event, filename) => {
    if (filename) changes.set(join(path, filename.toString()), event);
    else unknownChange = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const batch = [...changes];
      const unknown = unknownChange;
      changes.clear();
      unknownChange = false;
      const events: FsChangeEvent["changes"] = [];
      // Limit filesystem concurrency during an event burst.
      for (const [filePath, kind] of batch) {
        let type: 1 | 2 | 3 = 2;
        if (kind === "rename") {
          try { await stat(filePath); type = 1; }
          catch { type = 3; }
        }
        events.push({ path: filePath, type });
      }
      if (!closed && (events.length || unknown)) notify([{ dirPath: path, changes: events }]);
    }, 150);
  });
  subscription.on("error", (error) => console.error(`[watcher] ${path}: ${error.message}`));
  return { close() {
    closed = true;
    if (timer) clearTimeout(timer);
    subscription.close();
  } };
}
