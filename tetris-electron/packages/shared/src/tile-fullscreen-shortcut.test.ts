import { describe, expect, test } from "bun:test";
import {
  defaultTileFullscreenShortcut,
  formatTileFullscreenShortcut,
  isTileFullscreenShortcut,
  matchesTileFullscreenShortcut,
  resolveTileFullscreenShortcut,
  tileFullscreenShortcutError,
} from "./tile-fullscreen-shortcut";

describe("tile fullscreen shortcut", () => {
  test("keeps the existing platform defaults", () => {
    expect(formatTileFullscreenShortcut(defaultTileFullscreenShortcut(true), true)).toBe("⌥ ⌘ F");
    expect(formatTileFullscreenShortcut(defaultTileFullscreenShortcut(false), false)).toBe("Ctrl+Alt+F");
  });

  test("matches physical keys even when Option produces a different character", () => {
    expect(matchesTileFullscreenShortcut({
      code: "KeyF", key: "ƒ", meta: true, alt: true,
    }, defaultTileFullscreenShortcut(true))).toBe(true);
    expect(matchesTileFullscreenShortcut({
      key: "F", control: true, alt: true,
    }, defaultTileFullscreenShortcut(false))).toBe(true);
  });

  test("a configured binding replaces the default and requires exact modifiers", () => {
    const custom = { code: "KeyG", meta: true, alt: false, control: false, shift: true };
    const saved = resolveTileFullscreenShortcut(JSON.parse(JSON.stringify(custom)), true);
    expect(saved).toEqual(custom);
    expect(matchesTileFullscreenShortcut({ code: "KeyG", meta: true, shift: true }, saved)).toBe(true);
    expect(matchesTileFullscreenShortcut({ code: "KeyF", meta: true, alt: true }, saved)).toBe(false);
    expect(matchesTileFullscreenShortcut({ code: "KeyG", meta: true }, saved)).toBe(false);
    expect(matchesTileFullscreenShortcut({ code: "KeyG", meta: true, shift: true, alt: true }, saved)).toBe(false);
  });

  test("unset, reset, malformed and conflicting saved values fall back to the default", () => {
    const fallback = defaultTileFullscreenShortcut(false);
    for (const value of [null, undefined, "Ctrl+F", {}, { ...fallback, alt: "true" },
      { ...fallback, code: "Unknown" }, { ...fallback, code: "KeyW" }]) {
      expect(resolveTileFullscreenShortcut(value, false)).toEqual(fallback);
    }
    expect(isTileFullscreenShortcut({ ...fallback, code: "F9" })).toBe(true);
  });

  test("rejects typing keys and collisions with app, browser and window shortcuts", () => {
    const base = defaultTileFullscreenShortcut(true);
    expect(tileFullscreenShortcutError({ ...base, meta: false }, true)).toBeTruthy();
    for (const code of ["KeyW", "KeyK", "KeyL", "ArrowLeft", "Equal", "KeyC"]) {
      expect(tileFullscreenShortcutError({ ...base, code }, true)).toBeTruthy();
    }
    expect(tileFullscreenShortcutError({ ...base, control: true, alt: false }, true)).toBeTruthy();
    expect(tileFullscreenShortcutError({ ...base, code: "F11", meta: false, alt: false }, false)).toBeTruthy();
    expect(tileFullscreenShortcutError({ ...base, code: "F9", meta: false, alt: false }, false)).toBeNull();
    expect(tileFullscreenShortcutError({ ...base, alt: false, shift: true }, true)).toBeNull();
  });
});
