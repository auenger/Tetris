export const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

// A global Codex hook also runs outside Tetris terminals. Check routing before
// launching the Node/Electron host, not after loading the hook JavaScript.
const ROUTE_GUARD = 'if [ -n "${COLLAB_NOTIFY_ROUTE:-}" ] && [ -n "${COLLAB_NOTIFY_SOCKET_FILE:-}" ]; then exec "$@"; fi';

export function routedHookArgv(executable: string, script: string, args: string[] = []): string[] {
  // Codex appends its JSON payload to this argv. The shell receives it through
  // "$@" unchanged; payload text is never part of the shell program.
  return ['/bin/sh', '-c', ROUTE_GUARD, 'tetris-agent-hook', '/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', executable, script, ...args];
}

const ISLAND_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);

/** Upgrade only exact commands this installation generated, without I/O. */
export function islandHookConfig(source: unknown, executable: string, script: string, previousExecutables: string[] = []): RecordValue {
  if (!record(source)) throw new Error('Codex hooks.json 格式无效');
  const data = structuredClone(source);
  data.hooks ??= {};
  if (!record(data.hooks)) throw new Error('Codex hooks.json hooks 格式无效');
  const command = routedHookArgv(executable, script).map(shellQuote).join(' ');
  const owned = new Set([executable, ...previousExecutables].flatMap(runtime => [
    ['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', runtime, script].map(shellQuote).join(' '),
    routedHookArgv(runtime, script).map(shellQuote).join(' '),
  ]));
  for (const event of ISLAND_EVENTS) {
    const groups = data.hooks[event] ?? [];
    if (!Array.isArray(groups)) throw new Error('Codex hook 事件格式无效');
    let kept = false;
    const updated = groups.flatMap(group => {
      if (!record(group) || !Array.isArray(group.hooks)) return [group];
      let removed = false;
      const hooks = group.hooks.flatMap(hook => {
        if (!record(hook) || hook.type !== 'command' || typeof hook.command !== 'string' || !owned.has(hook.command)) return [hook];
        if (kept) { removed = true; return []; }
        kept = true; return [{ ...hook, command }];
      });
      // Remove an emptied generated wrapper only. A user's matcher or custom
      // group metadata remains intact even when its duplicate hook is removed.
      if (removed && !hooks.length && Object.keys(group).every(key => key === 'hooks')) return [];
      return [{ ...group, hooks }];
    });
    if (!kept) updated.push({ hooks: [{ type: 'command', command, timeout: 2, async: true }] });
    data.hooks[event] = updated;
  }
  return data;
}
