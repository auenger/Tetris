import { test, expect } from 'bun:test';
import { parseRoute } from './task-router';
test('router validates actions and existing task identity before dispatch', () => {
  expect(parseRoute('{"action":"continue","taskId":"known","reason":"补充"}', ['known']).action).toBe('continue');
  expect(() => parseRoute('{"action":"stop","taskId":"other","reason":"停止"}', ['known'])).toThrow('unknown task');
  expect(() => parseRoute('{"action":"shell","reason":"execute"}', [])).toThrow('invalid decision');
  expect(parseRoute('```json\n{"action":"clarify","reason":"哪一个任务？"}\n```', []).action).toBe('clarify');
});
