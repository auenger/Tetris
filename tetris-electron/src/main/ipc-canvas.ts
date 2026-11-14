import { ipcMain, type BrowserWindow } from "electron";
import * as canvasPersistence from "./canvas-persistence";

interface IpcContext {
  mainWindow: () => BrowserWindow | null;
  forwardToWebview: (
    target: string,
    channel: string,
    ...args: unknown[]
  ) => void;
}

export function registerCanvasHandlers(
  ctx: IpcContext,
): void {
  let pendingDragPaths: string[] = [];

  // Canvas persistence
  ipcMain.handle(
    "canvas:load-state",
    async (_event, canvasId?: string) => canvasPersistence.loadState(canvasId),
  );

  ipcMain.handle(
    "canvas:save-state",
    async (_event, state, canvasId?: string) => canvasPersistence.saveState(state, canvasId),
  );

  // Canvas pinch forwarding
  ipcMain.on(
    "canvas:forward-pinch",
    (_event, deltaY: number) => {
      ctx
        .mainWindow()
        ?.webContents.send("canvas:pinch", deltaY);
    },
  );

  // Cross-webview drag-and-drop
  ipcMain.on(
    "drag:set-paths",
    (_event, paths: string[]) => {
      pendingDragPaths = paths;
      ctx.forwardToWebview(
        "viewer",
        "nav-drag-active",
        true,
      );
    },
  );

  ipcMain.on("drag:clear-paths", () => {
    pendingDragPaths = [];
    ctx.forwardToWebview(
      "viewer",
      "nav-drag-active",
      false,
    );
  });

  ipcMain.handle("drag:get-paths", () => {
    const paths = pendingDragPaths;
    pendingDragPaths = [];
    return paths;
  });
}
