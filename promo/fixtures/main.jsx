import React from 'react';
import {createRoot} from 'react-dom/client';
import {Terminal} from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {createTileDOM} from '../../tetris-electron/src/windows/shell/src/tile-renderer.js';
import {Markdown} from '@tetris/components/Markdown';
import '../../tetris-electron/src/windows/shell/src/shell.css';
const terms=[
['Frontend · Claude Code',['$ claude','','> Build the workspace UI.','','● Read src/components/Canvas.tsx','● Update window arrangement','● Add drag and resize handles','','  3 files changed, +128 −24','','✓ Workspace layout ready.']],
['Backend · Codex',['$ codex','','> Add the task API.','','• Read server/routes.ts','• Implement task persistence','• Add request validation','','  GET   /api/tasks       200','  POST  /api/tasks       201','','✓ API ready for review.']],
['Tests · Claude Code',['$ claude','','> Verify the new workflow.','',' PASS  canvas-layout.test.ts',' PASS  group-collapse.test.ts',' PASS  notification.test.ts','',' Test files  3 passed (3)',' Tests      12 passed (12)','','✓ All checks passed.']],
['Dev server · Terminal',['$ npm run dev','','  VITE  ready in 286 ms','','  ➜ Local: http://localhost:5173/','','  [vite] hmr update /Canvas.tsx','  [vite] hmr update /styles.css','','  Listening for file changes…']],
['Review · Codex',['$ codex','','> Review the current changes.','','• Check resize boundaries','• Inspect notification state','• Verify keyboard navigation','','  No blocking issues found.','','✓ Ready for your review.']],
['Git · Terminal',['$ git diff --stat','',' src/Canvas.tsx     | 48 +++++',' src/TaskList.tsx   | 32 ++++',' src/styles.css    | 18 ++','',' 3 files changed, 98 insertions','','$ git status --short',' M src/Canvas.tsx',' M src/TaskList.tsx',' M src/styles.css']]
];
const doc='# Launch workspace\n\n把一次开发任务的上下文，放在同一张画布。\n\n## 这次要完成什么\n\n- [x] 构建终端画布布局\n- [x] 增加文件预览与浏览器窗口\n- [x] 验证分组和完成提醒\n\n> 需求、实现与预览，始终在一起。\n\n## 交付检查\n\n| 内容 | 状态 |\n| --- | --- |\n| 页面布局 | Ready |\n| 交互检查 | Passed |\n| 变更审查 | Ready |';
window.showAsset=async(kind)=>{
 document.querySelector('#app').innerHTML='';
 const isTerm=kind.startsWith('term'),n=Number(kind.replace('term',''))||0;
 const w=isTerm?590:kind==='browser'?1000:kind==='image'?620:680,h=isTerm?370:kind==='browser'?650:kind==='image'?470:650;
 const tile={id:kind,type:isTerm?'term':kind==='browser'?'browser':kind==='image'?'image':'note',userTitle:isTerm?terms[n][0]:undefined,url:kind==='browser'?'http://localhost:5173':undefined,filePath:kind==='doc'?'/workspace/launch/PLAN.md':kind==='image'?'/workspace/launch/preview.png':undefined};
 const el=createTileDOM(tile,{onClose(){},onFocus(){},onNavigate(){},onToggleFullscreen(){},onQuickCommand(){}});
 Object.assign(el.container.style,{left:'0px',top:'0px',width:w+'px',height:h+'px'});
 document.querySelector('#app').append(el.container);
 if(isTerm){const holder=document.createElement('div');Object.assign(holder.style,{padding:'10px 14px',height:'100%',background:'#f7f7f9'});el.contentArea.append(holder);const t=new Terminal({cols:65,rows:19,fontFamily:'Menlo,monospace',fontSize:13,lineHeight:1.32,cursorBlink:false,theme:{background:'#f7f7f9',foreground:'#333840',green:'#408661'}});t.open(holder);await new Promise(r=>t.write('\x1b[?25l'+terms[n][1].map(s=>s.startsWith('✓')||s.includes('PASS')?'\x1b[32m'+s+'\x1b[0m':s).join('\r\n'),r));}
 else if(kind==='doc'){const holder=document.createElement('div');holder.className='doc';el.contentArea.append(holder);createRoot(holder).render(<Markdown content={doc}/>);}
 else if(kind==='browser'){const frame=document.createElement('iframe');frame.src='/website.html';Object.assign(frame.style,{width:'100%',height:'100%',border:'0'});el.contentArea.append(frame);await new Promise(r=>frame.onload=r);}
 else {const holder=document.createElement('div');Object.assign(holder.style,{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',background:'#ededeb'});holder.innerHTML='<img src="/preview.svg" style="width:92%;height:90%;object-fit:contain">';el.contentArea.append(holder);await new Promise(r=>holder.querySelector('img').onload=r);}
 await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {w,h};
};
await window.showAsset('term0');window.ready=true;
