import { defaultTileFullscreenShortcut, isTileFullscreenShortcut, matchesTileFullscreenShortcut, type TileFullscreenShortcut } from './tile-fullscreen-shortcut';

export type Shortcut = TileFullscreenShortcut;
export const SHORTCUT_DEFINITIONS = [
  { action: 'toggle-fullscreen-tile', label: 'Toggle Tile Full Screen', code: 'KeyF', alt: true },
  { action: 'toggle-settings', label: 'Settings', code: 'Comma' },
  { action: 'focus-file-search', label: 'Find', code: 'KeyK' },
  { action: 'sidebar-files', label: 'Toggle Navigator', code: 'KeyB' },
  { action: 'sidebar-tiles', label: 'Toggle Terminal List', code: 'Backquote' },
  { action: 'toggle-agent', label: 'Toggle Agent', code: 'KeyB', alt: true },
  { action: 'add-workspace', label: 'Open Workspace', code: 'KeyO', shift: true },
  { action: 'new-tile', label: 'New Tile', code: 'KeyN' },
  { action: 'close-tile', label: 'Close Tile', code: 'KeyW' },
  { action: 'zoom-in', label: 'Zoom In', code: 'Equal' },
  { action: 'zoom-out', label: 'Zoom Out', code: 'Minus' },
  { action: 'zoom-reset', label: 'Actual Size', code: 'Digit0' },
  { action: 'toggle-window-fullscreen', label: 'Toggle Window Full Screen', code: 'KeyF' },
  { action: 'focus-tile-left', label: 'Focus Tile Left', code: 'ArrowLeft', alt: true },
  { action: 'focus-tile-right', label: 'Focus Tile Right', code: 'ArrowRight', alt: true },
  { action: 'focus-tile-up', label: 'Focus Tile Up', code: 'ArrowUp', alt: true },
  { action: 'focus-tile-down', label: 'Focus Tile Down', code: 'ArrowDown', alt: true },
] as const;
export type ShortcutAction = typeof SHORTCUT_DEFINITIONS[number]['action'];
export function shortcutPref(action: ShortcutAction): string {
  return action === 'toggle-fullscreen-tile' ? 'tileFullscreenShortcut' : `shortcut:${action}`;
}
export function defaultShortcut(action: ShortcutAction, isMac: boolean): Shortcut {
  if (action === 'toggle-fullscreen-tile') return defaultTileFullscreenShortcut(isMac);
  if (action === 'toggle-window-fullscreen') return { code: isMac ? 'KeyF' : 'F11', meta: isMac, control: isMac, alt: false, shift: false };
  const definition = SHORTCUT_DEFINITIONS.find(d => d.action === action)!;
  return { code: definition.code, meta: isMac, control: !isMac, alt: 'alt' in definition, shift: 'shift' in definition };
}
const RESERVED = new Set(['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyQ', 'KeyH', 'KeyM', 'KeyL', 'KeyR', 'BracketLeft', 'BracketRight']);
export function shortcutKeyError(value: unknown): string | null {
  if (!isTileFullscreenShortcut(value)) return 'Choose a letter, number, function key, or navigation key.';
  if (!value.meta && !value.control && !/^F\d+$/.test(value.code)) return 'Use Command or Control with a key, or a function key.';
  if (((value.meta || value.control) && !value.alt && RESERVED.has(value.code)) || value.code === 'F12' || ((value.meta || value.control) && value.shift && value.code === 'KeyI')) return 'This shortcut is reserved by an editing, browser, or system command.';
  return null;
}
export function resolveShortcut(action: ShortcutAction, value: unknown, isMac: boolean): Shortcut {
  return isTileFullscreenShortcut(value) && !shortcutKeyError(value) ? value : defaultShortcut(action, isMac);
}
export function shortcutConflict(action: ShortcutAction, shortcut: Shortcut, getValue: (key: string) => unknown, isMac: boolean): string | null {
  for (const other of SHORTCUT_DEFINITIONS) {
    if (other.action !== action && matchesTileFullscreenShortcut(shortcut, resolveShortcut(other.action, getValue(shortcutPref(other.action)), isMac))) return `Already used by ${other.label}.`;
  }
  return null;
}
export function shortcutAccelerator(shortcut: Shortcut, isMac: boolean): string {
  const names: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' };
  return [...(shortcut.control ? ['Ctrl'] : []), ...(shortcut.alt ? ['Alt'] : []), ...(shortcut.shift ? ['Shift'] : []), ...(shortcut.meta ? [isMac ? 'Command' : 'Super'] : []), names[shortcut.code] ?? shortcut.code.replace(/^(Key|Digit)/, '')].join('+');
}
