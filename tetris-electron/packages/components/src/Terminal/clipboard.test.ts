import { test, expect } from 'bun:test';
import { createTerminalPaste, isTerminalPasteShortcut } from './clipboard';

test('image paste triggers native agent shortcut without text or path injection', async () => {
  const texts: string[] = []; let images = 0;
  const controller = createTerminalPaste({ readClipboard: async () => ({kind:'image'}), pasteText: text => texts.push(text), pasteImage: () => { images++; } });
  await controller.paste();
  expect(images).toBe(1); expect(texts).toEqual([]);
});
test('text is passed intact to terminal paste, including multiple lines', async () => {
  const texts: string[] = [];
  const controller = createTerminalPaste({ readClipboard: async () => ({kind:'text', text:'one\ntwo'}), pasteText: text => texts.push(text), pasteImage: () => { throw new Error('unexpected image'); } });
  await controller.paste(); expect(texts).toEqual(['one\ntwo']);
});
test('a clipboard error does not poison subsequent paste requests', async () => {
  let calls = 0; const texts: string[] = []; let errors = 0;
  const controller = createTerminalPaste({ readClipboard: async () => { if (++calls === 1) throw new Error('unavailable'); return {kind:'text', text:'next'}; }, pasteText: text => texts.push(text), pasteImage() {}, onError() { errors++; } });
  await controller.paste(); await controller.paste(); expect(errors).toBe(1); expect(texts).toEqual(['next']);
});
test('closing a terminal cancels pending clipboard input', async () => {
  let finish!: (v: {kind:'image'}) => void; let inputs = 0;
  const controller = createTerminalPaste({readClipboard: () => new Promise(resolve => {finish = resolve;}), pasteText() {inputs++;}, pasteImage() {inputs++;}});
  const pending = controller.paste(); await Promise.resolve(); controller.dispose(); finish({kind:'image'}); await pending; expect(inputs).toBe(0);
});
test('mac native Ctrl+V remains untouched; Cmd+V and Windows paste are recognized', () => {
  const key = (extra: object) => ({key:'v', metaKey:false, ctrlKey:false, altKey:false, shiftKey:false,...extra} as KeyboardEvent);
  expect(isTerminalPasteShortcut(key({ctrlKey:true}), true)).toBe(false);
  expect(isTerminalPasteShortcut(key({metaKey:true}), true)).toBe(true);
  expect(isTerminalPasteShortcut(key({ctrlKey:true,shiftKey:true}), false)).toBe(true);
  expect(isTerminalPasteShortcut(key({key:'Insert',shiftKey:true}), false)).toBe(true);
  expect(isTerminalPasteShortcut(key({metaKey:true,altKey:true}), true)).toBe(false);
});
