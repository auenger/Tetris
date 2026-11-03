import { test, expect } from 'bun:test';
import { compactDirectory, terminalActivity, pageItems } from './codex-touch-bar-layout';
test('tiles fit before a pager is needed, and pages clamp after exits', () => {
  expect(pageItems([1,2,3,4],0,4)).toEqual({items:[1,2,3,4],page:0,pages:1});
  expect(pageItems([1,2,3,4,5],1,4)).toEqual({items:[5],page:1,pages:2});
  expect(pageItems([1],3,4).page).toBe(0);
});
test('working requires a visible interrupt footer; old transcript is not active state', () => {
  expect(terminalActivity('• Working (2s • esc to interrupt)')).toBe('working');
  expect(terminalActivity('esc to interrupt\n' + 'ordinary output\n'.repeat(12))).toBe('状态未接入');
  expect(terminalActivity('› Enter a prompt')).toBe('状态未接入');
});
test('directory labels retain path suffix within the budget', () => {
  expect(compactDirectory('/Users/ryan/mycode/collab',15)).toBe('…/mycode/collab');
  expect(compactDirectory('/tmp')).toBe('/tmp');
});
