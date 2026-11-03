// Real React Tiles renderer with simulated IPC; no terminal sessions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;process.exit(spawnSync(require('electron'),[__filename],{env,stdio:'inherit'}).status??1);}
const {app,BrowserWindow}=require('electron');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(root,'.tmp-tiles-'));
app.setPath('userData',path.join(temp,'profile'));app.commandLine.appendSwitch('disable-gpu');
fs.writeFileSync(path.join(temp,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import App from '../src/windows/tile-list/src/App';createRoot(document.getElementById('root')!).render(<App/>);`);
execFileSync('bun',['build',path.join(temp,'entry.tsx'),'--target','browser','--outdir',path.join(temp,'bundle')],{cwd:root});
fs.writeFileSync(path.join(temp,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="bundle/entry.css"><style>:root{--foreground:#eee;--muted-foreground:#9898a2;--background:#17171b;--primary:#9abaff;--font-sans:system-ui;color-scheme:dark}body{background:#17171b}</style></head><body><div id="root"></div><script>window.sent=[];window.api={onTileListMessage(cb){window.receive=cb;return ()=>{}},sendToHost(...args){sent.push(args)},showContextMenu(){return Promise.resolve('rename')}};</script><script src="bundle/entry.js"></script></body></html>`);
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:300,height:500,webPreferences:{sandbox:true,contextIsolation:true}});const js=code=>win.webContents.executeJavaScript(code);const settle=()=>new Promise(r=>setTimeout(r,100));try{
 await win.loadFile(path.join(temp,'index.html'));await settle();
 const now=Date.now(),session={agent:'Codex',status:'working',tool:'运行测试',started:now-5000,activeSince:now-5000,runningMs:0,waitingSince:0,completedAt:0,unread:false};
 const entries=[{id:'working',type:'term',title:'修复登录',description:'collab',status:'running',agentSession:session},{id:'attention',type:'term',title:'首页布局',description:'website',status:'running',agentSession:{...session,agent:'Claude Code',status:'attention',tool:'执行命令需要确认',waitingSince:now-125000}},{id:'done',type:'term',title:'接口测试',description:'api',status:'running',agentSession:{...session,status:'done',tool:'本轮回复完成',completedAt:now-5000,unread:true}},{id:'browser',type:'browser',title:'本地预览',description:'localhost:3000',status:null}];
 await js(`receive('tile-list:init',${JSON.stringify(entries)})`);await settle();
 assert.equal(await js(`document.querySelector('.tile-entry').dataset.tileId`),'attention');assert.ok(await js(`document.body.textContent.includes('等待 2m')`),await js(`document.body.textContent`));
 await js(`document.querySelectorAll('.tile-filters button')[1].click()`);await settle();assert.equal(await js(`document.querySelectorAll('.tile-entry').length`),1);
 await js(`document.querySelector('.tile-entry').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);assert.deepEqual(await js('sent.at(-1)'),['tile-list:focus-tile','attention']);
 await js(`receive('tile-list:focus','attention')`);await settle();assert.ok(await js(`document.body.textContent.includes('待处理')`));
 await js(`document.querySelectorAll('.tile-filters button')[3].click()`);await settle();assert.equal(await js(`document.querySelector('.tile-entry').dataset.tileId`),'done');
 entries[2].agentSession.unread=false;await js(`receive('tile-list:update',${JSON.stringify(entries[2])})`);await settle();assert.equal(await js(`document.querySelectorAll('.tile-entry').length`),0);
 await js(`document.querySelectorAll('.tile-filters button')[0].click()`);await settle();assert.equal(await js(`document.querySelectorAll('.tile-entry').length`),4);
 fs.writeFileSync('/tmp/tetris-tiles-status.png',(await win.webContents.capturePage()).toPNG());
 console.log('Tiles status UI: priority, filters, waiting duration, keyboard navigation, unread acknowledgement and non-agent tiles passed.');
 }finally{win.destroy();app.quit();}}).catch(e=>{console.error(e);app.exit(1)});
app.on('will-quit',()=>fs.rmSync(temp,{recursive:true,force:true}));
