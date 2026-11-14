import { Select } from '../../../shared/ui/Select';
import ProviderQuotas from './ProviderQuotas';
import { TERMINAL_APPEARANCE_PREF, normalizeTerminalAppearance, resolveTerminalTheme, type TerminalAppearance } from "@tetris/components/Terminal/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTileFullscreenShortcut, type TileFullscreenShortcut } from "@tetris/shared/tile-fullscreen-shortcut";
import { SHORTCUT_DEFINITIONS, defaultShortcut, shortcutPref, resolveShortcut, shortcutKeyError, type ShortcutAction } from "@tetris/shared/shortcuts";
import {
  GearSix,
  Keyboard,
  Palette,
  PuzzlePiece,
  Sun,
  Moon,
  Monitor,
  Terminal,
} from "@phosphor-icons/react";

type ThemeMode = "light" | "dark" | "system";

interface SettingsApi {
  getPref: (key: string) => Promise<unknown>;
  setPref: (key: string, value: unknown) => Promise<void>;
  listTerminalTargets: () => Promise<Array<{
    id: string;
    label: string;
    isDefault?: boolean;
  }>>;
  setTheme: (mode: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getAgents: () => Promise<AgentStatus[]>;
  installSkill: (agentId: string) => Promise<{ ok: boolean }>;
  uninstallSkill: (agentId: string) => Promise<{ ok: boolean }>;
  close: () => void;
  setShortcutRecording: (recording: boolean) => Promise<void>;
}

const api = (window as unknown as { api: SettingsApi }).api;

const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

const THEME_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const commit = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(Math.round(min + ratio * (max - min)));
    },
    [min, max, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      commit(e.clientX);
    },
    [commit],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      commit(e.clientX);
    },
    [commit],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="relative h-5 w-full cursor-pointer select-none flex items-center"
    >
      <div
        className="absolute h-[3px] w-full rounded-full"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--foreground) 12%, transparent)",
        }}
      />
      <div
        className="absolute h-[3px] rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: "var(--foreground)",
          opacity: 0.45,
        }}
      />
      <div
        className="absolute h-3.5 w-3.5 rounded-full border-2 shadow-sm"
        style={{
          left: `calc(${pct}% - 7px)`,
          backgroundColor: "var(--background)",
          borderColor: "var(--foreground)",
          opacity: 1,
        }}
      />
    </div>
  );
}

function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const idx = THEME_MODES.indexOf(value);

  return (
    <div
      className="relative inline-flex h-8 rounded-full p-0.5"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 10%, transparent)",
      }}
    >
      {/* sliding pill */}
      <div
        className="absolute top-0.5 h-7 w-9 rounded-full transition-transform duration-150"
        style={{
          backgroundColor: "var(--accent)",
          transform: `translateX(${idx * 36}px)`,
        }}
      />
      {THEME_MODES.map((mode) => {
        const Icon = THEME_ICONS[mode];
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            aria-label={mode}
            onClick={() => onChange(mode)}
            className="relative z-10 flex h-7 w-9 items-center justify-center rounded-full cursor-pointer"
          >
            <Icon
              className="h-4 w-4 transition-colors duration-150"
              style={{
                color: active
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
              }}
              weight={active ? "fill" : "regular"}
            />
          </button>
        );
      })}
    </div>
  );
}

function NotificationPanelSetting() {
  const [enabled,setEnabled]=useState(true);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{api.getPref('showNotificationPanel').then(value=>setEnabled(value!==false)).catch(e=>setError(String(e))).finally(()=>setBusy(false));},[]);
  async function change(value:boolean){setBusy(true);setError('');try{await api.setPref('showNotificationPanel',value);setEnabled(value);}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <div><label className="flex items-center justify-between gap-4">
    <span><span className="block text-sm font-medium">Show Notification panel</span><span className="text-xs text-muted-foreground">显示右上角通知面板；隐藏后，Tiles 和灵动岛仍会提示待处理与新完成。</span></span>
    <input type="checkbox" checked={enabled} disabled={busy} onChange={e=>void change(e.target.checked)} />
  </label>{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}</div>;
}

function AppearancePane() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [canvasOpacity, setCanvasOpacity] = useState(0);
  const [terminalAppearance, setTerminalAppearance] = useState<TerminalAppearance>(() => normalizeTerminalAppearance(undefined));
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalError, setTerminalError] = useState("");

  useEffect(() => {
    api.getPref(TERMINAL_APPEARANCE_PREF)
      .then(value => setTerminalAppearance(normalizeTerminalAppearance(value)))
      .catch(() => {})
      .finally(() => setTerminalReady(true));
    api.getPref("theme")
      .then((v) => {
        if (v === "light" || v === "dark") setTheme(v);
        else setTheme("system");
      })
      .catch(() => { });
    api.getPref("canvasOpacity")
      .then((v) => {
        if (typeof v === "number") setCanvasOpacity(v);
      })
      .catch(() => { });
  }, []);

  async function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    await api.setTheme(mode);
  }

  async function handleTerminalAppearanceChange(patch: Partial<TerminalAppearance>) {
    const next = normalizeTerminalAppearance({ ...terminalAppearance, ...patch });
    setTerminalAppearance(next);
    setTerminalError("");
    try { await api.setPref(TERMINAL_APPEARANCE_PREF, next); }
    catch { setTerminalError("Unable to save terminal appearance. Please try again."); }
  }

  async function handleOpacityChange(value: number) {
    setCanvasOpacity(value);
    await api.setPref("canvasOpacity", value);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Customize how Tetris looks.
        </p>
      </div>

      <NotificationPanelSetting />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Theme</p>
        <ThemeToggle
          value={theme}
          onChange={(m) => { void handleThemeChange(m); }}
        />
      </div>

      <div className="space-y-4 border-t border-border/50 pt-5">
        <div>
          <p className="text-sm font-medium">Terminal appearance</p>
          <p className="text-xs text-muted-foreground mt-1">Apply instantly without restarting sessions. Agent-specific colors may follow the agent's own theme.</p>
        </div>
        <label className="flex items-center justify-between gap-4 text-sm">
          Terminal mode
          <Select aria-label="Terminal mode" disabled={!terminalReady} value={terminalAppearance.mode}
            onChange={e => void handleTerminalAppearanceChange({ mode: e.target.value as TerminalAppearance["mode"] })}>
            <option value="auto">Follow app</option><option value="light">Light</option><option value="dark">Dark</option>
          </Select>
        </label>
        {(["light", "dark"] as const).map(variant => {
          const preview = resolveTerminalTheme({ ...terminalAppearance, mode: variant }, variant === "dark");
          return <div key={variant} className="space-y-2">
            <label className="flex items-center justify-between gap-4 text-sm">
              {variant === "light" ? "Light palette" : "Dark palette"}
              <Select aria-label={variant === "light" ? "Light palette" : "Dark palette"} disabled={!terminalReady} value={terminalAppearance[variant]}
                onChange={e => void handleTerminalAppearanceChange({ [variant]: e.target.value })}>
                <option value="default">Tetris {variant === "light" ? "Light" : "Dark"}</option>
                <option value={variant === "light" ? "paper" : "midnight"}>{variant === "light" ? "Paper" : "Midnight"}</option>
              </Select>
            </label>
            <div aria-label={`${variant} terminal preview`} className="rounded-md border border-border/50 p-3 font-mono text-xs leading-6"
              style={{ backgroundColor: preview.background, color: preview.foreground }}>
              <div>$ git status <span style={{ color: preview.cursor }}>▌</span></div>
              <div><span style={{ color: preview.green }}>Ready</span> · <span style={{ color: preview.blue }}>src/app.ts</span> · <span style={{ color: preview.red }}>Error</span></div>
              <span style={{ backgroundColor: preview.selectionBackground }}>Selected text</span>
            </div>
          </div>;
        })}
        {terminalError && <p role="alert" className="text-xs text-destructive">{terminalError}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Canvas opacity</p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {canvasOpacity}%
          </span>
        </div>
        <Slider
          value={canvasOpacity}
          onChange={(v) => { void handleOpacityChange(v); }}
        />
      </div>
    </div>
  );
}

const IS_MAC = window.api.getPlatform() === "darwin";

const MOD = IS_MAC ? "\u2318" : "Ctrl+";
const SHIFT = IS_MAC ? "\u21E7" : "Shift+";
const CTRL = IS_MAC ? "\u2303" : "Ctrl+";

const MOUSE_INPUTS: { label: string; keys: string }[] = [
  { label: "Pan Canvas", keys: "Two-Finger Swipe" },
  { label: "Pan Canvas", keys: "Middle Click + Drag" },
  { label: "Pan Canvas", keys: "Space + Drag" },
  { label: "Scroll Canvas Vertically", keys: "Scroll" },
  { label: "Scroll Canvas Horizontally", keys: `${SHIFT} Scroll` },
  { label: "Zoom", keys: `${CTRL} Scroll` },
  ...(IS_MAC
    ? [{ label: "Zoom", keys: `${MOD} Scroll` }]
    : []),
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 8%, transparent)",
        color: "var(--foreground)",
      }}
    >
      {children}
    </kbd>
  );
}

function ShortcutList({ items }: { items: { label: string; keys: string }[] }) {
  return (
    <div className="space-y-0">
      {items.map(({ label, keys }, i) => (
        <div
          key={`${label}-${i}`}
          className="flex items-center justify-between py-2"
          style={{
            borderBottom:
              "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)",
          }}
        >
          <span className="text-sm">{label}</span>
          <Kbd>{keys}</Kbd>
        </div>
      ))}
    </div>
  );
}

type TerminalMode = "sidecar";

const TERMINAL_MODES: {
  value: TerminalMode;
  label: string;
  description: string;
}[] = [
  {
    value: "sidecar",
    label: "node-pty",
    description: "Clean scrollback rendering.",
  },
];

type TerminalTarget = string;

type TerminalTargetOption = {
  id: string;
  label: string;
  isDefault?: boolean;
};

function RadioOption({
  selected,
  onClick,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left cursor-pointer"
      style={{
        border: `1px solid ${selected
          ? "var(--foreground)"
          : "color-mix(in srgb, var(--foreground) 15%, transparent)"}`,
        backgroundColor: selected
          ? "color-mix(in srgb, var(--foreground) 6%, transparent)"
          : "transparent",
      }}
    >
      <div
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: selected
            ? "var(--foreground)"
            : "var(--muted-foreground)",
        }}
      >
        {selected && (
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--foreground)" }}
          />
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

function MacTerminalPane() {
  const [mode, setMode] = useState<TerminalMode>("sidecar");

  useEffect(() => {
    api.getPref("terminalMode")
      .then((v) => {
        if (v === "sidecar") setMode(v);
      })
      .catch(() => { });
  }, []);

  async function handleModeChange(value: TerminalMode) {
    setMode(value);
    await api.setPref("terminalMode", value);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Terminal</h2>
        <p className="text-sm text-muted-foreground">
          Changes take effect for new terminals.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Terminal backend</p>
        <div className="space-y-1.5">
          {TERMINAL_MODES.map(({ value, label, description }) => (
            <RadioOption
              key={value}
              selected={mode === value}
              onClick={() => { void handleModeChange(value); }}
              label={label}
              description={description}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WindowsTerminalPane() {
  const [target, setTarget] = useState<TerminalTarget>("auto");
  const [options, setOptions] = useState<TerminalTargetOption[]>([]);

  useEffect(() => {
    api.getPref("terminalTarget")
      .then((v) => {
        if (typeof v === "string") setTarget(v);
      })
      .catch(() => { });
    api.listTerminalTargets()
      .then((items) => setOptions(items))
      .catch(() => { });
  }, []);

  async function handleTargetChange(value: TerminalTarget) {
    setTarget(value);
    await api.setPref("terminalTarget", value);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Terminal</h2>
        <p className="text-sm text-muted-foreground">
          Changes take effect for new terminals.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Terminal target</p>
        <div className="space-y-1.5">
          {options.map(({ id, label, isDefault }) => (
            <RadioOption
              key={id}
              selected={target === id}
              onClick={() => { void handleTargetChange(id); }}
              label={label}
              description={isDefault
                ? "Recommended default for this platform."
                : "Available for new terminals."}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TerminalPane() {
  return IS_MAC ? <MacTerminalPane /> : <WindowsTerminalPane />;
}

function ShortcutControl({ action, label }: { action: ShortcutAction; label: string }) {
  const pref = shortcutPref(action);
  const [shortcut, setShortcut] = useState(() => defaultShortcut(action, IS_MAC));
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.getPref(pref)
      .then((value) => setShortcut(resolveShortcut(action, value, IS_MAC)))
      .catch(() => setError("Could not load the shortcut."));
    return () => { void api.setShortcutRecording(false); };
  }, []);

  async function stopRecording() {
    setRecording(false);
    await api.setShortcutRecording(false);
  }

  useEffect(() => {
    if (!recording) return;
    const cancel = () => { void stopRecording(); };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [recording]);

  async function saveShortcut(value: TileFullscreenShortcut | null) {
    setSaving(true);
    setError(null);
    try {
      await api.setPref(pref, value);
      setShortcut(value ?? defaultShortcut(action, IS_MAC));
    } catch (error) {
      setError(error instanceof Error ? error.message.replace(/^.*Error: /, "") : "Could not save the shortcut. Please try again.");
    } finally {
      setSaving(false);
      await stopRecording();
    }
  }

  async function startRecording() {
    setError(null);
    try {
      await api.setShortcutRecording(true);
      setRecording(true);
      recordButton.current?.focus();
    } catch {
      setError("Could not start recording the shortcut.");
    }
  }

  function recordShortcut(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!recording || saving) return;
    if (event.key === "Tab") {
      void stopRecording();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      void stopRecording();
      return;
    }
    if (event.repeat || event.nativeEvent.isComposing
      || ["Meta", "Control", "Alt", "Shift"].includes(event.key)) return;
    const value: TileFullscreenShortcut = {
      code: event.code, meta: event.metaKey, control: event.ctrlKey,
      alt: event.altKey, shift: event.shiftKey,
    };
    const validationError = shortcutKeyError(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    void saveShortcut(value);
  }

  return (
    <div className="space-y-1.5 border-b border-border/40 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">{label}</span>
        <div className="flex items-center gap-3">
          <button
            ref={recordButton}
            type="button"
            disabled={saving}
            aria-label={`Change ${label} shortcut`}
            aria-pressed={recording}
            onClick={() => { if (!recording) void startRecording(); }}
            onKeyDown={recordShortcut}
            onBlur={() => { void stopRecording(); }}
            className="rounded border border-border px-2 py-1 text-xs font-mono cursor-pointer focus:outline-none focus:ring-2 focus:ring-foreground/30 disabled:opacity-50"
          >
            {recording ? "Press shortcut…" : formatTileFullscreenShortcut(shortcut, IS_MAC)}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => { void saveShortcut(null); }}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
          >
            Reset to default
          </button>
        </div>
      </div>
      {recording && <p className="text-xs text-muted-foreground">Press a key combination. Esc cancels.</p>}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function ControlsPane() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
      </div>
      <p className="text-xs text-muted-foreground">Click a shortcut and press a new key combination. Changes apply immediately.</p>
      <div>{SHORTCUT_DEFINITIONS.map(({ action, label }) => (
        <ShortcutControl key={action} action={action} label={label} />
      ))}</div>

      <div className="space-y-1 pt-2">
        <h2 className="text-base font-semibold">Mouse Controls</h2>
      </div>
      <ShortcutList items={MOUSE_INPUTS} />
    </div>
  );
}

interface AgentStatus {
  id: string;
  name: string;
  detected: boolean;
  installed: boolean;
}

function IntegrationsPane() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAgents()
      .then((a) => setAgents(a))
      .catch(() => {});
  }, []);

  async function toggle(agent: AgentStatus) {
    setBusy((s) => new Set(s).add(agent.id));
    setError(null);
    try {
      const result = agent.installed
        ? await api.uninstallSkill(agent.id)
        : await api.installSkill(agent.id);
      if (result && !result.ok) {
        setError(`${agent.name}: ${(result as { error?: string }).error ?? "Unknown error"}`);
      }
    } catch (err) {
      setError(`${agent.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const updated = await api.getAgents();
    setAgents(updated);
    setBusy((s) => {
      const next = new Set(s);
      next.delete(agent.id);
      return next;
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Install the Canvas Skill so AI agents can control
          the canvas from the terminal.
        </p>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>
      )}

      <div className="space-y-1.5">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between rounded-md px-3 py-2.5"
            style={{
              border:
                "1px solid color-mix(in srgb, var(--foreground) 15%, transparent)",
            }}
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{agent.name}</p>
              <p className="text-xs text-muted-foreground">
                {agent.detected ? "Detected" : "Not found"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy.has(agent.id)}
              onClick={() => { void toggle(agent); }}
              className="rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: agent.installed
                  ? "color-mix(in srgb, var(--foreground) 8%, transparent)"
                  : "var(--foreground)",
                color: agent.installed
                  ? "var(--foreground)"
                  : "var(--background)",
              }}
            >
              {agent.installed ? "Uninstall" : "Install"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentDisplayPane() {
  const choices = [
    ['dynamicIslandEnabled','Enable Dynamic Island','Hover or tap the avatar to view sessions and usage. Approve Tetris hooks in Codex /hooks for activity updates.'],
  ];
  const [values,setValues] = useState<Record<string,boolean>>({});
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  useEffect(() => { Promise.all(choices.map(async ([key]) => [key, (await api.getPref(key)) ?? false]))
    .then(items => setValues(Object.fromEntries(items))).catch(e => setError(String(e))).finally(() => setBusy(false)); }, []);
  const change = async (key:string,value:boolean) => {
    setBusy(true); setError('');
    try { await api.setPref(key,value); setValues(v => ({...v,[key]:value})); }
    catch(e) {setError(String(e));} finally {setBusy(false);}
  };
  return <section className="p-6 space-y-5"><h2 className="text-lg font-semibold">Agent Display</h2>
    <p className="text-sm text-muted-foreground">macOS · Agent status stays visible beside the avatar: working, idle, attention, or not connected. Hover or tap for details. </p>
    {choices.map(([key,label,description]) => <label key={key} className="flex items-center justify-between gap-4 border-b border-border pb-4">
      <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{description}</span></span>
      <input type="checkbox" checked={values[key] || false} disabled={busy || (!navigator.platform.includes('Mac'))} onChange={e => void change(key,e.target.checked)} />
    </label>)}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}

type Pane = "providers" | "agent-display" | "appearance" | "terminal" | "integrations" | "controls";

const NAV_ITEMS: {
  id: Pane;
  label: string;
  icon: typeof Palette;
}[] = [
    { id: "providers", label: "Account Usage", icon: GearSix },
    { id: "agent-display", label: "Agent Display", icon: Monitor },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "terminal", label: "Terminal", icon: Terminal },
    { id: "integrations", label: "Integrations", icon: PuzzlePiece },
    { id: "controls", label: "Controls", icon: Keyboard },
  ];

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        aria-label="Close"
        className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-foreground/25 bg-transparent p-0 text-foreground/25 transition-opacity duration-150 hover:text-foreground/60 hover:border-foreground/60 cursor-pointer"
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 3L9 9M9 3L3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="text-[11px] tracking-[0.05em] text-foreground/25 select-none pointer-events-none font-mono">
        esc
      </span>
    </div>
  );
}

export default function App() {
  const [activePane, setActivePane] =
    useState<Pane>("appearance");
  const [appVersion, setAppVersion] = useState("");
  const paneRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focusInitialControl = () => {
      paneRef.current?.focus();
    };
    focusInitialControl();
    window.addEventListener("focus", focusInitialControl);
    return () =>
      window.removeEventListener("focus", focusInitialControl);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        api.close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    api.getAppVersion()
      .then((v) => setAppVersion(v))
      .catch(() => { });
  }, []);

  return (
    <div
      ref={paneRef}
      tabIndex={-1}
      className="flex h-full w-full bg-background text-foreground focus:outline-none"
    >
      {/* Sidebar */}
      <div className="flex w-48 flex-col border-r border-border/50 bg-background p-3 pt-4">
        <div className="flex items-start gap-2 px-2">
          <CloseButton onClick={() => api.close()} />
        </div>

        <div className="px-2 mt-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <GearSix className="h-5 w-5" />
            Settings
          </h1>
        </div>

        <nav className="mt-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePane(id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${activePane === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">
                {label}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {appVersion && (
          <div className="px-2">
            <span className="text-[11px] font-mono text-muted-foreground">
              v{appVersion}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activePane === "providers" && <ProviderQuotas />}
        {activePane === "agent-display" && <AgentDisplayPane />}
        {activePane === "appearance" && <AppearancePane />}
        {activePane === "terminal" && <TerminalPane />}
        {activePane === "integrations" && <IntegrationsPane />}
        {activePane === "controls" && <ControlsPane />}
      </div>
    </div>
  );
}
