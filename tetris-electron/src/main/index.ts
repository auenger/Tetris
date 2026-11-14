import {agentSessions, publishAgentSessions} from './agent-session-store';
import {registerProviderQuotas} from './provider-quotas';
import { configureDynamicIsland } from './dynamic-island';
import "./logger";
import { readTerminalClipboard } from "./terminal-clipboard";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  screen,
  session,
  shell,
  webContents as webContentsModule,
  type WebContents,
} from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fromCollabFileUrl, fromHtmlPreviewUrl } from "@tetris/shared/collab-file-url";
import { matchesTileFullscreenShortcut } from "@tetris/shared/tile-fullscreen-shortcut";
import { SHORTCUT_DEFINITIONS, shortcutPref, resolveShortcut, defaultShortcut, shortcutKeyError, shortcutConflict, shortcutAccelerator, type ShortcutAction } from "@tetris/shared/shortcuts";
import {
  loadConfig,
  saveConfig,
  getPref,
  setPref,
  getInProcessTerminals,
  type WindowState,
  type TerminalTarget,
} from "./config";
import { registerIpcHandlers, setMainWindow } from "./ipc";
import { registerCanvasRpc } from "./canvas-rpc";
import { registerIntegrationsIpc } from "./integrations";
import {
  registerMethod,
  startJsonRpcServer,
  stopJsonRpcServer,
} from "./json-rpc-server";
import * as watcher from "./watcher";
import * as gitReplay from "./git-replay";
import { DISABLE_GIT_REPLAY } from "@tetris/shared/replay-types";
import * as pty from "./pty";
import { updateManager, setupUpdateIPC } from "./updater";
import { DEV_WORKTREE_ID } from "./paths";
import {
  initMainAnalytics,
  trackEvent,
  shutdownAnalytics,
  getDeviceId,
} from "./analytics";
import { stopImageWorker } from "./image-service";
import { installCli } from "./cli-installer";
import { listTerminalTargets } from "./terminal-target";
import { readSessionMeta } from "./session-store";
import { registerBrowserIpc } from "./ipc-browser";
import { registerAgentIpc } from "./acp-agent";
import { initOutreach } from "./outreach";

// macOS apps launched from Finder don't inherit the user's shell
// LANG, so child processes (shells) default to ASCII.
if (!process.env.LANG || !process.env.LANG.includes("UTF-8")) {
  process.env.LANG = "en_US.UTF-8";
}

process.on("uncaughtException", (error) => {
  trackEvent("app_crash", {
    type: "uncaughtException",
    message: error.message,
    stack: error.stack,
  });
  console.error("[crash] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  const error =
    reason instanceof Error ? reason : new Error(String(reason));
  trackEvent("app_crash", {
    type: "unhandledRejection",
    message: error.message,
    stack: error.stack,
  });
  console.error("[crash] Unhandled rejection:", error);
});

// Keep the original Chromium profile (browser logins, device ID, etc.) across rebranding.
const legacyProfilePath = join(app.getPath("appData"), "@collaborator", "electron");
mkdirSync(legacyProfilePath, { recursive: true });
app.setPath("userData", legacyProfilePath);
app.setName("Tetris");

if (import.meta.env.DEV) {
  app.setPath(
    "userData",
    join(app.getPath("userData"), "dev", DEV_WORKTREE_ID ?? "worktree-unknown"),
  );
}

let mainWindow: BrowserWindow | null = null;
app.on('open-url',(event,url)=>{
 let target:URL;try{target=new URL(url)}catch{return}
 if(target.protocol!=='tetris-agent:'||target.hostname!=='open')return;
 event.preventDefault();
 const win=mainWindow;if(!win||win.isDestroyed())return;
 if(win.isMinimized())win.restore();win.show();win.focus();
 const id=target.searchParams.get('session');
 const row=agentSessions.snapshot().sessions.find(s=>s.id===id);
 if(row){if(row.unread){agentSessions.read(row.id,row.completedAt);publishAgentSessions();}if(!row.id.startsWith('external:'))win.webContents.send('agent:notification-open',row.id);}
});

let pendingFilePath: string | null = null;
let config = loadConfig();
let shuttingDown = false;

// Apply saved theme preference (light/dark/system)
const savedTheme = config.ui.theme;
if (savedTheme === "light" || savedTheme === "dark") {
  nativeTheme.themeSource = savedTheme;
} else {
  nativeTheme.themeSource = "system";
}
let globalZoomLevel = 0;

if (!app.isPackaged) {
  // Vite dev uses a relaxed renderer policy for HMR; suppress Electron's
  // repeated dev-only security banner so actionable logs stay visible.
  process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
}

// macOS GUI apps launched from Finder get a minimal PATH from launchd.
// Resolve the user's full shell PATH so child processes (terminal, git) work.
if (app.isPackaged && process.platform === "darwin") {
  try {
    const shell = process.env["SHELL"] || "/bin/zsh";
    const output = execFileSync(
      shell,
      ["-l", "-c", 'printf "%s" "$PATH"'],
      { encoding: "utf8", timeout: 5000 },
    );
    const resolved = output.split("\n").pop()!;
    if (resolved.includes("/")) {
      process.env["PATH"] = resolved;
    }
  } catch {
    // Fall through with the default PATH if shell resolution fails.
  }
}

const DEFAULT_STATE: WindowState = {
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
};

function boundsVisibleOnAnyDisplay(bounds: WindowState): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    return (
      bounds.x < x + width &&
      bounds.x + bounds.width > x &&
      bounds.y < y + height &&
      bounds.y + bounds.height > y
    );
  });
}

function saveWindowState(state: WindowState): void {
  try {
    config.window_state = state;
    saveConfig(config);
  } catch (err) {
    console.error("Failed to save window state:", err);
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveWindowState(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
    const { x, y, width, height } = mainWindow.getNormalBounds();
    saveWindowState({ x, y, width, height });
  }, 500);
}

function sendShortcut(action: string): void {
  mainWindow?.webContents.send("shell:shortcut", action);
}

function configuredShortcut(action: ShortcutAction) {
  return resolveShortcut(action, getPref(config, shortcutPref(action)), process.platform === "darwin");
}

function resolveToggleShortcut(input: Electron.Input) {
  return SHORTCUT_DEFINITIONS.find(({ action }) => matchesTileFullscreenShortcut(input, configuredShortcut(action)));
}

function runShortcut(action: ShortcutAction) {
  if (action === "zoom-in") applyZoomToAll(globalZoomLevel + 0.25);
  else if (action === "zoom-out") applyZoomToAll(globalZoomLevel - 0.25);
  else if (action === "zoom-reset") applyZoomToAll(0);
  else if (action === "toggle-window-fullscreen") mainWindow?.setFullScreen(!mainWindow.isFullScreen());
  else sendShortcut(action);
}

const shortcutRecordingContents = new WeakSet<WebContents>();

ipcMain.handle("settings:shortcut-recording", (event, recording: boolean) => {
  if (recording) shortcutRecordingContents.add(event.sender);
  else shortcutRecordingContents.delete(event.sender);
  event.sender.setIgnoreMenuShortcuts(recording);
});

function attachShortcutListener(target: WebContents): void {
  target.on("before-input-event", (event, input) => {
    if (shortcutRecordingContents.has(target)) return;
    if (input.type !== "keyDown") return;

    const toggle = resolveToggleShortcut(input);
    if (toggle) {
      event.preventDefault();
      if (!input.isAutoRepeat) runShortcut(toggle.action);
    }
  });
}

function isBrowserTileWebview(wc: WebContents): boolean {
  try {
    return wc.session === session.fromPartition("persist:browser");
  } catch {
    return false;
  }
}

function attachBrowserShortcuts(
  wc: WebContents,
  hostWindow: BrowserWindow,
): void {
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || resolveToggleShortcut(input)) return;
    const cmd = input.meta || input.control;
    if (!cmd) {
      if (input.key === "Escape" && wc.isLoading()) {
        event.preventDefault();
        wc.stop();
      }
      return;
    }

    if (input.code === "KeyL" || input.key === "l") {
      event.preventDefault();
      hostWindow.webContents.send(
        "browser-tile:focus-url", wc.id,
      );
    } else if (input.code === "BracketLeft" || input.key === "[") {
      event.preventDefault();
      if (wc.canGoBack()) wc.goBack();
    } else if (input.code === "BracketRight" || input.key === "]") {
      event.preventDefault();
      if (wc.canGoForward()) wc.goForward();
    } else if (input.code === "KeyR" || input.key === "r") {
      event.preventDefault();
      wc.reload();
    }
  });
}

function registerToggleShortcuts(win: BrowserWindow): void {
  attachShortcutListener(win.webContents);

  win.webContents.on("did-attach-webview", (_event, wc) => {
    wc.once("did-finish-load", () => {
      // Transparent compositor surface so terminal tiles can
      // show through to the canvas/vibrancy background.
      wc.insertCSS("html, body { background: transparent !important; }");

      attachShortcutListener(wc);
      if (isBrowserTileWebview(wc)) {
        attachBrowserShortcuts(wc, win);
      }
      if (globalZoomLevel !== 0) {
        wc.setZoomLevel(globalZoomLevel);
      }
    });
  });
}

function applyZoomToAll(level: number): void {
  globalZoomLevel = level;
  for (const wc of webContentsModule.getAllWebContents()) {
    if (!wc.isDestroyed()) wc.setZoomLevel(level);
  }
}

function buildAppMenu(): void {
  const isMac = process.platform === "darwin";
  const accelerator = (action: ShortcutAction) => shortcutAccelerator(configuredShortcut(action), isMac);

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Settings\u2026",
                accelerator: accelerator("toggle-settings"),
                registerAccelerator: false,
                click: () => sendShortcut("toggle-settings"),
              } as Electron.MenuItemConstructorOptions,
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Tile",
          accelerator: accelerator("new-tile"),
          registerAccelerator: false,
          click: () => sendShortcut("new-tile"),
        },
        {
          label: "Close Tile",
          accelerator: accelerator("close-tile"),
          registerAccelerator: false,
          click: () => sendShortcut("close-tile"),
        },
        { type: "separator" },
        {
          label: "Open Workspace\u2026",
          accelerator: accelerator("add-workspace"),
          registerAccelerator: false,
          click: () => sendShortcut("add-workspace"),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: accelerator("focus-file-search"),
          registerAccelerator: false,
          click: () => sendShortcut("focus-file-search"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Files",
          accelerator: accelerator("sidebar-files"),
          registerAccelerator: false,
          click: () => sendShortcut("sidebar-files"),
        },
        {
          label: "Toggle Agent",
          accelerator: accelerator("toggle-agent"),
          registerAccelerator: false,
          click: () => sendShortcut("toggle-agent"),
        },
        { type: "separator" },
        {
          label: "Zoom In",
          accelerator: accelerator("zoom-in"),
          registerAccelerator: false,
          click: () => applyZoomToAll(globalZoomLevel + 0.25),
        },
        {
          label: "Zoom Out",
          accelerator: accelerator("zoom-out"),
          registerAccelerator: false,
          click: () => applyZoomToAll(globalZoomLevel - 0.25),
        },
        {
          label: "Actual Size",
          accelerator: accelerator("zoom-reset"),
          registerAccelerator: false,
          click: () => applyZoomToAll(0),
        },
        { type: "separator" },
        { role: "toggleDevTools" },
        {
          label: "Toggle Full Screen",
          accelerator: accelerator("toggle-window-fullscreen"),
          registerAccelerator: false,
          click: (_, win) => win?.setFullScreen(!win.isFullScreen()),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getPreloadPath(name: string): string {
  return join(__dirname, `../preload/${name}.js`);
}

function getRendererURL(name: string): string {
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    return `${process.env["ELECTRON_RENDERER_URL"]}/${name}/index.html`;
  }
  return pathToFileURL(
    join(__dirname, `../renderer/${name}/index.html`),
  ).href;
}

function createWindow(): void {
  const saved = config.window_state;
  const useSaved =
    saved !== null &&
    (saved.isMaximized || boundsVisibleOnAnyDisplay(saved));
  const state = useSaved ? saved : DEFAULT_STATE;

  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(app.getAppPath(), "build", "icon.png");
  if (process.platform === "darwin") app.dock?.setIcon(iconPath);
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    title: "Tetris",
    icon: iconPath,
    width: state.width,
    height: state.height,
    minWidth: 400,
    minHeight: 400,
    webPreferences: {
      preload: getPreloadPath("shell"),
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
  };

  if (process.platform === "darwin") {
    Object.assign(windowOptions, {
      titleBarStyle: "hidden",
      vibrancy: "under-window",
      visualEffectState: "active",
      trafficLightPosition: { x: 14, y: 12 },
    } satisfies Partial<Electron.BrowserWindowConstructorOptions>);
  }

  if (process.platform === "win32") {
    Object.assign(windowOptions, {
      backgroundColor: "#00000000",
      backgroundMaterial: "mica",
    } satisfies Partial<Electron.BrowserWindowConstructorOptions>);
  }

  if (useSaved) {
    windowOptions.x = state.x;
    windowOptions.y = state.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on("move", debouncedSaveWindowState);
  mainWindow.on("resize", debouncedSaveWindowState);
  mainWindow.on("close", () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { x, y, width, height } = mainWindow.getNormalBounds();
    saveWindowState({
      x,
      y,
      width,
      height,
      isMaximized: mainWindow.isMaximized(),
    });
  });
  mainWindow.loadURL(getRendererURL("shell"));

  setMainWindow(mainWindow);
  registerCanvasRpc(mainWindow);
}

ipcMain.handle(
  "analytics:get-device-id",
  () => getDeviceId(),
);

ipcMain.on("analytics:track-event", (_event, name, properties) => {
  trackEvent(name, properties);
});

ipcMain.on("get-home-path", (event) => {
  event.returnValue = app.getPath("home");
});

ipcMain.handle("shell:get-view-config", () => {
  const preload = pathToFileURL(
    getPreloadPath("universal"),
  ).href;

  return {
    nav: { src: getRendererURL("nav"), preload },
    viewer: { src: getRendererURL("viewer"), preload },
    terminal: { src: getRendererURL("terminal"), preload },
    terminalTile: { src: getRendererURL("terminal-tile"), preload },
    graphTile: { src: getRendererURL("graph-tile"), preload },
    settings: { src: getRendererURL("settings"), preload },
    tileList: { src: getRendererURL("tile-list"), preload },
    agentChat: { src: getRendererURL("agent-chat"), preload },
  };
});

ipcMain.handle(
  "shell:get-in-process-terminals",
  () => getInProcessTerminals(),
);

const statusDisplayKeys = ['dynamicIslandEnabled'];
async function applyStatusDisplays() {
  await configureDynamicIsland(getPref(config,'dynamicIslandEnabled') === true, () => mainWindow);
}

ipcMain.handle(
  "pref:get",
  (_event, key: string) => getPref(config, key),
);

ipcMain.handle(
  "pref:set",
  async (_event, key: string, value: unknown) => {
    const shortcut = SHORTCUT_DEFINITIONS.find(d => shortcutPref(d.action) === key);
    if (shortcut) {
      const isMac = process.platform === "darwin";
      const candidate = value === null ? defaultShortcut(shortcut.action, isMac) : value;
      const error = shortcutKeyError(candidate);
      if (error) throw new Error(error);
      const conflict = shortcutConflict(shortcut.action, candidate as ReturnType<typeof defaultShortcut>, k => getPref(config, k), isMac);
      if (conflict) throw new Error(conflict);
    }
    const previous = getPref(config,key);
    if (statusDisplayKeys.includes(key) && typeof value !== 'boolean') throw new Error('Expected boolean');
    setPref(config, key, value);
    if (statusDisplayKeys.includes(key)) {
      try { await applyStatusDisplays(); }
      catch(error) { setPref(config,key,previous); await applyStatusDisplays().catch(() => {}); throw error; }
    }
    if (shortcut) buildAppMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pref:changed", key, value);
      if (key === "terminalAppearance") {
        for (const contents of webContentsModule.getAllWebContents()) {
          if (contents.hostWebContents === mainWindow.webContents && !contents.isDestroyed())
            contents.send("pref:changed", key, value);
        }
      }
    }
  },
);

ipcMain.handle(
  "terminal:list-targets",
  () => listTerminalTargets(),
);

ipcMain.handle(
  "theme:set",
  (_event, mode: string) => {
    const valid = mode === "light" || mode === "dark" ? mode : "system";
    nativeTheme.themeSource = valid;
    setPref(config, "theme", valid);
  },
);

ipcMain.handle(
  "pty:create",
  (
    event,
    params?: {
      cwd?: string;
      cols?: number;
      rows?: number;
      tileId?: string;
      target?: TerminalTarget;
    },
  ) =>
    pty.createSession(
      params?.cwd,
      event.sender.id,
      params?.cols,
      params?.rows,
      params?.target,
      params?.tileId,
    ),
);

ipcMain.handle("terminal:read-clipboard", (event) => {
  const sender = event.sender;
  const url = sender.getURL();
  const main = mainWindow?.webContents;
  const localTerminal = sender.hostWebContents === main &&
    /\/(?:terminal|terminal-tile)\/index\.html(?:[?#]|$)/.test(url) &&
    (url.startsWith("file:") || (!app.isPackaged && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url)));
  if (!main || (sender !== main && !localTerminal)) throw new Error("Untrusted clipboard reader");
  return readTerminalClipboard(clipboard);
});

function handlePtyWrite(
  sessionId: string,
  data: string,
): void {
  pty.writeToSession(sessionId, data);
}

ipcMain.handle(
  "pty:write",
  (_event, { sessionId, data }: { sessionId: string; data: string }) =>
    handlePtyWrite(sessionId, data),
);

ipcMain.on(
  "pty:write",
  (_event, { sessionId, data }: { sessionId: string; data: string }) => {
    handlePtyWrite(sessionId, data);
  },
);

function handlePtySendRawKeys(
  sessionId: string,
  data: string,
): void {
  pty.sendRawKeys(sessionId, data);
}

ipcMain.handle(
  "pty:send-raw-keys",
  (_event, { sessionId, data }: { sessionId: string; data: string }) =>
    handlePtySendRawKeys(sessionId, data),
);

ipcMain.on(
  "pty:send-raw-keys",
  (_event, { sessionId, data }: { sessionId: string; data: string }) => {
    handlePtySendRawKeys(sessionId, data);
  },
);

ipcMain.handle(
  "pty:resize",
  (
    _event,
    {
      sessionId,
      cols,
      rows,
    }: { sessionId: string; cols: number; rows: number },
  ) => pty.resizeSession(sessionId, cols, rows),
);

ipcMain.handle(
  "pty:kill",
  (_event, { sessionId }: { sessionId: string }) =>
    pty.killSession(sessionId),
);

ipcMain.handle(
  "pty:reconnect",
  (
    event,
    {
      sessionId,
      cols,
      rows,
    }: { sessionId: string; cols: number; rows: number },
  ) =>
    pty.reconnectSession(
      sessionId, cols, rows, event.sender.id,
    ),
);

ipcMain.handle(
  "pty:discover",
  () => pty.discoverSessions(),
);

ipcMain.handle(
  "pty:read-meta",
  (_event, sessionId: string) => readSessionMeta(sessionId),
);

ipcMain.handle(
  "pty:foreground-process",
  (_event, sessionId: string) => pty.getForegroundProcess(sessionId),
);

ipcMain.handle(
  "pty:capture",
  (
    _event,
    { sessionId, lines }: { sessionId: string; lines?: number },
  ) => pty.captureSession(sessionId, lines),
);

let settingsOpen = false;

function setSettingsOpen(open: boolean): void {
  if (!mainWindow || settingsOpen === open) return;
  settingsOpen = open;
  if (!open) {
    for (const contents of webContentsModule.getAllWebContents()) {
      if (shortcutRecordingContents.delete(contents) && !contents.isDestroyed()) {
        contents.setIgnoreMenuShortcuts(false);
      }
    }
  }
  mainWindow.webContents.send("shell:settings", open ? "open" : "close");
}

ipcMain.on("settings:open", () => setSettingsOpen(true));

const LOG_FN_BY_LEVEL: Record<number, (...args: unknown[]) => void> = {
  0: console.debug,
  1: console.log,
  2: console.warn,
  3: console.error,
};

ipcMain.on(
  "webview:console",
  (_event, panel: string, level: number, message: string, source: string) => {
    const tag = `[webview:${panel}]`;
    const logFn = LOG_FN_BY_LEVEL[level] ?? console.log;
    logFn(`${tag} ${message}`, source ? `(${source})` : "");
  },
);

ipcMain.on("settings:close", () => setSettingsOpen(false));
ipcMain.on("settings:toggle", () => setSettingsOpen(!settingsOpen));

function sendLoadingDone(): void {
  mainWindow?.webContents.send("shell:loading-done");
}

async function shutdownBackgroundServices(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await pty.shutdownSidecarIfIdle();
  watcher.stopWorker();
  if (!DISABLE_GIT_REPLAY) gitReplay.stopWorker();
  stopJsonRpcServer();
  stopImageWorker();
}

app.on("open-file", (event, path) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      "shell:forward", "viewer", "file-selected", path,
    );
  } else {
    pendingFilePath = path;
  }
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "collab-file",
    privileges: {
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
  {
    scheme: "collab-preview",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

app.on("web-contents-created", (_event, contents) => {
  const isExternal = (url: string): boolean => {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return false;
    }
    const devOrigin = process.env["ELECTRON_RENDERER_URL"];
    if (devOrigin && url.startsWith(devOrigin)) return false;
    return true;
  };

  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (isBrowserTileWebview(contents)) {
      if (disposition === "foreground-tab" || disposition === "background-tab") {
        mainWindow?.webContents.send(
          "shell:forward", "canvas", "open-browser-tile", url,
          contents.id,
        );
        return { action: "deny" };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 500,
          height: 600,
          webPreferences: {
            partition: "persist:browser",
          },
        },
      };
    }
    if (isExternal(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isExternal(url) && !isBrowserTileWebview(contents)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

app.whenReady().then(async () => {
  // Set a standard Chrome user-agent on the browser tile session so sites
  // (especially Google OAuth) treat it as a real browser, not an embedded webview.
  const browserSession = session.fromPartition("persist:browser");
  const electronUA = browserSession.getUserAgent();
  browserSession.setUserAgent(
    electronUA.replace(/\s*Electron\/\S+/, ""),
  );

  protocol.handle("collab-file", (request) => {
    const filePath = fromCollabFileUrl(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
  protocol.handle("collab-preview", (request) => {
    const filePath = fromHtmlPreviewUrl(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  shuttingDown = false;

  config = loadConfig();
  installCli();
  registerIpcHandlers(config);
  registerBrowserIpc();
  registerIntegrationsIpc();
  setupUpdateIPC();
  updateManager.init({
    enabled: false, // Tetris has no release feed yet; never install upstream app releases.
    onBeforeQuit: () => shutdownBackgroundServices(),
  });

  try {
    await pty.ensureSidecar();
  } catch (err) {
    console.error("Sidecar failed to start:", err);
  }

  buildAppMenu();
  createWindow();
  void applyStatusDisplays().catch(error => dialog.showErrorBox("状态显示不可用", String(error)));
  registerAgentIpc(mainWindow!, config);
  registerToggleShortcuts(mainWindow!);

  initMainAnalytics();
  trackEvent("app_launched");
  initOutreach(() => mainWindow);

  mainWindow!.webContents.on("did-finish-load", () => {
    sendLoadingDone();
    if (pendingFilePath) {
      mainWindow!.webContents.send(
        "shell:forward", "viewer", "file-selected", pendingFilePath,
      );
      pendingFilePath = null;
    }
  });

  registerMethod("ping", () => ({ pong: true }), {
    description: "Health check — returns {pong: true}",
  });
  registerMethod("workspace.getConfig", () => config, {
    description: "Return the current app configuration",
  });

  try {
    await startJsonRpcServer();
  } catch (err) {
    console.error("Failed to start JSON-RPC server:", err);
  }
});

app.on("before-quit", (event) => {
  if (!shuttingDown) {
    event.preventDefault();
    shutdownBackgroundServices().then(() => app.quit());
  }
});

app.on("window-all-closed", async () => {
  await shutdownBackgroundServices();
  await shutdownAnalytics();
  app.quit();
});

registerProviderQuotas(() => getRendererURL("settings"));
