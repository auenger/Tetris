import {agentSessions,agentSessionChanges,publishAgentSessions} from './agent-session-store';
import {installIslandHooks} from './island-hooks';
import { islandEvents } from './island-events';
import { Notification, ipcMain, type BrowserWindow } from 'electron';
import { registerMethod } from './json-rpc-server';
import { createAgentNotificationState } from './agent-notification-state';
export const agentNotifications = createAgentNotificationState();
export function registerAgentNotifications(mainWindow: () => BrowserWindow | null) {
  if(process.platform!=='win32'){try{installIslandHooks();}catch(error){console.warn('Agent activity hooks unavailable',error);}}
  registerMethod('terminal.island-event', raw => {
    if(!raw||typeof raw!=='object')return {ok:false};
    const params=raw as Record<string,unknown>;
    const sessionId=agentNotifications.resolveRoute(params?.route);
    if(!sessionId || !['UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd'].includes(String(params.event))) return {ok:false};
    const clean=(value:unknown)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').slice(0,1000):'';
    islandEvents.emit('event',{sessionId,event:String(params.event),agent:clean(params.agent)||'Codex',tool:clean(params.tool),cwd:clean(params.cwd),time:typeof params.time==='number' && Math.abs(Date.now()-params.time)<60000 ? params.time : Date.now()});
    return {ok:true};
  });
  agentSessionChanges.on('change',()=>{
    const snapshot=agentSessions.snapshot();
    mainWindow()?.webContents.send('agent:sessions',snapshot);
    const byId=new Map(snapshot.sessions.map(s=>[s.id,s]));
    let changed=false;
    for(const notice of agentNotifications.list()){
      const session=byId.get(notice.sessionId);
      if(!notice.read&&session&&((notice.kind==='attention'&&session.status!=='attention')||(notice.kind==='complete'&&(session.status!=='done'||!session.unread)))){
        agentNotifications.read(notice.sessionId,notice.time);banners.get(notice.sessionId)?.close();banners.delete(notice.sessionId);changed=true;
      }
    }
    if(changed)broadcast();
  });
  ipcMain.on('agent:session-label',(event,id,title)=>{
    if(event.sender!==mainWindow()?.webContents||typeof id!=='string'||typeof title!=='string')return;
    const clean=title.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,200);
    if(agentSessions.setTitle(id,clean))publishAgentSessions();
  });
  ipcMain.handle('agent:sessions',event=>event.sender===mainWindow()?.webContents?agentSessions.snapshot():{sessions:[]});
  const banners = new Map<string, Notification>();
  const broadcast = () => mainWindow()?.webContents.send('agent:notifications', agentNotifications.list());
  ipcMain.handle('agent:notifications', () => agentNotifications.list());
  ipcMain.on('agent:notification-read', (event, target: unknown) => {
    if (event.sender !== mainWindow()?.webContents) return;
    const targets = Array.isArray(target) ? target : [target];
    for (const item of targets) {
      // Keep accepting legacy callers, while new renderers acknowledge a snapshot.
      const sessionId = typeof item === 'string' ? item : item?.sessionId;
      const throughTime = typeof item === 'string' ? Infinity : item?.time;
      if (typeof sessionId !== 'string' || typeof throughTime !== 'number' || Number.isNaN(throughTime)) continue;
      agentSessions.read(sessionId,throughTime);
      if (!agentNotifications.read(sessionId, throughTime)) continue;
      banners.get(sessionId)?.close();
      banners.delete(sessionId);
    }
    publishAgentSessions();
    broadcast();
  });
  registerMethod('terminal.notify', params => {
    if (agentNotifications.beginTurn(params,sessionId=>{
      islandEvents.emit('event',{sessionId,event:'UserPromptSubmit',agent:'Claude Code',time:Date.now()});
    })) return {ok:true};
    const notice = agentNotifications.receive(params);
    if (!notice) return { ok: false };
    islandEvents.emit('event',{sessionId:notice.sessionId,agent:notice.title,event:notice.kind==='complete'?'Stop':'PermissionRequest',tool:notice.kind==='attention'?notice.body:undefined,time:notice.time});
    banners.get(notice.sessionId)?.close();
    banners.delete(notice.sessionId);
    broadcast();
    if(notice.read)return {ok:true};
    const win = mainWindow();
    // Foreground uses the canvas notification list; background also gets a native banner.
    if (win && !win.isFocused() && Notification.isSupported()) {
      try {
        const banner = new Notification({ title: notice.title, body: notice.body });
        banners.set(notice.sessionId, banner);
        banner.on('click', () => {
          agentNotifications.read(notice.sessionId, notice.time);
          agentSessions.read(notice.sessionId,notice.time);publishAgentSessions();
          broadcast();
          const current = mainWindow();
          if (!current || current.isDestroyed()) return;
          if (current.isMinimized()) current.restore();
          current.show(); current.focus();
          current.webContents.send('agent:notification-open', notice.sessionId);
        });
        banner.on('close', () => { if (banners.get(notice.sessionId) === banner) banners.delete(notice.sessionId); });
        banner.on('failed', () => { if (banners.get(notice.sessionId) === banner) banners.delete(notice.sessionId); });
        banner.show();
      } catch { /* The in-app unread notice remains available. */ }
    }
    return { ok: true };
  }, { description: 'Receive a terminal-scoped coding agent completion or attention hook' });
}
