import {activityPresentation} from './island-presentation';
import {startNativeAgentActivity,stopNativeAgentActivity,supportsNativeAgentActivity} from './native-agent-activity';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {discoverCodex,parseProcesses,activeIslandRoots} from './codex-processes';
const exec = promisify(execFile);
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {islandLayout,type IslandAnchor,type DisplayNotch} from './island-position';
import {readDisplayNotches} from './display-geometry';
import {app,BrowserWindow,ipcMain,screen} from 'electron';
import {join} from 'node:path';

import {agentSessions as state,agentSessionChanges,publishAgentSessions} from './agent-session-store';
import {listTerminalProcesses} from './pty';
import {getQuotaCards,copyProviderKey,type QuotaCard} from './provider-quotas';
import {installIslandHooks} from './island-hooks';
let window:BrowserWindow|null=null;let timer:ReturnType<typeof setTimeout>|undefined;
let refreshNow:(()=>void)|undefined;
let main:()=>BrowserWindow|null=()=>null;
let anchor:IslandAnchor|null=null;let dragOffset:number|null=null;
let hovering=false;let expanded=false;let generation=0;
let notches:DisplayNotch[]=[];
let geometryRequest=0;
let layout:ReturnType<typeof islandLayout>|undefined;
async function refreshGeometry(){
 const request=++geometryRequest;
 const result=await readDisplayNotches();
 if(request!==geometryRequest)return;
 notches=result;publish();
}

let usages:QuotaCard[]=[];let contentHeight=40;
function resize(value:boolean){
 if(!window||window.isDestroyed())return;
 expanded=value;
 if(value)window.setIgnoreMouseEvents(false);
 layout=islandLayout(screen.getAllDisplays(),screen.getPrimaryDisplay(),notches,anchor,value,contentHeight);
 const {bounds}=layout;
 const old=window.getBounds();if(Object.keys(bounds).some(k=>old[k as keyof typeof old]!==bounds[k as keyof typeof bounds]))window.setBounds(bounds);
}
function publish(){if(!window||window.isDestroyed())return;const snapshot=state.snapshot();resize(dragOffset!==null||hovering);window.webContents.send('island:state',{...snapshot,usages,expanded,layout,presentation:activityPresentation(snapshot.sessions)});}
agentSessionChanges.on('change',publish);
ipcMain.on('island:drag',(event,phase,x,y)=>{
 if(event.sender!==window?.webContents||!window||!Number.isFinite(x)||!Number.isFinite(y))return;
 if(layout?.mode==='notch')return;
 if(phase==='start'){const b=window.getBounds();dragOffset=x-(b.x+b.width/2);return;}
 if(dragOffset===null)return;
 if(phase==='move'||phase==='end'){
  const display=screen.getDisplayNearestPoint({x:Math.round(x),y:Math.round(y)});
  anchor={displayId:display.id,ratio:Math.max(0,Math.min(1,(x-dragOffset-display.bounds.x)/display.bounds.width))};resize(expanded);
 }
 if(phase==='end'){
  dragOffset=null;
  try{const path=join(app.getPath('userData'),'island-position.json');writeFileSync(path+'.tmp',JSON.stringify(anchor),{mode:0o600});renameSync(path+'.tmp',path)}catch{}
  publish();
 }
});
ipcMain.on('island:height',(event,height)=>{if(event.sender!==window?.webContents||!Number.isFinite(height))return;contentHeight=Math.max(40,Math.min(520,Math.ceil(height)));resize(expanded)});
ipcMain.on('island:interactive',(event,value)=>{if(event.sender!==window?.webContents||!window)return;window.setIgnoreMouseEvents(layout?.mode==='notch'&&!expanded&&value===false,{forward:true})});
ipcMain.on('island:expand',(event,value)=>{if(event.sender!==window?.webContents)return;hovering=Boolean(value);publish()});
ipcMain.handle('island:copy-key',(event,id)=>{if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Unauthorized');copyProviderKey(id)});
ipcMain.on('island:refresh',event=>{if(event.sender===window?.webContents)refreshNow?.()});
ipcMain.on('island:close',event=>{if(event.sender===window?.webContents)void configureDynamicIsland(false,main)});
ipcMain.on('island:open',(event,id)=>{if(event.sender!==window?.webContents||typeof id!=='string'||!state.snapshot().sessions.some(s=>s.id===id))return;const win=main();if(!win||win.isDestroyed())return;const session=state.snapshot().sessions.find(s=>s.id===id);if(session?.unread){state.read(id,session.completedAt);publishAgentSessions();}if(win.isMinimized())win.restore();win.show();win.focus();if(!id.startsWith('external:'))win.webContents.send('agent:notification-open',id)});
export async function configureDynamicIsland(enabled:boolean,getMain:()=>BrowserWindow|null){
 main=getMain;
 if(process.platform!=='darwin')return;
 if(!enabled){stopNativeAgentActivity();refreshNow=undefined;generation++;if(timer)clearTimeout(timer);window?.destroy();window=null;hovering=false;dragOffset=null;return;}
 if(window)return;
 const current=++generation;
 if(supportsNativeAgentActivity()){
  installIslandHooks();
  await startNativeAgentActivity();
  if(current!==generation)return;
  startDiscovery(current);return;
 }
 await refreshGeometry();
 if(current!==generation)return;
 try{const saved=JSON.parse(readFileSync(join(app.getPath('userData'),'island-position.json'),'utf8'));if(Number.isFinite(saved.displayId)&&Number.isFinite(saved.ratio))anchor={displayId:saved.displayId,ratio:Math.max(0,Math.min(1,saved.ratio))}}catch{}
 installIslandHooks();
 const root=app.isPackaged?process.resourcesPath:join(app.getAppPath(),'resources');
 const overlay=new BrowserWindow({width:238,height:48,show:false,frame:false,transparent:true,resizable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,roundedCorners:false,focusable:false,webPreferences:{preload:join(root,'dynamic-island/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window=overlay;
 overlay.on('closed',()=>{if(window!==overlay)return;generation++;if(timer)clearTimeout(timer);window=null;refreshNow=undefined;hovering=false;dragOffset=null;});
 // Keep the host app in the Dock when making this overlay visible across Spaces.
 window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
 app.setActivationPolicy('regular');
 await app.dock?.show();
 if(current!==generation||overlay.isDestroyed())return;
 window.setAlwaysOnTop(true,'screen-saver');
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 try { await overlay.loadFile(join(root,'dynamic-island/index.html')); }
 catch(error){if(current===generation){overlay.destroy();throw error;}return;}
 if(current!==generation||overlay.isDestroyed())return;
 publish();overlay.showInactive();
 startDiscovery(current);
}
function startDiscovery(current:number){
 let scanning=false;let shuffleAvatars=false;
 const tick=async()=>{if(scanning||current!==generation)return;scanning=true;if(timer)clearTimeout(timer);try{const [roots, processes, args]=await Promise.all([listTerminalProcesses(),exec('/bin/ps',['-ww','-axo','uid=,pid=,ppid=,state=,comm='],{timeout:1500,maxBuffer:4*1024*1024}),exec('/bin/ps',['-ww','-axo','pid=,args='],{timeout:1500,maxBuffer:8*1024*1024})]);if(current!==generation)return;const agents=discoverCodex(parseProcesses(processes.stdout,process.getuid!(),args.stdout),roots);
 if(agents.length){try{
  const result=await exec('/usr/sbin/lsof',['-a','-p',agents.map(a=>a.pid).join(','),'-d','cwd','-Fn'],{timeout:2000,maxBuffer:1024*1024});
  let pid=0;for(const line of result.stdout.split('\n')){if(line.startsWith('p'))pid=Number(line.slice(1));if(line.startsWith('n')){const agent=agents.find(a=>a.pid===pid);if(agent)agent.cwd=line.slice(1);}}
 }catch{/* Keep the terminal directory if lsof is unavailable. */}}
 if(current!==generation)return;
 state.reconcile(activeIslandRoots(state.snapshot().sessions,roots,agents));publishAgentSessions();if(shuffleAvatars){state.shuffleAvatars();shuffleAvatars=false;}void getQuotaCards().then(value=>{if(current===generation){usages=value;publish()}}).catch(()=>{});publish();}catch{publish()}finally{scanning=false;if(current===generation)timer=setTimeout(tick,1000)}};
 refreshNow=()=>{shuffleAvatars=true;void tick()};
 void tick();
}

app.whenReady().then(()=>{
 const changed=()=>{if(!window)return;hovering=false;dragOffset=null;publish();void refreshGeometry()};
 screen.on('display-metrics-changed',changed);screen.on('display-removed',changed);screen.on('display-added',changed);
});
app.on('before-quit',()=>{stopNativeAgentActivity();generation++;if(timer)clearTimeout(timer);window?.destroy();window=null});
