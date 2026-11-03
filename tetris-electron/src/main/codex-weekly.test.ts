import {test,expect} from 'bun:test';
import {weeklyRemaining} from './codex-weekly';
const now = Date.now();
const record = (window: object, key = 'primary') => ({timestamp:new Date(now).toISOString(),payload:{rate_limits:{limit_id:'codex',[key]:window}}});
const window = {window_minutes:10080,used_percent:22,resets_at:Math.floor(now/1000)+1000};
test('weekly can be primary or secondary',()=>{
 expect(weeklyRemaining(record(window),now)).toBe(78);
 expect(weeklyRemaining(record(window,'secondary'),now)).toBe(78);
});
test('rejects stale, expired, malformed and nonweekly snapshots',()=>{
 expect(weeklyRemaining(record(window),now+3600001)).toBeNull();
 expect(weeklyRemaining(record({...window,resets_at:0}),now)).toBeNull();
 expect(weeklyRemaining(record({...window,window_minutes:300}),now)).toBeNull();
 expect(weeklyRemaining(record({...window,used_percent:NaN}),now)).toBeNull();
});
