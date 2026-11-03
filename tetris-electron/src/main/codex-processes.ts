export interface ProcessRow { pid: number; ppid: number; executable: string; args: string; state?: string }
export interface TerminalProcess { pid: number; sessionId: string; displayName: string; cwdHostPath: string }
export interface CodexProcess { pid: number; sessionId?: string; name: string; cwd?: string; activity?: string }

export function parseProcesses(output: string, uid: number, argumentsOutput = ''): ProcessRow[] {
  const args = new Map(argumentsOutput.split('\n').map(line => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    return match ? [Number(match[1]), match[2]] : [0, ''];
  }) as [number, string][]);
  return output.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    return match && Number(match[1]) === uid
      ? [{ pid: Number(match[2]), ppid: Number(match[3]), ...parseExecutable(match[4]), args: args.get(Number(match[2])) || '' }] : [];
  });
}

function parseExecutable(value: string) {
  const match = value.match(/^([RSDTtZIXUWNOLs+<ENl-]+)\s+(.+)$/);
  return match ? { state: match[1], executable: match[2].trim() } : { executable: value.trim() };
}

export function discoverCodex(rows: ProcessRow[], terminals: TerminalProcess[]): CodexProcess[] {
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const candidates = rows.filter(row => !/[TtZ]/.test(row.state || '') && /(?:^|\/)codex$/.test(row.executable)
    && !/\.app\/Contents\//i.test(row.executable)
    && !/\b(?:app-server|mcp-server)\b/.test(row.args));
  const candidateIds = new Set(candidates.map(row => row.pid));
  return candidates.flatMap(row => {
    const ancestors = new Set<number>();
    let current: ProcessRow | undefined = row;
    while (current && !ancestors.has(current.pid)) {
      ancestors.add(current.pid);
      current = byPid.get(current.ppid);
    }
    // A CLI wrapper and its native executable represent one session.
    if ([...ancestors].some(pid => pid !== row.pid && candidateIds.has(pid))) return [];
    const terminal = terminals.find(item => ancestors.has(item.pid));
    return [{ pid: row.pid, sessionId: terminal?.sessionId,
      cwd: terminal?.cwdHostPath,
      name: terminal?.cwdHostPath.split('/').filter(Boolean).pop() || `外部 CLI · ${row.pid}` }];
  });
}

// Codex cards must be backed by a live CLI, not merely a surviving terminal.
// Other providers are hook-driven and retain their cards while their terminal lives.
export function activeIslandRoots(
  sessions: {id: string; agent: string; cwd: string}[],
  terminals: TerminalProcess[],
  agents: CodexProcess[],
) {
  const roots = new Map(terminals.map(root => [root.sessionId, root]));
  const known = sessions.filter(session => session.agent !== 'Codex'
    && !session.id.startsWith('external:') && roots.has(session.id))
    .map(session => ({sessionId: session.id, cwdHostPath: roots.get(session.id)!.cwdHostPath || session.cwd}));
  return [...known, ...agents.map(agent => ({sessionId: agent.sessionId || `external:${agent.pid}`,
    cwdHostPath: agent.cwd || '', name: agent.name}))];
}
