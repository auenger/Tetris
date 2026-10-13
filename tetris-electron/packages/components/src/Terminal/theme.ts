import type { ITheme } from "@xterm/xterm";

export const darkTheme: ITheme = {
  background: "#080808",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

export const lightTheme: ITheme = {
  background: "#f8f8f8",
  foreground: "#383a42",
  cursor: "#383a42",
  cursorAccent: "#ffffff",
  selectionBackground: "#add6ff",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#fafafa",
  brightBlack: "#4f525e",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

export type TerminalAppearance = {
  mode: "auto" | "light" | "dark";
  light: "default" | "paper";
  dark: "default" | "midnight";
};
export const TERMINAL_APPEARANCE_PREF = "terminalAppearance";
export function normalizeTerminalAppearance(value: unknown): TerminalAppearance {
  const v = (value && typeof value === "object" ? value : {}) as Partial<TerminalAppearance>;
  return { mode: v.mode === "light" || v.mode === "dark" ? v.mode : "auto",
    light: v.light === "paper" ? "paper" : "default",
    dark: v.dark === "midnight" ? "midnight" : "default" };
}
export function resolveTerminalTheme(value: unknown, prefersDark: boolean): ITheme {
  const pref = normalizeTerminalAppearance(value);
  const dark = pref.mode === "auto" ? prefersDark : pref.mode === "dark";
  if (dark) return pref.dark === "midnight" ? { ...darkTheme,
    background: "#18202e", foreground: "#d8e2f0", cursor: "#d8e2f0",
    selectionBackground: "#354863", blue: "#80aaff", cyan: "#70d4cf",
    green: "#9ccf91", yellow: "#e5c384", red: "#ee8790" } : { ...darkTheme };
  return pref.light === "paper" ? { ...lightTheme,
    background: "#f5f0e6", foreground: "#403c36", cursor: "#403c36",
    cursorAccent: "#f5f0e6", selectionBackground: "#d4ddce",
    blue: "#376c9e", green: "#427347", red: "#b23e3e" } : { ...lightTheme };
}
export function getTheme(): ITheme {
  return resolveTerminalTheme(undefined, window.matchMedia("(prefers-color-scheme: dark)").matches);
}

interface ThemeApi {
  getPref?: (key: string) => Promise<unknown>;
  onPrefChanged?: (cb: (key: string, value: unknown) => void) => () => void;
}
// One subscription per mounted terminal. Preferences change colors only, never PTYs.
export function bindTerminalTheme(term: { options: { theme?: ITheme } }, container: HTMLElement, api: ThemeApi) {
  let disposed = false;
  let revision = 0;
  let value: unknown;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    if (disposed) return;
    const theme = resolveTerminalTheme(value, media.matches);
    term.options.theme = theme;
    container.style.backgroundColor = theme.background!;
    container.style.colorScheme = (normalizeTerminalAppearance(value).mode === "auto" ? media.matches : normalizeTerminalAppearance(value).mode === "dark") ? "dark" : "light";
  };
  const off = api.onPrefChanged?.((key, next) => {
    if (key !== TERMINAL_APPEARANCE_PREF) return;
    revision++;
    value = next;
    apply();
  });
  media.addEventListener("change", apply);
  apply();
  const initialRevision = revision;
  const ready = (api.getPref?.(TERMINAL_APPEARANCE_PREF) ?? Promise.resolve(undefined))
    .then(next => { if (revision === initialRevision) { value = next; apply(); } }).catch(() => {});
  return { ready, dispose() { disposed = true; off?.(); media.removeEventListener("change", apply); } };
}
