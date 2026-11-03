export function compactDirectory(cwd: string, max = 23): string {
  const clean = cwd.replace(/[\x00-\x1f\x7f]/g, '');
  if (clean.length <= max) return clean;
  return '…' + clean.slice(-(max - 1));
}
export function terminalActivity(text: string): string {
  const lines = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trimEnd().split('\n').slice(-8).join('\n');
  // Codex's visible interrupt footer is evidence of an active turn, not CPU usage.
  if (/esc to interrupt/i.test(lines)) return 'working';
  return '状态未接入';
}
export function pageItems<T>(items: T[], page: number, capacity: number) {
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(current * capacity, (current + 1) * capacity), page: current, pages };
}
