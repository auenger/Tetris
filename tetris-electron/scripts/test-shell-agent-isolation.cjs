// Production shell renderer + production preload, isolated native Electron window.
// Build: node scripts/run-local-bin.mjs electron-vite build --config scripts/tests/shell-isolation.config.mjs --ignoreConfigWarning
// Run: ./node_modules/.bin/electron scripts/test-shell-agent-isolation.cjs
// All main-side services below are memory-only. No real agent, PTY or user state is used.
const {app,BrowserWindow,ipcMain,webContents} = require('electron');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'tetris-shell-isolation-'));
app.setPath('userData',path.join(sandbox,'profile'));
const buildRoot=path.join(os.tmpdir(),'tetris-shell-isolation-build');
const origin=process.env.TETRIS_RENDERER_URL || require('node:url').pathToFileURL(path.join(buildRoot,'renderer')).href;
const preload=process.env.TETRIS_SHELL_PRELOAD || path.join(buildRoot,'preload/shell.js');
const guestPreload=path.join(sandbox,'guest.cjs');fs.writeFileSync(guestPreload,"const{ipcRenderer}=require('electron');window.addEventListener('DOMContentLoaded',()=>{if(location.pathname.includes('agentChat'))ipcRenderer.sendToHost('supervisor:ready');});");
const configs={};for(const name of ['nav','viewer','terminal','terminalTile','graphTile','settings','tileList','agentChat']){const file=path.join(sandbox,name+'.html');fs.writeFileSync(file,`<!doctype html><title>${name}</title><body>${name}</body>`);configs[name]={src:'file://'+file,preload:guestPreload};}
const workerScroll=process.argv.includes('--worker-scroll'),supervisorStub={...configs.agentChat};
if(workerScroll)configs.agentChat={src:process.env.TETRIS_WORKER_URL || origin+'/agent-chat/index.html',preload:process.env.TETRIS_WORKER_PRELOAD || path.join(path.dirname(preload),'universal.js')};
const prefs={'sidebar-mode':'closed','sidebar-mode-agent':'open','sidebar-agent-gui':false,'agent-pty-session':'legacy-pty','panel-width-agent':400};
const states={'ide:default':{version:1,tiles:[{id:'ide-fixture',type:'note',filePath:'/fixture/ide.md',x:40,y:60,width:420,height:400,zIndex:1}],groups:[],viewport:{centerX:500,centerY:380,zoom:.8}},'agent:live':null};
const writes=[],responses=new Map(),checks={};let confirms=0,ptyKills=0,nextRequest=0;
const handlers={
 'shell:get-view-config':()=>configs,'workspace:list':()=>({workspaces:['/fixture/project']}),'pref:get':(_,key)=>prefs[key],
 'pref:set':(_,key,value)=>{prefs[key]=value;writes.push({key,value})},'shell:get-in-process-terminals':()=>false,
 'canvas:load-state':(_,id='ide:default')=>structuredClone(states[id]),'canvas:save-state':(_,state,id='ide:default')=>{states[id]=structuredClone(state)},
 'agent:sessions':()=>[],'agent:notifications':()=>[],'supervisor:notifications':()=>[],'pty:discover':()=>[],
 'agent:permissions':()=>[],'agent:tasks':()=>[{id:'task-fixture',sessionId:'worker-fixture',provider:'claude',cwd:'/fixture/project',runs:[{id:'run-fixture',status:'ready_for_review',output:Array.from({length:120},(_,n)=>`第 ${n} 条执行记录：已检查项目内容。`).join('\n\n')}]}],
 'integrations:has-offered-plugin':()=>true,'integrations:get-agents':()=>[],'update:getStatus':()=>({status:'idle'}),
 'dialog:confirm':()=>{confirms++;return 1},'pty:kill':()=>{ptyKills++},'outreach:schedule':()=>{},
};
for(const[channel,fn]of Object.entries(handlers))ipcMain.handle(channel,fn);
ipcMain.on('get-home-path',event=>event.returnValue='/fixture');
ipcMain.on('canvas:rpc-response',(_,response)=>{const settle=responses.get(response.requestId);if(settle){responses.delete(response.requestId);response.error?settle.reject(Error(response.error.message)):settle.resolve(response.result)}});
function rpc(window,method,params={}){return new Promise((resolve,reject)=>{const requestId='fixture-'+(++nextRequest);responses.set(requestId,{resolve,reject});window.webContents.send('canvas:rpc-request',{requestId,method,params});setTimeout(()=>{if(responses.delete(requestId))reject(Error('RPC timeout: '+method))},5000)})}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let n=0;n<80;n++){if(await fn())return;await delay(100)}throw Error('Timed out: '+label)}
async function click(window,selector){
 const rect=await window.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing navigation control');const r=el.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(el).visibility==='hidden'||getComputedStyle(el).display==='none')throw Error('Navigation control is not visible');const point={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};window.lastNavigationClick={selector:${JSON.stringify(selector)},point,hit:document.elementFromPoint(point.x,point.y)?.outerHTML};return point})()`);
 window.focus();window.webContents.focus();window.webContents.sendInputEvent({type:'mouseMove',...rect});
 window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...rect});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...rect});
}
function key(window,keyCode){keyCode=({ArrowDown:'Down',ArrowUp:'Up',ArrowLeft:'Left',ArrowRight:'Right'})[keyCode]||keyCode;window.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Enter')window.webContents.sendInputEvent({type:'char',keyCode:'\r'});window.webContents.sendInputEvent({type:'keyUp',keyCode})}
const menuOpen=window=>window.webContents.executeJavaScript("document.querySelector('#canvas-switcher-trigger').getAttribute('aria-expanded')==='true'&&document.querySelector('#canvas-switcher-menu').getBoundingClientRect().height>0");
async function worldViewport(window){const viewport=await rpc(window,'viewportGet'),size=await window.webContents.executeJavaScript("({width:document.querySelector('#panel-viewer').clientWidth,height:document.querySelector('#panel-viewer').clientHeight})");return{centerX:Math.round((size.width/2-viewport.pan.x)/viewport.zoom*100000)/100000,centerY:Math.round((size.height/2-viewport.pan.y)/viewport.zoom*100000)/100000,zoom:viewport.zoom}}
async function selectCanvas(window,target,keyboard=false){
 // A shortcut may have just resized the Agent panel. Let the production
 // ResizeObserver recenter before pairing pan with the new canvas dimensions.
 await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 const before=await rpc(window,'contextSnapshot'),viewport=await worldViewport(window);
 await click(window,'#canvas-switcher-trigger');await until(()=>menuOpen(window),'canvas navigation menu opens');
 const checked=await window.webContents.executeJavaScript("(()=>{const agent=document.body.classList.contains('agent-page-open'),ide=document.querySelector('#ide-page-open'),item=document.querySelector('#super-agent-open');return ide.getAttribute('role')==='menuitemradio'&&item.getAttribute('role')==='menuitemradio'&&ide.getAttribute('aria-checked')===String(!agent)&&item.getAttribute('aria-checked')===String(agent)})()");
 checks.navigationMenuReflectsCurrentCanvas=(checks.navigationMenuReflectsCurrentCanvas??true)&&checked;
 if(keyboard){
  const active=await window.webContents.executeJavaScript('document.activeElement.id');
  if(active!==target)key(window,'ArrowDown');
  await until(()=>window.webContents.executeJavaScript(`document.activeElement.id===${JSON.stringify(target)}`),'keyboard target menu item');
  key(window,'Enter');
 }else await click(window,'#'+target);
 await until(async()=>!(await menuOpen(window)),'canvas menu closes after selection');
 const agent=target==='super-agent-open';
 await until(()=>window.webContents.executeJavaScript(`document.body.classList.contains('agent-page-open')===${agent}`),'selected canvas is visible');
  await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 const selected=await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify('#'+target)}).getAttribute('aria-checked')==='true'&&document.querySelector('#canvas-switcher-trigger').getAttribute('aria-expanded')==='false'`);
 checks.navigationSelectionStateUpdates=(checks.navigationSelectionStateUpdates??true)&&selected;
 const focus=await window.webContents.executeJavaScript(agent?"!!document.activeElement.closest('.agent-canvas,#panel-agent')":"document.activeElement===document.querySelector('#panel-viewer')");
 checks.navigationSelectionFocusesCurrentPage=(checks.navigationSelectionFocusesCurrentPage??true)&&focus;
 const after=await rpc(window,'contextSnapshot'),afterViewport=await worldViewport(window);
 const preserved=JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(viewport)===JSON.stringify(afterViewport);
 if(!preserved)console.error('Navigation state mismatch',JSON.stringify({target,before,after,viewport,afterViewport}));
 checks.navigationPreservesIDE=(checks.navigationPreservesIDE??true)&&preserved;
 if(keyboard)checks.nativeEnterSelectsCanvas=selected&&focus;
}
const deadline=setTimeout(()=>{console.error('Shell fixture timed out');app.exit(1)},45000);
app.whenReady().then(async()=>{
 const window=new BrowserWindow({width:1300,height:900,show:true,title:'Tetris production shell audit',titleBarStyle:'hidden',webPreferences:{webviewTag:true,preload}});
 // Keep unrelated supervisor UI stubbed while loading the actual WorkerView.
 window.webContents.on('will-attach-webview',(_event,preferences,params)=>{if(workerScroll&&params.src.startsWith(configs.agentChat.src)&&new URL(params.src).searchParams.get('mode')!=='worker'){params.src=supervisorStub.src;preferences.preload=supervisorStub.preload}});
 window.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error('renderer:',message)});
 try{
  await window.loadURL(origin+'/shell/index.html');window.webContents.send('shell:loading-done');
  await until(()=>window.webContents.executeJavaScript("!!document.querySelector('#tile-layer .canvas-tile')"),'IDE restore');
  await until(()=>window.webContents.executeJavaScript("!document.querySelector('#loading-overlay')"),'loading overlay stops intercepting navigation clicks');
  checks.startsIDEWithPanelClosed=await window.webContents.executeJavaScript("!document.body.classList.contains('agent-page-open')&&getComputedStyle(document.querySelector('#panel-agent')).display==='none'");
  await window.webContents.executeJavaScript(`const title=document.querySelector('#tile-layer .tile-title-bar');const r=title.getBoundingClientRect();title.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,shiftKey:true,clientX:r.x+100,clientY:r.y+12}));title.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0,shiftKey:true,clientX:r.x+100,clientY:r.y+12}));`);
  const initialIDE=await rpc(window,'contextSnapshot');if(initialIDE.selectedTileIds.length!==1)throw Error('Fixture did not establish real IDE selection');
  const ideViewport=await rpc(window,'viewportGet');
  checks.navigationLivesInTitlebar=await window.webContents.executeJavaScript("!!document.querySelector('#titlebar #canvas-switcher #canvas-switcher-trigger')&&!!document.querySelector('#canvas-switcher-menu #ide-page-open')&&!!document.querySelector('#canvas-switcher-menu #super-agent-open')");
  checks.navigationMenuStartsClosed=!(await menuOpen(window));
  window.webContents.send('tetris-agent:notifications',[{id:'unread-one'},{id:'unread-two'},{id:'already-read',readAt:new Date().toISOString()}]);
  await until(()=>window.webContents.executeJavaScript("[...document.querySelectorAll('#canvas-switcher [data-canvas-unread]')].length===2&&[...document.querySelectorAll('#canvas-switcher [data-canvas-unread]')].every(badge=>!badge.hidden&&badge.textContent==='2')"),'both navigation unread badges');
  checks.notificationsUpdateTriggerAndAgentItem=await window.webContents.executeJavaScript("document.querySelector('#canvas-switcher-trigger').getAttribute('aria-label').includes('2 条未读')&&document.querySelector('#super-agent-open').getAttribute('aria-label').includes('2 条未读')");
  window.webContents.send('tetris-agent:notifications',[]);
  await until(()=>window.webContents.executeJavaScript("[...document.querySelectorAll('#canvas-switcher [data-canvas-unread]')].every(badge=>badge.hidden)"),'read notices clear both badges');
  checks.readNoticesClearBothNavigationBadges=true;
  window.focus();window.webContents.focus();await window.webContents.executeJavaScript("window.navigationKeys=[];window.navigationClicks=[];window.addEventListener('keydown',event=>navigationKeys.push({key:event.key,target:event.target.id}),true);for(const type of ['pointerdown','mousedown','click'])window.addEventListener(type,event=>navigationClicks.push({type,target:event.target.id,x:event.clientX,y:event.clientY}),true);document.querySelector('#canvas-switcher-trigger').focus()");
  key(window,'ArrowDown');await until(()=>menuOpen(window),'keyboard opens canvas menu');
  const firstMenuFocus=await window.webContents.executeJavaScript('document.activeElement.id');
  checks.nativeMenuKeyboardFocusesItem=['ide-page-open','super-agent-open'].includes(firstMenuFocus);
  key(window,'ArrowDown');await delay(40);
  const secondMenuFocus=await window.webContents.executeJavaScript('document.activeElement.id');
  key(window,'ArrowUp');await delay(40);
  checks.nativeMenuArrowKeysMoveOnlyFocus=firstMenuFocus!==secondMenuFocus&&await window.webContents.executeJavaScript(`document.activeElement.id===${JSON.stringify(firstMenuFocus)}&&!document.body.classList.contains('agent-page-open')&&document.querySelector('#ide-page-open').getAttribute('aria-checked')==='true'`);
  key(window,'Escape');await until(async()=>!(await menuOpen(window)),'Escape dismisses canvas menu');
  checks.nativeMenuEscapeRestoresTrigger=await window.webContents.executeJavaScript("document.activeElement.id==='canvas-switcher-trigger'");
  checks.menuKeyboardPreservesIDE=JSON.stringify(initialIDE)===JSON.stringify(await rpc(window,'contextSnapshot'))&&JSON.stringify(ideViewport)===JSON.stringify(await rpc(window,'viewportGet'));
  const worker=await rpc(window,'workerTile',{sessionId:'worker-fixture',taskId:'task-fixture',title:'隔离测试',cwd:'/fixture/project',canvasId:'agent:live'});
  if(workerScroll){
   await selectCanvas(window,'super-agent-open',true);
   await rpc(window,'tileFocus',{canvasId:'agent:live',tileIds:[worker.tileId]});
   const guestId=await window.webContents.executeJavaScript(`document.querySelector('[data-tile-id="${worker.tileId}"] webview').getWebContentsId()`),guest=webContents.fromId(guestId);
   await until(()=>guest.executeJavaScript("!!document.querySelector('.worker-output')&&document.querySelector('.worker-body').scrollHeight>document.querySelector('.worker-body').clientHeight"),'actual WorkerView output');
   window.focus();await window.webContents.executeJavaScript(`document.querySelector('[data-tile-id="${worker.tileId}"] > header').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
   const beforeIDE=await rpc(window,'viewportGet'),beforeAgent=await window.webContents.executeJavaScript("document.querySelector('.agent-canvas-layer').style.transform"),before=await guest.executeJavaScript("document.querySelector('.worker-body').scrollTop");
   const rect=await window.webContents.executeJavaScript(`document.querySelector('[data-tile-id="${worker.tileId}"] webview').getBoundingClientRect().toJSON()`);
   const activated=await window.webContents.executeJavaScript(`document.querySelector('[data-tile-id="${worker.tileId}"]').classList.contains('is-selected')&&getComputedStyle(document.querySelector('[data-tile-id="${worker.tileId}"] webview')).pointerEvents==='auto'`);
   window.webContents.debugger.attach('1.3');
   await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.left+100,y:rect.top+140});
   await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',x:rect.left+100,y:rect.top+140,deltaX:0,deltaY:240});
   await until(async()=>await guest.executeJavaScript("document.querySelector('.worker-body').scrollTop")>before,'worker internal scroll');
   const after=await guest.executeJavaScript("document.querySelector('.worker-body').scrollTop");
   const result={...checks,actualWorkerViewLoaded:guest.getURL().startsWith(configs.agentChat.src),workerActivated:activated,scrollBefore:before,scrollAfter:after,IDEViewportUnchanged:JSON.stringify(beforeIDE)===JSON.stringify(await rpc(window,'viewportGet')),AgentViewportUnchanged:beforeAgent===await window.webContents.executeJavaScript("document.querySelector('.agent-canvas-layer').style.transform")};
   console.log(JSON.stringify(result,null,2));if(Object.values(checks).some(value=>value!==true)||!result.actualWorkerViewLoaded||!result.workerActivated||after<=before||!result.IDEViewportUnchanged||!result.AgentViewportUnchanged)throw Error('Actual WorkerView navigation/scroll failed');
   clearTimeout(deadline);window.destroy();fs.rmSync(sandbox,{recursive:true,force:true});app.exit(0);return;
  }
  checks.backgroundDispatchLeavesIDEVisible=await window.webContents.executeJavaScript("!document.body.classList.contains('agent-page-open')");
  await selectCanvas(window,'super-agent-open',true);
  await until(()=>window.webContents.executeJavaScript("!!document.querySelector('#panel-agent webview[src*=agentChat]')"),'Supervisor guest');
  checks.agentEntryShowsSupervisorWithLegacyPref=await window.webContents.executeJavaScript("document.body.classList.contains('agent-page-open')&&getComputedStyle(document.querySelector('#panel-agent')).display!=='none'&&!!document.querySelector('#panel-agent webview[src*=agentChat]')");
  await rpc(window,'tileFocus',{canvasId:'agent:live',tileIds:[worker.tileId]});
  await delay(100);
  const beforeKeys=await rpc(window,'contextSnapshot'),viewportBeforeKeys=await rpc(window,'viewportGet');
  await window.webContents.executeJavaScript("window.fixtureKeys=[];window.addEventListener('keydown',event=>fixtureKeys.push(event.key),true);document.querySelector('.agent-canvas').focus()");window.focus();window.webContents.focus();
  for(const keyCode of ['Delete','Backspace','Escape']){window.webContents.sendInputEvent({type:'keyDown',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode})}
  await delay(100);
  checks.nativeKeysReachedProductionWindow=await window.webContents.executeJavaScript("fixtureKeys.includes('Delete')&&fixtureKeys.includes('Backspace')&&fixtureKeys.includes('Escape')");
  checks.nativeDeleteEscapePreserveIDE=JSON.stringify(beforeKeys)===JSON.stringify(await rpc(window,'contextSnapshot'));
  checks.nativeDeleteDoesNotConfirmIDEDeletion=confirms===0;
  await window.webContents.executeJavaScript("const input=document.createElement('textarea');input.id='typing-fixture';input.value='仍在输入';document.querySelector('.agent-canvas').append(input);input.focus();input.setSelectionRange(input.value.length,input.value.length)");
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Backspace'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Backspace'});await delay(70);
  checks.nativeBackspaceEditsFocusedText=await window.webContents.executeJavaScript("document.querySelector('#typing-fixture').value==='仍在输'");
  checks.textInputDoesNotDeleteAnyTile=(await rpc(window,'tileList',{canvasId:'agent:live'})).tiles.length===1&&(await rpc(window,'tileList')).tiles.length===1&&confirms===0;
  await window.webContents.executeJavaScript("document.querySelector('#typing-fixture').remove();document.querySelector('.agent-canvas').focus()");
  window.webContents.send('shell:shortcut','focus-tile-right');window.webContents.send('shell:shortcut','toggle-fullscreen-tile');await delay(70);
  checks.agentShortcutPreservesIDEViewport=JSON.stringify(viewportBeforeKeys)===JSON.stringify(await rpc(window,'viewportGet'));
  window.webContents.send('shell:shortcut','close-tile');await until(async()=>!(await rpc(window,'tileList',{canvasId:'agent:live'})).tiles.length,'Agent close shortcut');
  checks.closeShortcutOnlyClosesAgent=(await rpc(window,'tileList')).tiles.length===1&&JSON.stringify((await rpc(window,'contextSnapshot')).selectedTileIds)===JSON.stringify(initialIDE.selectedTileIds);
  await selectCanvas(window,'ide-page-open');await delay(100);
  checks.returnIDEClosesAgentPanel=await window.webContents.executeJavaScript("!document.body.classList.contains('agent-page-open')&&getComputedStyle(document.querySelector('#panel-agent')).display==='none'");
  checks.returnIDERestoresViewport=JSON.stringify(ideViewport)===JSON.stringify(await rpc(window,'viewportGet'));
  checks.returnIDERetainsSelectionAndTiles=JSON.stringify(initialIDE)===JSON.stringify(await rpc(window,'contextSnapshot'));
  window.webContents.send('shell:shortcut','toggle-agent');await until(()=>window.webContents.executeJavaScript("document.body.classList.contains('agent-page-open')"),'shortcut Agent entry');
  checks.shortcutEntersAgentPage=true;
  await selectCanvas(window,'ide-page-open');await window.webContents.executeJavaScript("document.querySelector('#agent-toggle').click()");
  checks.edgeToggleEntersAgentPage=await window.webContents.executeJavaScript("document.body.classList.contains('agent-page-open')");
  checks.legacyPreferenceAndPTYPreserved=prefs['sidebar-agent-gui']===false&&prefs['agent-pty-session']==='legacy-pty'&&ptyKills===0&&!writes.some(w=>w.key==='sidebar-agent-gui');
  console.log(JSON.stringify(checks,null,2));
  if(Object.values(checks).some(value=>value!==true))throw Error('Shell isolation audit failed');
  clearTimeout(deadline);window.destroy();fs.rmSync(sandbox,{recursive:true,force:true});app.exit(0);
 }catch(error){console.error(error);console.error(await window.webContents.executeJavaScript("JSON.stringify({active:document.activeElement?.id,keys:window.navigationKeys,clicks:window.navigationClicks,lastClick:window.lastNavigationClick,expanded:document.querySelector('#canvas-switcher-trigger')?.getAttribute('aria-expanded'),menuHidden:document.querySelector('#canvas-switcher-menu')?.hidden})").catch(()=>''));clearTimeout(deadline);window.destroy();fs.rmSync(sandbox,{recursive:true,force:true});app.exit(1)}
});
