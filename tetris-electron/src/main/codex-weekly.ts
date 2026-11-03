import { readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
export function weeklyRemaining(record: any, now = Date.now()): number | null {
  const time = Date.parse(record?.timestamp);
  if (!Number.isFinite(time) || now - time > 3600000 || time > now + 60000) return null;
  const rates = record?.payload?.rate_limits;
  if (rates?.limit_id && rates.limit_id !== 'codex') return null;
  for (const window of [rates?.primary, rates?.secondary]) {
    if (window?.window_minutes !== 10080 || typeof window.used_percent !== 'number' ||
        !Number.isFinite(window.used_percent) || window.used_percent < 0 || window.used_percent > 100 ||
        typeof window.resets_at !== 'number' || window.resets_at * 1000 <= now) continue;
    return Math.round(100 - window.used_percent);
  }
  return null;
}
let cached = 'Weekly —';
let nextRead = 0;
/** Latest local Codex usage snapshot, never an authenticated network request. */
export async function readWeeklyQuota(): Promise<string> {
  if (Date.now() < nextRead) return cached;
  nextRead = Date.now() + 60000;
  const root = process.env.CODEX_HOME || join(homedir(), '.codex');
  const files: {path:string; time:number}[] = [];
  for (let day = 0; day < 3; day++) {
    const date = new Date(Date.now() - day * 86400000);
    const dir = join(root, 'sessions', String(date.getFullYear()), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0'));
    for (const name of await readdir(dir).catch(() => [])) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(dir,name); const info = await stat(path).catch(() => null);
      if (info) files.push({path,time:info.mtimeMs});
    }
  }
  let newest = 0; let remaining: number | null = null;
  for (const file of files.sort((a,b) => b.time-a.time).slice(0,8)) {
    try {
      const handle = await open(file.path,'r');
      try {
        const size = (await handle.stat()).size;
        const buffer = Buffer.alloc(Math.min(size,1024*1024));
        await handle.read(buffer,0,buffer.length,Math.max(0,size-buffer.length));
        for (const line of buffer.toString().split('\n')) {
          try {
            const record = JSON.parse(line); const value = weeklyRemaining(record);
            if (value !== null && Date.parse(record.timestamp) > newest) {newest = Date.parse(record.timestamp); remaining = value;}
          } catch {}
        }
      } finally { await handle.close(); }
    } catch {}
  }
  cached = remaining === null ? 'Weekly —' : `Weekly ≈${remaining}%`;
  return cached;
}
