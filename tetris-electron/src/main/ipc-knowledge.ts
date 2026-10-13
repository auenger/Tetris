import { ipcMain, shell, type BrowserWindow } from "electron";
import { extname } from "node:path";
import * as wikilinkIndex from "./wikilink-index";
import { buildWorkspaceGraph } from "./workspace-graph";
import * as agentActivity from "./agent-activity";
import { workspaceForFile } from "./ipc-workspace";

interface IpcContext {
  mainWindow: () => BrowserWindow | null;
  fileFilter: () => any | null;
  workspaces: () => string[];
  forwardToWebview: (
    target: string,
    channel: string,
    ...args: unknown[]
  ) => void;
  trackEvent: (
    name: string,
    props?: Record<string, unknown>,
  ) => void;
}

export function registerKnowledgeHandlers(
  ctx: IpcContext,
): void {
  let activeWorkspace: string | null = null;
  const wikilinkWorkspace = () => activeWorkspace && ctx.workspaces().includes(activeWorkspace)
    ? activeWorkspace : ctx.workspaces()[0];
  // Wikilinks
  ipcMain.handle(
    "wikilink:resolve",
    async (_event, target: string) => {
      const ws = wikilinkWorkspace();
      if (!ws) return null;
      await wikilinkIndex.buildIndex(ws);
      return wikilinkIndex.resolve(target, ws);
    },
  );

  ipcMain.handle(
    "wikilink:suggest",
    async (_event, partial: string) => {
      const ws = wikilinkWorkspace();
      if (!ws) return [];
      await wikilinkIndex.buildIndex(ws);
      return wikilinkIndex.suggest(partial, ws);
    },
  );

  ipcMain.handle(
    "wikilink:backlinks",
    async (_event, filePath: string) => {
      const ws = workspaceForFile(filePath, ctx.workspaces());
      if (!ws) return [];
      await wikilinkIndex.buildLinkIndex(ws);
      return wikilinkIndex.backlinksWithContext(filePath);
    },
  );

  // Workspace graph
  ipcMain.handle(
    "workspace:get-graph",
    async (
      _event,
      params: { workspacePath: string },
    ) =>
      buildWorkspaceGraph(
        params.workspacePath,
        ctx.fileFilter(),
      ),
  );

  // Navigation
  ipcMain.on("nav:select-file", (_event, path) => {
    if (path) {
      ctx.trackEvent("file_selected", {
        ext: extname(path),
      });
      const workspace = workspaceForFile(
        path,
        ctx.workspaces(),
      );
      if (workspace) {
        activeWorkspace = workspace;
        agentActivity.setWorkspacePath(workspace);
      }
    }
    ctx.forwardToWebview("viewer", "file-selected", path);
    ctx.forwardToWebview("nav", "file-selected", path);
  });

  ipcMain.on(
    "nav:select-folder",
    (_event, path: string) => {
      activeWorkspace = workspaceForFile(path, ctx.workspaces());
      ctx.trackEvent("folder_selected");
      ctx.forwardToWebview(
        "viewer",
        "folder-selected",
        path,
      );
    },
  );

  ipcMain.on(
    "nav:open-in-terminal",
    (_event, path: string) => {
      ctx.trackEvent("file_opened_in_terminal");
      ctx.forwardToWebview(
        "canvas",
        "open-terminal",
        path,
      );
    },
  );

  ipcMain.on(
    "nav:reveal-in-finder",
    (_event, path: string) => {
      ctx.trackEvent("file_revealed_in_finder");
      shell.showItemInFolder(path);
    },
  );

  ipcMain.on(
    "nav:create-graph-tile",
    (_event, folderPath: string) => {
      ctx.forwardToWebview(
        "canvas",
        "create-graph-tile",
        folderPath,
      );
    },
  );
}
