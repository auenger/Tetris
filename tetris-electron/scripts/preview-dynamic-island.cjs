const {spawn}=require('node:child_process');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(require('electron'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit'});child.on('exit',code=>process.exit(code??0));return;}
const {app,BrowserWindow,ipcMain,Menu,screen}=require('electron');
const {join}=require('node:path');const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');const {tmpdir}=require('node:os');
const profile=mkdtempSync(join(tmpdir(),'tetris-island-preview-'));app.setPath('userData',profile);app.setName('Tetris Island Preview');
const check=process.argv.includes('--check');let ratio=.5,dragOffset=null;let contentHeight=40;let win,hover=false,mode='working',toastUntil=0;const start=Date.now()-83000;
function snapshot(){const now=Date.now();return {sessions:[{id:'demo-1',title:'collab',cwd:'/Users/demo/projects/collab',status:mode,tool:mode==='working'?'Bash · npm test':mode==='attention'?'执行命令需要确认':'',agent:'Codex',started:start,activeSince:start,runningMs:0,waitingSince:start,completedAt:now,unread:mode==='done',updated:now,avatar:0},{id:'demo-2',title:'website',cwd:'/Users/demo/projects/website',status:'done',tool:'',agent:'Claude Code',started:start-50000,completedAt:start,unread:false,updated:start,avatar:7}],toast:now<toastUntil?'collab 已完成':'',time:now,usages:[{id:'demo-codex',provider:'Codex',account:'演示账户 · 模拟数据',kind:'订阅',detail:'演示 · 重置于明天 14:36',windows:[{label:'7d',usedPercent:29}],history:[{time:1,value:20},{time:2,value:24},{time:3,value:29}]},{id:'demo-deepseek',provider:'deepseek',account:'个人 API · 模拟数据',kind:'API Key',balance:'¥110.00',detail:'API 可用余额 · 含赠送余额',windows:[],history:[],readAt:now},{id:'demo-zhipu',provider:'zhipu',account:'智谱套餐 · 模拟数据',kind:'GLM Coding Pro',detail:'套餐额度 · 已用比例',windows:[{label:'5h',usedPercent:3,resetsAt:new Date(now+3600000).toISOString()},{label:'7d',usedPercent:29},{label:'MCP · 月',usedPercent:10}],history:[],readAt:now},{id:'demo-zai',provider:'zai',account:'Z.ai 套餐 · 模拟数据',kind:'GLM Coding Max',detail:'套餐额度 · 已用比例',windows:[{label:'5h',usedPercent:12},{label:'7d',usedPercent:40}],history:[],readAt:now}],expanded:hover||dragOffset!==null};}
function render(){if(!win||win.isDestroyed())return;const data=snapshot(),area=screen.getPrimaryDisplay().bounds,width=data.expanded?460:238;win.setBounds({x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,area.x+area.width*ratio-width/2))),y:area.y,width,height:data.expanded?contentHeight:40});win.webContents.send('island:state',data);}
function setMode(value){mode=value;toastUntil=value==='done'?Date.now()+4000:0;render();}
ipcMain.on('island:drag',(e,phase,x,y)=>{if(e.sender!==win.webContents||!Number.isFinite(x)||!Number.isFinite(y))return;const area=screen.getPrimaryDisplay().bounds;if(phase==='start'){const b=win.getBounds();dragOffset=x-b.x-b.width/2;return}if(dragOffset===null)return;ratio=Math.max(0,Math.min(1,(x-dragOffset-area.x)/area.width));if(phase==='end')dragOffset=null;render()});
ipcMain.on('island:height',(e,height)=>{if(e.sender===win.webContents&&Number.isFinite(height)){contentHeight=Math.max(40,Math.min(520,Math.ceil(height)));render()}});
ipcMain.on('island:expand',(e,v)=>{if(e.sender===win.webContents){hover=Boolean(v);render()}});
ipcMain.on('island:open',()=>console.log('Preview session clicked; no real terminal opened'));
app.whenReady().then(async()=>{
 win=new BrowserWindow({width:238,height:48,show:!check,frame:false,transparent:true,hasShadow:false,roundedCorners:false,resizable:false,alwaysOnTop:true,webPreferences:{preload:join(__dirname,'../resources/dynamic-island/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.setAlwaysOnTop(true,'screen-saver');
 await win.loadFile(join(__dirname,'../resources/dynamic-island/index.html'));
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'预览',submenu:[{label:'工作中',click:()=>setMode('working')},{label:'等待确认',click:()=>setMode('attention')},{label:'已完成（胶囊提示4秒）',click:()=>setMode('done')},{type:'separator'},{role:'quit',label:'关闭预览'}]}]));
 render();if(!check)win.show();const timer=setInterval(render,1000);win.on('closed',()=>{clearInterval(timer);app.quit()});
 if(check){const assert=require('node:assert/strict'),js=code=>win.webContents.executeJavaScript(code);await new Promise(r=>setTimeout(r,300));
 assert.equal(await js('document.querySelectorAll(".row").length'),2);
 assert.ok(await js(`getComputedStyle(document.querySelector('.row .face')).backgroundImage.includes('avatars/codex.png')`));
 assert.equal(await js(`document.querySelector('.row .face').style.backgroundPosition`),'50% 50%');
 assert.equal(await js(`document.querySelectorAll('.row .face')[1].style.backgroundPosition`),'100% 50%');
 assert.ok(await js(`Promise.all(avatarNames.map(name=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth===3*img.naturalHeight);img.onerror=()=>resolve(false);img.src='avatars/'+name+'.png'}))).then(results=>results.every(Boolean))`));
 assert.ok(Number(await js('getComputedStyle(document.getElementById("island")).opacity'))<.6);
 assert.equal(await js('document.body.textContent.includes("API 账户可在")'),false);
 await js('document.getElementById("island").dispatchEvent(new MouseEvent("mouseenter"))');await new Promise(r=>setTimeout(r,400));
 assert.equal(await js('document.getElementById("island").classList.contains("expanded")'),true);
 assert.equal(await js('document.querySelectorAll(".quota-card").length'),4);
 assert.equal(await js('document.querySelector(".quota-ring b").textContent'),'29%');
 assert.equal(win.getBounds().y,screen.getPrimaryDisplay().bounds.y);
 assert.equal(win.getBounds().height,await js('Math.ceil(document.getElementById("island").getBoundingClientRect().height)'));
 await js('document.querySelectorAll("*").forEach(el=>el.style.animation="none")');
 assert.equal(await js('getComputedStyle(document.getElementById("detail")).display'), 'block');
 writeFileSync('/tmp/tetris-island-preview.png',(await win.webContents.capturePage()).toPNG());
 hover=false;
 for(const value of ['attention','done','working']){
 setMode(value);await new Promise(r=>setTimeout(r,300));
 assert.equal(snapshot().expanded,false);
 assert.equal(win.getBounds().width,238);assert.equal(win.getBounds().height,40);
 assert.equal(await js('getComputedStyle(document.getElementById("detail")).display'),'none');
 const label=await js('document.getElementById("count").textContent');
 assert.equal(label,value==='attention'?'1 个待处理':value==='done'?'1 个新完成':'1 个运行中');
 }
 setMode('done');toastUntil=Date.now()-1;render();await new Promise(r=>setTimeout(r,100));assert.equal(await js('document.getElementById("count").textContent'),'1 个新完成');assert.equal(snapshot().expanded,false);
 const before=win.getBounds();await js(`window.island.drag('start',${before.x+100},20);window.island.drag('move',${before.x+220},200);window.island.drag('end',${before.x+220},200)`);await new Promise(r=>setTimeout(r,100));assert.equal(win.getBounds().y,screen.getPrimaryDisplay().bounds.y);assert.equal(win.getBounds().x,before.x+120);
 console.log('Island opacity, hover, GLM cards, pinned dragging, attention and completion checks passed');win.destroy();}
}).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>{try{rmSync(profile,{recursive:true,force:true})}catch{}});
