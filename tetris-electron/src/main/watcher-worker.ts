import { subscribeDirectory } from "./directory-watcher";

interface WatchAddCommand {
  cmd: "watch-add" | "watch";
  path: string;
}

interface WatchRemoveCommand {
  cmd: "watch-remove";
  path: string;
}

interface CloseCommand {
  cmd: "close";
}

type WorkerCommand = WatchAddCommand | WatchRemoveCommand | CloseCommand;

const subscriptions = new Map<string, { close: () => void }>();

async function watchAdd(folderPath: string): Promise<void> {
  if (subscriptions.has(folderPath)) return;

  try {
    const sub = subscribeDirectory(folderPath, (events) => process.parentPort.postMessage(events));
    subscriptions.set(folderPath, sub);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(
      `[watcher-worker] Failed to watch ${folderPath}: ${err.message}`,
    );
  }
}

async function watchRemove(folderPath: string): Promise<void> {
  const sub = subscriptions.get(folderPath);
  if (!sub) return;
  try {
    sub.close();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(
      `[watcher-worker] Failed to unwatch ${folderPath}: ${err.message}`,
    );
  }
  subscriptions.delete(folderPath);
}

async function unwatchAll(): Promise<void> {
  for (const [path, sub] of subscriptions.entries()) {
    try {
      sub.close();
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      console.error(
        `[watcher-worker] Failed to unwatch ${path}: ${err.message}`,
      );
    }
  }
  subscriptions.clear();
}

const keepAlive = setInterval(() => {}, 2 ** 31 - 1);

let pending: Promise<void> = Promise.resolve();

process.parentPort.on("message", ({ data }: { data: WorkerCommand }) => {
  if (data.cmd === "watch-add" || data.cmd === "watch") {
    pending = pending.then(() => watchAdd(data.path));
  } else if (data.cmd === "watch-remove") {
    pending = pending.then(() => watchRemove(data.path));
  } else if (data.cmd === "close") {
    clearInterval(keepAlive);
    pending.then(() => unwatchAll()).then(() => process.exit(0));
  }
});
