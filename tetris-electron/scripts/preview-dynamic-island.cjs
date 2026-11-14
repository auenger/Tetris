const {spawn,execFileSync}=require('node:child_process');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(require('electron'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit'});child.on('exit',code=>process.exit(code??0));return;}
const {app,BrowserWindow,ipcMain,Menu,screen}=require('electron');
const {join}=require('node:path');const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');const {tmpdir}=require('node:os');
// Exercise the production layout function without loading the application or hooks.
const ts=require('typescript'),Module=require('node:module');
const geometryModule=new Module(__filename);
geometryModule._compile(ts.transpileModule(require('node:fs').readFileSync(join(__dirname,'../src/main/island-position.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,__filename);
const {islandLayout,parseDisplayNotches}=geometryModule.exports;
const nativeMode=process.argv.includes('--notch'),mockMode=process.argv.includes('--mock-notch');
let notches=[];
if(nativeMode)notches=parseDisplayNotches(JSON.parse(execFileSync(join(__dirname,'../resources/native/display-geometry'),[],{encoding:'utf8'})));
function layout(expanded){return islandLayout(screen.getAllDisplays(),screen.getPrimaryDisplay(),notches,{displayId:screen.getPrimaryDisplay().id,ratio},expanded,contentHeight)}
const profile=mkdtempSync(join(tmpdir(),'tetris-island-preview-'));app.setPath('userData',profile);app.setName('Tetris Island Preview');
const check=process.argv.includes('--check');let ratio=.5,dragOffset=null;let contentHeight=40;let win,hover=false,mode='working',toastUntil=0;const start=Date.now()-83000;
function snapshot(){const now=Date.now();return {sessions:[{id:'demo-1',title:'collab',cwd:'/Users/demo/projects/collab',status:mode,tool:mode==='working'?'Bash · npm test':mode==='attention'?'执行命令需要确认':'',agent:'Codex',started:start,activeSince:start,runningMs:0,waitingSince:start,completedAt:now,unread:mode==='done',updated:now,avatar:0},{id:'demo-2',title:'website',cwd:'/Users/demo/projects/website',status:'done',tool:'',agent:'Claude Code',started:start-50000,completedAt:start,unread:false,updated:start,avatar:7}],toast:now<toastUntil?'collab 已完成':'',time:now,usages:[{id:'demo-codex',provider:'Codex',account:'演示账户 · 模拟数据',kind:'订阅',detail:'演示 · 重置于明天 14:36',windows:[{label:'7d',usedPercent:29}],history:[{time:1,value:20},{time:2,value:24},{time:3,value:29}]},{id:'demo-deepseek',provider:'deepseek',account:'个人 API · 模拟数据',kind:'API Key',balance:'¥110.00',detail:'API 可用余额 · 含赠送余额',windows:[],history:[],readAt:now},{id:'demo-zhipu',provider:'zhipu',account:'智谱套餐 · 模拟数据',kind:'GLM Coding Pro',detail:'套餐额度 · 已用比例',windows:[{label:'5h',usedPercent:3,resetsAt:new Date(now+3600000).toISOString()},{label:'7d',usedPercent:29},{label:'MCP · 月',usedPercent:10}],history:[],readAt:now},{id:'demo-zai',provider:'zai',account:'Z.ai 套餐 · 模拟数据',kind:'GLM Coding Max',detail:'套餐额度 · 已用比例',windows:[{label:'5h',usedPercent:12},{label:'7d',usedPercent:40}],history:[],readAt:now}],expanded:hover||dragOffset!==null};}
function render(){if(!win||win.isDestroyed())return;const data=snapshot();data.layout=layout(data.expanded);win.setBounds(data.layout.bounds);win.webContents.send('island:state',data);}
function setMode(value){mode=value;toastUntil=value==='done'?Date.now()+4000:0;render();}
ipcMain.on('island:drag',(e,phase,x,y)=>{if(layout(false).mode==='notch'||e.sender!==win.webContents||!Number.isFinite(x)||!Number.isFinite(y))return;const area=screen.getPrimaryDisplay().bounds;if(phase==='start'){const b=win.getBounds();dragOffset=x-b.x-b.width/2;return}if(dragOffset===null)return;ratio=Math.max(0,Math.min(1,(x-dragOffset-area.x)/area.width));if(phase==='end')dragOffset=null;render()});
ipcMain.on('island:height',(e,height)=>{if(e.sender===win.webContents&&Number.isFinite(height)){contentHeight=Math.max(40,Math.min(520,Math.ceil(height)));render()}});
ipcMain.on('island:expand',(e,v)=>{if(e.sender===win.webContents){hover=Boolean(v);render()}});
ipcMain.on('island:open',()=>console.log('Preview session clicked; no real terminal opened'));
app.whenReady().then(async()=>{
 if(mockMode){const d=screen.getPrimaryDisplay();notches=[{displayId:d.id,x:d.bounds.width/2-150,width:300,height:48}];}
 win=new BrowserWindow({width:238,height:48,show:!check,frame:false,transparent:true,hasShadow:false,roundedCorners:false,resizable:false,alwaysOnTop:true,webPreferences:{preload:join(__dirname,'../resources/dynamic-island/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.setAlwaysOnTop(true,'screen-saver');
 await win.loadFile(join(__dirname,'../resources/dynamic-island/index.html'));
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'预览',submenu:[{label:'工作中',click:()=>setMode('working')},{label:'等待确认',click:()=>setMode('attention')},{label:'已完成（胶囊提示4秒）',click:()=>setMode('done')},{type:'separator'},{role:'quit',label:'关闭预览'}]}]));
 render();if(!check)win.show();const timer=setInterval(render,1000);win.on('closed',()=>{clearInterval(timer);app.quit()});
 if(check){const assert=require('node:assert/strict'),js=code=>win.webContents.executeJavaScript(code);await new Promise(r=>setTimeout(r,300));
 assert.equal(await js('document.querySelectorAll(".row").length'),2);
 assert.ok(await js(`document.querySelector('.row .face').src.endsWith('codex-working.gif')`));
 assert.ok(await js(`document.querySelectorAll('.row .face')[1].src.endsWith('claude-code-done.gif')`));
 assert.ok(await js(`Promise.all(avatarNames.flatMap(name=>['idle','working','attention','done'].map(state=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth===96&&img.naturalHeight===96);img.onerror=()=>resolve(false);img.src='avatars/animated/'+name+'-'+state+'.gif'})))).then(results=>results.every(Boolean))`));
 await js(`window.originalFace=document.querySelector('#faces .face')`);render();await new Promise(r=>setTimeout(r,100));
 assert.ok(await js(`window.originalFace===document.querySelector('#faces .face')`),'unchanged status must preserve animated image');
 await win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await new Promise(r=>setTimeout(r,100));assert.ok(await js(`document.querySelector('#faces .face').src.endsWith('.png')`));
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await new Promise(r=>setTimeout(r,100));assert.ok(await js(`document.querySelector('#faces .face').src.endsWith('.gif')`));
 win.webContents.debugger.detach();
 assert.equal(Number(await js('getComputedStyle(document.getElementById("island")).opacity'))>=.99,layout(false).mode==='notch');
 assert.equal(await js('document.body.textContent.includes("API 账户可在")'),false);
 await js('document.getElementById("island").dispatchEvent(new MouseEvent("mouseenter"))');await new Promise(r=>setTimeout(r,400));
 assert.equal(await js('document.getElementById("island").classList.contains("expanded")'),true);
 assert.equal(await js('document.querySelectorAll(".quota-card").length'),4);
 assert.equal(await js('document.querySelector(".quota-ring b").textContent'),'29%');
 assert.equal(win.getBounds().y,layout(hover).bounds.y);
 assert.equal(win.getBounds().height,await js('Math.ceil(document.getElementById("island").getBoundingClientRect().height)'));
 await js('document.querySelectorAll("*").forEach(el=>el.style.animation="none")');
 assert.equal(await js('getComputedStyle(document.getElementById("detail")).display'), 'block');
 writeFileSync('/tmp/tetris-island-preview.png',(await win.webContents.capturePage()).toPNG());
 hover=false;
 for(const value of ['attention','done','working','idle','unknown']){
 setMode(value);await new Promise(r=>setTimeout(r,300));
 assert.equal(snapshot().expanded,false);
 assert.equal(win.getBounds().width,layout(false).bounds.width);assert.equal(win.getBounds().height,layout(false).headerHeight);
 assert.equal(await js('getComputedStyle(document.getElementById("detail")).display'),'none');
 const label=await js('document.getElementById("count").textContent');
 assert.equal(label,({attention:'待处理 1',done:'新完成 1',working:'工作中 1',idle:'空闲',unknown:'未接入'})[value]);
 }
 setMode('done');toastUntil=Date.now()-1;render();await new Promise(r=>setTimeout(r,100));assert.equal(await js('document.getElementById("count").textContent'),'新完成 1');assert.equal(snapshot().expanded,false);
 const before=win.getBounds();await js(`window.island.drag('start',${before.x+100},20);window.island.drag('move',${before.x+220},200);window.island.drag('end',${before.x+220},200)`);await new Promise(r=>setTimeout(r,100));assert.equal(win.getBounds().y,layout(hover).bounds.y);assert.equal(win.getBounds().x,before.x+(layout(false).mode==='notch'?0:120));
 if(layout(false).mode==='notch'){
 assert.equal(win.getBounds().width,layout(false).bounds.width);assert.equal(win.getBounds().height,layout(false).headerHeight);
 assert.equal(await js('document.querySelectorAll("#faces .face").length'),1);
 assert.equal(await js('getComputedStyle(document.getElementById("count")).display'),'block');
 assert.equal(await js('getComputedStyle(document.getElementById("island")).backgroundColor'),'rgb(0, 0, 0)');
 assert.equal(await js('document.querySelector("#faces .face").getBoundingClientRect().width'),28);
 assert.ok(await js(`document.querySelector('#count').getBoundingClientRect().left>=76+${layout(false).notchWidth}`));
 await js(`document.getElementById('island').dispatchEvent(new MouseEvent('mousemove',{clientX:80}))`);await new Promise(r=>setTimeout(r,250));assert.equal(hover,false,'camera region must not open the overlay');
 writeFileSync('/tmp/tetris-island-avatar-preview.png' ,(await win.webContents.capturePage()).toPNG());
 await js('document.getElementById("summary").click()');await new Promise(r=>setTimeout(r,300));
 assert.equal(hover,true);assert.equal(win.getBounds().y,layout(true).bounds.y);
 assert.equal(win.getBounds().y,layout(false).bounds.y);
 assert.ok(await js(`document.querySelector("#faces").getBoundingClientRect().top>=${layout(false).headerHeight}`));
 assert.equal(win.getBounds().width,400);assert.ok(win.getBounds().height<=420);
 assert.ok(await js(`getComputedStyle(document.getElementById('island')).clipPath.startsWith('path(')`));
 await js('document.getElementById("summary").click()');await new Promise(r=>setTimeout(r,300));
 assert.equal(hover,false);assert.equal(win.getBounds().width,layout(false).bounds.width);
 hover=true;render();await new Promise(r=>setTimeout(r,300));
 writeFileSync('/tmp/tetris-island-notch-preview.png',(await win.webContents.capturePage()).toPNG());
 }
 console.log('Island geometry, safe areas, hover, quotas, dragging, attention and completion checks passed:',layout(false).mode);win.destroy();}
}).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>{try{rmSync(profile,{recursive:true,force:true})}catch{}});
