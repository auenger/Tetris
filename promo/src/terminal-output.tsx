import React from 'react';

type Line={at:number;text:string;color?:string;type?:boolean};
const green='#36836c',muted='#829087',ink='#39453f',gold='#aa7e3e';
const programs: Line[][]=[
 [{at:1.95,text:'$ claude',type:true},{at:2.55,text:'> Build the workspace UI.',type:true},{at:3.2,text:'Read  src/components/Canvas.tsx',color:muted},{at:3.65,text:'Edit  window arrangement',color:gold},{at:4.1,text:'Edit  drag & resize handles',color:gold},{at:4.55,text:'+ 128 lines    − 24 lines',color:muted},{at:5.05,text:'✓ Workspace layout ready.',color:green},{at:14.05,text:'> Refine focus & selection.',type:true},{at:16.2,text:'✓ Focus state updated.',color:green}],
 [{at:2.05,text:'$ codex',type:true},{at:2.8,text:'> Add the task API.',type:true},{at:3.4,text:'Read  server/routes.ts',color:muted},{at:3.95,text:'Edit  request validation',color:gold},{at:4.45,text:'GET  /api/tasks        200',color:green},{at:4.95,text:'POST /api/tasks        201',color:green},{at:5.45,text:'✓ API ready for review.',color:green},{at:14.25,text:'Watching for changes…',color:muted},{at:17.3,text:'GET  /api/tasks        200',color:green}],
 [{at:2.2,text:'$ claude',type:true},{at:2.95,text:'> Verify the new workflow.',type:true},{at:3.7,text:'RUN   canvas-layout.test.ts',color:gold},{at:4.25,text:'PASS  canvas-layout.test.ts',color:green},{at:4.8,text:'PASS  group-collapse.test.ts',color:green},{at:5.3,text:'Checking notification flow…',color:muted},{at:14.15,text:'RUN   agent-notify.test.ts',color:gold},{at:17.15,text:'PASS  agent-notify.test.ts',color:green},{at:18.4,text:'Test files   3 passed (3)',color:green},{at:18.65,text:'Tests       12 passed (12)',color:green},{at:19.05,text:'✓ All checks passed.',color:green}],
 [{at:2.25,text:'$ npm run dev',type:true},{at:2.9,text:'VITE  ready in 286 ms',color:green},{at:3.5,text:'➜  http://localhost:5173/',color:ink},{at:4.3,text:'[vite] hmr  /src/Canvas.tsx',color:muted},{at:5.05,text:'[vite] hmr  /src/styles.css',color:muted},{at:14.1,text:'[vite] hmr  /src/Tile.tsx',color:muted},{at:15.1,text:'[vite] hmr  /src/Focus.tsx',color:muted},{at:17.3,text:'✓ Client updated.',color:green},{at:19.3,text:'Listening for file changes…',color:muted}],
 [{at:2.3,text:'$ codex',type:true},{at:3.05,text:'> Review the current changes.',type:true},{at:3.8,text:'Inspect  resize boundaries',color:muted},{at:4.4,text:'Inspect  notification state',color:muted},{at:5.1,text:'Inspect  keyboard focus',color:muted},{at:14.2,text:'✓ No blocking issues found.',color:green},{at:16.8,text:'✓ Ready for your review.',color:green}],
 [{at:2.4,text:'$ git diff --stat',type:true},{at:3.25,text:'src/Canvas.tsx   | 48 +++++',color:green},{at:3.7,text:'src/TaskList.tsx | 32 ++++',color:green},{at:4.2,text:'src/styles.css  | 18 +++',color:green},{at:4.8,text:'3 files changed, 98 insertions',color:muted},{at:14.35,text:'$ git status --short',type:true},{at:15.0,text:' M src/Canvas.tsx',color:gold},{at:15.45,text:' M src/TaskList.tsx',color:gold},{at:15.9,text:' M src/styles.css',color:gold}],
];

export function TerminalOutput({id,t}:{id:number;t:number}) {
 const lines=programs[id].filter(x=>t>=x.at);
 // Scroll by line, with a short continuous ease. No real terminal timers.
 const row=30, visible=8;
 const overflow=Math.max(0,lines.length-visible);
 const newest=lines[lines.length-1];
 const lastStep=newest?Math.min(1,(t-newest.at)/.24):1;
 const scroll=overflow>0?(overflow-1+1-(1-lastStep)**3)*row:0;
 return <div style={{position:'absolute',left:1,right:1,top:35,bottom:1,borderRadius:'0 0 13px 13px',background:'#f7f7fa',overflow:'hidden'}}>
  <div style={{position:'absolute',left:24,right:14,top:18,bottom:18,overflow:'hidden',fontFamily:'"SFMono-Regular",Consolas,"Liberation Mono",monospace',fontSize:18,lineHeight:`${row}px`,fontWeight:400}}><div style={{position:'relative',top:-scroll}}>
   {lines.map((line,i)=>{const elapsed=t-line.at;const n=line.type?Math.floor(elapsed*(42+id*3)):Math.floor(elapsed*180);const text=line.text.slice(0,Math.max(0,n));const typing=n<line.text.length;
    return <div key={line.at} style={{height:row,whiteSpace:'pre',color:line.color??ink,opacity:Math.min(1,elapsed/.12)}}>{text}{i===lines.length-1&&(typing||Math.floor(t*2+id*.31)%2===0)&&<span style={{display:'inline-block',width:9,height:19,marginLeft:3,background:'#83998a',verticalAlign:'-3px',opacity:.72}}/>}</div>
   })}
  </div></div>
  <div style={{position:'absolute',left:0,right:0,top:0,height:10,background:'linear-gradient(#f7f7fa, #f7f7fa00)'}}/>
 </div>;
}
