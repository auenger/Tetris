export function terminalActivity(text: string): string {
  const lines = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trimEnd().split('\n').slice(-8).join('\n');
  // Codex's visible interrupt footer is evidence of an active turn, not CPU usage.
  if (/esc to interrupt/i.test(lines)) return 'working';
  return '状态未接入';
}
