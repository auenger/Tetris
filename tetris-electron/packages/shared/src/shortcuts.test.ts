import { describe, expect, test } from 'bun:test';
import { SHORTCUT_DEFINITIONS, defaultShortcut, resolveShortcut, shortcutConflict, shortcutKeyError, shortcutPref, shortcutAccelerator } from './shortcuts';
import { matchesTileFullscreenShortcut } from './tile-fullscreen-shortcut';

describe('editable shortcuts', () => {
  test('every default is valid and distinct on both platforms', () => {
    for (const isMac of [true, false]) {
      for (const { action } of SHORTCUT_DEFINITIONS) {
        const binding = defaultShortcut(action, isMac);
        expect(shortcutKeyError(binding)).toBeNull();
        expect(shortcutConflict(action, binding, () => undefined, isMac)).toBeNull();
        expect(matchesTileFullscreenShortcut(binding, resolveShortcut(action, undefined, isMac))).toBe(true);
      }
    }
  });
  test('persisted custom shortcut replaces the old binding, with exact modifiers', () => {
    const custom = {code:'KeyG', meta:true, control:false, alt:false, shift:true};
    const restored = resolveShortcut('focus-file-search', JSON.parse(JSON.stringify(custom)), true);
    expect(matchesTileFullscreenShortcut(custom, restored)).toBe(true);
    expect(matchesTileFullscreenShortcut(defaultShortcut('focus-file-search', true), restored)).toBe(false);
    expect(matchesTileFullscreenShortcut({...custom, shift:false}, restored)).toBe(false);
    expect(resolveShortcut('focus-file-search', null, true)).toEqual(defaultShortcut('focus-file-search', true));
  });
  test('detects custom conflicts and conflicts when resetting to default', () => {
    const find = defaultShortcut('focus-file-search', true);
    expect(shortcutConflict('new-tile', find, () => undefined, true)).toContain('Find');
    const values = {[shortcutPref('new-tile')]:find, [shortcutPref('focus-file-search')]:{...find,code:'KeyG'}};
    expect(shortcutConflict('focus-file-search', find, key => values[key], true)).toContain('New Tile');
    expect(shortcutConflict('focus-file-search', find, () => undefined, true)).toBeNull();
  });
  test('rejects typing, malformed, editing and browser shortcuts', () => {
    const base = defaultShortcut('new-tile', true);
    for (const value of [null, {}, {...base, code:'Escape'}, {...base,meta:false}, {...base,code:'KeyC'}, {...base,code:'KeyR'}, {...base,code:'F12'}]) expect(shortcutKeyError(value)).toBeTruthy();
    expect(resolveShortcut('new-tile', {}, false)).toEqual(defaultShortcut('new-tile', false));
  });
  test('retains fullscreen preference and formats native menu accelerators', () => {
    expect(shortcutPref('toggle-fullscreen-tile')).toBe('tileFullscreenShortcut');
    expect(shortcutAccelerator(defaultShortcut('toggle-window-fullscreen', true), true)).toBe('Ctrl+Command+F');
    expect(shortcutAccelerator(defaultShortcut('toggle-window-fullscreen', false), false)).toBe('F11');
    expect(shortcutAccelerator(defaultShortcut('focus-tile-left', false), false)).toBe('Ctrl+Alt+Left');
  });
});
