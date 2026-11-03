import {agentSessions, agentSessionChanges, publishAgentSessions} from './agent-session-store';
import {installIslandHooks} from './island-hooks';
import { join, basename } from 'node:path';
import { readWeeklyQuota } from './codex-weekly';
import { updateResidentTouchBar, setTouchBarForeground, setTouchBarRefresh } from './codex-touch-bar-resident';
import { app, nativeImage, TouchBar, type BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverCodex, parseProcesses, activeIslandRoots, type CodexProcess } from './codex-processes';
import { listTerminalProcesses } from './pty';
import { compactDirectory, pageItems } from './codex-touch-bar-layout';
const exec = promisify(execFile);
let touchBarEnabled = true;
export function enableWindowTouchBar(value:boolean) { touchBarEnabled=value; }

export function attachCodexTouchBar(window: BrowserWindow) {
  if (process.platform !== 'darwin') return;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let agents: (CodexProcess & {provider?: string})[] = [];
  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(),'resources');
  const providerIcons = new Map<string, ReturnType<typeof nativeImage.createEmpty>[]>();
  const iconFor = (provider: string | undefined, frame: number) => {
    const sprite = provider === 'Claude Code' ? 'claude-code' : 'codex';
    if (!providerIcons.has(sprite)) {
      const sheet = nativeImage.createFromPath(join(root, `dynamic-island/avatars/${sprite}.png`));
      const {width, height} = sheet.getSize();
      const cellWidth = Math.floor(width / 3);
      providerIcons.set(sprite, [0,1,2].map(index => sheet.isEmpty() ? nativeImage.createEmpty()
        : sheet.crop({x:index*cellWidth,y:0,width:cellWidth,height}).resize({width:28,height:28})));
    }
    return providerIcons.get(sprite)![frame];
  };
  const avatar = (activity?: string) => activity === 'done' ? 2 : activity === 'working' || activity === 'attention' ? 1 : 0;
  installIslandHooks();
  const identifiers = new Map<string, number>();
  let nextIdentifier = 1;
  const refreshSessions = () => {
    agents = agentSessions.snapshot().sessions.map(session => {
      if (!identifiers.has(session.id)) identifiers.set(session.id, nextIdentifier++);
      return {pid:identifiers.get(session.id)!, sessionId:session.id, name:session.taskTitle || session.title, cwd:session.cwd, activity:session.status, provider:session.agent};
    });
    render();
  };
  let page = 0;
  let weekly = 'Weekly —';
  const focus = (pid?: number) => {
    const agent = agents.find(item => item.pid === pid) || agents[0];
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
    if (agent?.sessionId && !agent.sessionId.startsWith('external:')) window.webContents.send('agent:notification-open', agent.sessionId);
  };
  window.on('focus', () => setTouchBarForeground(true));
  window.on('blur', () => setTouchBarForeground(false));
  const title = (agent: CodexProcess, max = 18) => `${compactDirectory(agent.name || basename(agent.cwd || '') || '/', max)}`;
  const render = () => {
    const slice = pageItems(agents, page, 4); page = slice.page;
    const items: InstanceType<typeof TouchBar.TouchBarButton>[] = slice.items.map(agent => new TouchBar.TouchBarButton({
      label: `${title(agent)}  ${agent.activity === 'working' ? '◌' : agent.activity === 'done' ? '✓' : agent.activity === 'attention' ? '!' : '·'}`, icon:iconFor(agent.provider, avatar(agent.activity)), backgroundColor: '#1A1A1A',
      click: () => focus(agent.pid),
    }));
    if (slice.pages > 1) items.push(new TouchBar.TouchBarButton({ label: `${page + 1}/${slice.pages} ›`, click: () => { page = (page + 1) % slice.pages; render(); } }));
    if (!items.length) items.push(new TouchBar.TouchBarButton({ label: '暂无 Agent' }));
    items.push(new TouchBar.TouchBarButton({ label: '↻', accessibilityLabel: '刷新 Agent 状态', click: () => { void scan(); } }));
    window.setTouchBar(touchBarEnabled ? new TouchBar({items}) : null);
    updateResidentTouchBar(`Agent ${agents.length}`, focus, agents.map(agent => ({pid:agent.pid, title:title(agent, 20), activity:agent.activity, avatar:avatar(agent.activity), provider:agent.provider})), weekly);
  };
  let scanning = false;
  const scan = async () => {
    if (stopped || scanning) return;
    scanning = true;
    if (timer) clearTimeout(timer);
    try {
      const [processes, args, terminals] = await Promise.all([
        exec('/bin/ps', ['-ww', '-axo', 'uid=,pid=,ppid=,state=,comm='], {timeout:1500,maxBuffer:4*1024*1024}),
        exec('/bin/ps', ['-ww', '-axo', 'pid=,args='], {timeout:1500,maxBuffer:8*1024*1024}),
        listTerminalProcesses(),
      ]);
      const discovered = discoverCodex(parseProcesses(processes.stdout, process.getuid!(), args.stdout), terminals);
      // lsof reads actual process working directories, including external terminals.
      if (discovered.length) {
        try {
          const result = await exec('/usr/sbin/lsof', ['-a','-p',discovered.map(a => a.pid).join(','),'-d','cwd','-Fn'], {timeout:2000,maxBuffer:1024*1024});
          let pid = 0;
          for (const line of result.stdout.split('\n')) {
            if (line.startsWith('p')) pid = Number(line.slice(1));
            if (line.startsWith('n')) { const agent = discovered.find(a => a.pid === pid); if (agent) agent.cwd = line.slice(1); }
          }
        } catch { /* Keep the terminal's known working directory. */ }
      }
      if (stopped) return;
      agentSessions.reconcile(activeIslandRoots(agentSessions.snapshot().sessions, terminals, discovered));
      publishAgentSessions();
      weekly = await readWeeklyQuota();
      if (!stopped) render();
    } catch {
      if (!stopped) {
        window.setTouchBar(touchBarEnabled ? new TouchBar({items:[new TouchBar.TouchBarLabel({label:'Agent · 扫描失败，等待重试'})]}) : null);
        updateResidentTouchBar('Agent · 扫描失败', focus);
      }
    } finally { scanning = false; if (!stopped) timer = setTimeout(scan, 2000); }
  };
  agentSessionChanges.on('change', refreshSessions);
  window.once('closed', () => { stopped = true; agentSessionChanges.off('change', refreshSessions); setTouchBarRefresh(undefined); if (timer) clearTimeout(timer); setTouchBarForeground(false); });
  setTouchBarRefresh(() => { void scan(); });
  void scan();
}
