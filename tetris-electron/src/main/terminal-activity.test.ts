import { test, expect } from 'bun:test';
import { terminalActivity } from './terminal-activity';
test('working requires a visible interrupt footer; old transcript is not active state', () => {
  expect(terminalActivity('• Working (2s • esc to interrupt)')).toBe('working');
  expect(terminalActivity('esc to interrupt\n' + 'ordinary output\n'.repeat(12))).toBe('状态未接入');
  expect(terminalActivity('› Enter a prompt')).toBe('状态未接入');
});
