export const TILE_FULLSCREEN_SHORTCUT_PREF = "tileFullscreenShortcut";

export interface TileFullscreenShortcut {
  code: string;
  meta: boolean;
  control: boolean;
  alt: boolean;
  shift: boolean;
}

export function defaultTileFullscreenShortcut(isMac: boolean): TileFullscreenShortcut {
  return { code: "KeyF", meta: isMac, control: !isMac, alt: true, shift: false };
}

const SUPPORTED_CODE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Arrow(Left|Right|Up|Down)|Space|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Comma|Period|Slash|Backslash|Semicolon|Quote|BracketLeft|BracketRight|Backquote|Minus|Equal)$/;
const RESERVED_PRIMARY_CODES = new Set([
  "KeyB", "KeyK", "KeyN", "KeyW", "Comma", "Backslash", "Backquote",
  "KeyL", "KeyR", "BracketLeft", "BracketRight", "Equal", "Minus", "Digit0",
  "KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyY", "KeyQ", "KeyH", "KeyM",
]);

export function isTileFullscreenShortcut(value: unknown): value is TileFullscreenShortcut {
  if (!value || typeof value !== "object") return false;
  const v = value as TileFullscreenShortcut;
  return typeof v.code === "string" && SUPPORTED_CODE.test(v.code)
    && [v.meta, v.control, v.alt, v.shift].every((flag) => typeof flag === "boolean");
}

/** Keep typing keys and existing app/browser/menu commands available. */
export function tileFullscreenShortcutError(shortcut: TileFullscreenShortcut, isMac: boolean): string | null {
  const primary = shortcut.meta || shortcut.control;
  if (!primary && !/^F\d+$/.test(shortcut.code)) {
    return "Use Command or Control with a key, or a function key.";
  }
  if ((primary && RESERVED_PRIMARY_CODES.has(shortcut.code))
    || (primary && shortcut.shift && shortcut.code === "KeyO")
    || (primary && shortcut.alt && shortcut.code.startsWith("Arrow"))
    || (isMac && shortcut.meta && shortcut.control && shortcut.code === "KeyF")
    || (!isMac && shortcut.code === "F11")
    || (shortcut.code === "F12" || (primary && shortcut.shift && shortcut.code === "KeyI"))) {
    return "This shortcut is already used by another app command.";
  }
  return null;
}

export function resolveTileFullscreenShortcut(value: unknown, isMac: boolean): TileFullscreenShortcut {
  return isTileFullscreenShortcut(value) && !tileFullscreenShortcutError(value, isMac)
    ? value : defaultTileFullscreenShortcut(isMac);
}

export function matchesTileFullscreenShortcut(
  input: { code?: string; key?: string; meta?: boolean; control?: boolean; alt?: boolean; shift?: boolean },
  shortcut: TileFullscreenShortcut,
): boolean {
  // Physical codes also work with macOS Option-composed characters and non-Latin layouts.
  const code = input.code || (input.key?.length === 1 && /[a-z]/i.test(input.key)
    ? `Key${input.key.toUpperCase()}` : input.key);
  return code === shortcut.code && !!input.meta === shortcut.meta
    && !!input.control === shortcut.control && !!input.alt === shortcut.alt
    && !!input.shift === shortcut.shift;
}

export function formatTileFullscreenShortcut(shortcut: TileFullscreenShortcut, isMac: boolean): string {
  const keys: string[] = [];
  if (shortcut.control) keys.push(isMac ? "⌃" : "Ctrl");
  if (shortcut.alt) keys.push(isMac ? "⌥" : "Alt");
  if (shortcut.shift) keys.push(isMac ? "⇧" : "Shift");
  if (shortcut.meta) keys.push(isMac ? "⌘" : "Win");
  const labels: Record<string, string> = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
    Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Semicolon: ";",
    Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`", Minus: "-", Equal: "=",
  };
  keys.push(labels[shortcut.code] ?? shortcut.code.replace(/^(Key|Digit)/, ""));
  return keys.join(isMac ? " " : "+");
}
