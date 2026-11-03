import React from 'react';
import {AbsoluteFill,CanvasImage,Composition,registerRoot,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {progress as p,windowed,cubic,terminalEntrance} from './anime-motion.mjs';
import {TerminalOutput} from './terminal-output';
import './v3-fonts';

const C={bg:'#f2f3ee',ink:'#26362e',muted:'#79857c',line:'#d4ddd2',green:'#547960',gold:'#b28a4d'};
const sans='"Tetris V3", "PingFang SC", sans-serif';
const cameras=[[0,915,363,.82],[5.5,915,363,.82],[6.3,2510,325,.94],[9.5,2510,325,.94],[10.3,2450,1025,.94],[13.5,2450,1025,.94],[14.3,915,363,.82],[20.1,915,363,.82],[20.8,1535,185,1.55],[21.8,1535,185,1.55],[22.65,1640,655,.47],[28,1640,655,.47]];
function camera(t:number){let k=0;while(k<cameras.length-2&&t>cameras[k+1][0])k++;const a=cameras[k],b=cameras[k+1],q=p(t,a[0],b[0]-a[0],'inOutQuint');return a.slice(1).map((v,i)=>v+(b[i+1]-v)*q)}
function Icon({size=40}:{size?:number}){return <CanvasImage src={staticFile('icon.png')} width={size*2} height={size*2} style={{width:size,height:size,borderRadius:size*.18}}/>}
function Badge({children,color=C.green}:{children:React.ReactNode;color?:string}){return <span style={{display:'inline-flex',alignItems:'center',gap:9,padding:'10px 17px',borderRadius:99,border:`1px solid ${color}30`,background:'#ffffffd9',fontSize:17,color,whiteSpace:'nowrap'}}><span style={{width:5,height:5,borderRadius:9,background:color}}/>{children}</span>}
function Trace({w,h,amount,color=C.gold,opacity=1}:{w:number;h:number;amount:number;color?:string;opacity?:number}){return <svg width={w+8} height={h+8} style={{position:'absolute',inset:-4,overflow:'visible',pointerEvents:'none',opacity}}><rect x="3" y="3" width={w+2} height={h+2} rx="17" fill="none" stroke={color} strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1-amount}/></svg>}
function Tile({name,x,y,w,h,t,highlight=0,reveal=1,dy=0,scale=1}:{name:string;x:number;y:number;w:number;h:number;t:number;highlight?:number;reveal?:number;dy?:number;scale?:number}){
 const terminal=name.startsWith('term');return <div style={{position:'absolute',left:x,top:y+dy,width:w,height:h,opacity:reveal,scale,transformOrigin:'50% 50%'}}>
 <div style={{position:'absolute',inset:0,borderRadius:15,background:'#fff',boxShadow:`0 15px 38px #263b2912, 0 2px 5px #25332c0a`,border:`1px solid ${highlight>.1?'#b9cbb8':'#cfd8cc'}`,overflow:'hidden'}}>
 <CanvasImage src={staticFile(`v2/${name}.png`)} width={w*2} height={h*2} style={{width:w,height:h,display:'block'}}/>
 {terminal&&<TerminalOutput id={Number(name.slice(4))} t={t}/>}
 <div style={{position:'absolute',inset:0,borderRadius:14,boxShadow:'inset 0 1px 0 #ffffffdd',pointerEvents:'none'}}/>
 </div>
 <Trace w={w} h={h} amount={Math.min(1,highlight*2)} opacity={highlight} color={C.green}/>
 </div>
}
function Connection({t,at,from,to,label}:{t:number;at:number;from:[number,number];to:[number,number];label:string}){
 const q=p(t,at,1.1,'inOutCubic'),visible=windowed(t,at,at+2.4,.35),dx=to[0]-from[0];
 const x=cubic(from[0],from[0]+dx*.4,to[0]-dx*.4,to[0],q),y=cubic(from[1],from[1],to[1],to[1],q);
 return <g opacity={visible}><path d={`M${from[0]} ${from[1]}C${from[0]+dx*.4} ${from[1]} ${to[0]-dx*.4} ${to[1]} ${to[0]} ${to[1]}`} fill="none" stroke="#96ac94" strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1-q}/><circle cx={x} cy={y} r="6" fill={C.green}/><g transform={`translate(${x-40} ${y-36})`} opacity={Math.sin(q*Math.PI)}><rect width="80" height="25" rx="8" fill="#fff" stroke={C.line}/><text x="40" y="17" textAnchor="middle" fill={C.green} fontSize="14">{label}</text></g></g>
}
function Cursor({x,y,t,at}:{x:number;y:number;t:number;at:number}){const q=p(t,at,.6,'outCubic');return <div style={{position:'absolute',left:x,top:y,opacity:windowed(t,at-.45,at+.8)}}><div style={{position:'absolute',left:-24,top:-24,width:48,height:48,border:`2px solid ${C.gold}`,borderRadius:99,scale:.5+q*1.4,opacity:1-q}}/><svg width="28" height="34" viewBox="0 0 28 34"><path d="M3 2L25 22L15 23L11 32Z" fill={C.ink} stroke="white" strokeWidth="2"/></svg></div>}
function Workspace({t}:{t:number}){
 const [cx,cy,z]=camera(t),entrance=terminalEntrance(t);
 const collapse=p(t,15.3,.5,'inOutCubic')*(1-p(t,16.6,.5,'inOutCubic'));
 const groupActive=windowed(t,14.3,17.8,.45),testActive=windowed(t,18.65,22,.5);
 return <div style={{position:'absolute',left:80,top:282,width:1760,height:690,borderRadius:24,opacity:windowed(t,1.65,25.35,.45),overflow:'hidden',background:'#e9eee5',border:'1px solid #d0dacd',boxShadow:'0 18px 60px #263a2a0b, inset 0 1px 0 #ffffff'}}>
 <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(#bcc9b6 1px, transparent 1px)',backgroundSize:'25px 25px',opacity:.46,willChange:'opacity'}}/>
 <div style={{position:'absolute',left:880-cx*z,top:345-cy*z,width:3400,height:1400,scale:z,transformOrigin:'0 0'}}>
 <div style={{position:'absolute',left:-18,top:-46,width:1866,height:432-350*collapse,borderRadius:21,border:`1.5px solid ${groupActive>.1?'#b99b66':'#c8d4c2'}`,background:'#f4f7ef',boxShadow:'inset 0 1px 0 white'}}><div style={{position:'absolute',left:20,top:13,width:1825,display:'flex',justifyContent:'space-between',fontSize:17,color:'#758470'}}><span>Launch workspace</span><span>3 TERMINALS　⌄</span></div><Trace w={1866} h={432-350*collapse} amount={p(t,14.3,.8)} opacity={groupActive} /></div>
 <div style={{position:'absolute',left:-5,top:-5,width:1845,height:380*(1-collapse),overflow:'hidden'}}>{[0,1,2].map(i=><Tile key={i} name={`term${i}`} x={5+i*620} y={5} w={590} h={370} t={t} reveal={entrance[i].opacity} dy={entrance[i].y} scale={entrance[i].scale} highlight={i===2?testActive:0}/>)}</div>
 {[3,4,5].map(i=><Tile key={i} name={`term${i}`} x={(i-3)*620} y={400-350*collapse} w={590} h={370} t={t} reveal={entrance[i].opacity} dy={entrance[i].y} scale={entrance[i].scale}/>)}
 <div style={{opacity:Math.min(1,p(t,5.5,.3)*(1-p(t,13.6,.3))+p(t,21.8,.5))}}>
 <Tile name="doc" x={1950} y={0} w={680} h={650} t={t} highlight={windowed(t,6.3,7.6,.5)}/>
 <Tile name="image" x={2670} y={0} w={620} h={470} t={t} highlight={windowed(t,7.3,8.7,.5)}/>
 <div style={{position:'absolute',left:2680,top:516,width:590,opacity:Math.min(1,windowed(t,6,9.8)+p(t,22.3)),color:C.muted,fontSize:24,lineHeight:1.8}}>PLAN.md　/　preview.png<br/><span style={{fontSize:18}}>文档和图片，就在实现旁边。</span></div>
 <Tile name="browser" x={1950} y={700} w={1000} h={650} t={t} highlight={windowed(t,10.45,12,.5)}/>
 <div style={{position:'absolute',left:2990,top:850,width:300,color:C.green,fontSize:34,lineHeight:1.6}}>写代码。<br/>看结果。<br/><span style={{fontSize:19,color:C.muted}}>留在同一张画布。</span><div style={{marginTop:24,opacity:p(t,11.1)}}><Badge>浏览器画布</Badge></div></div>
 </div>
 <svg width="3400" height="1400" style={{position:'absolute',left:0,top:0,overflow:'visible',pointerEvents:'none'}}><Connection t={t} at={6.55} from={[2630,570]} to={[2980,470]} label="预览"/><Connection t={t} at={10.45} from={[2800,600]} to={[2860,700]} label="浏览器"/></svg>
 <div style={{position:'absolute',left:0,top:900,width:1800,fontSize:43,color:'#7b8e72',display:'flex',alignItems:'center',gap:25}}><Icon size={85}/><span>终端 · 文件 · 浏览器</span></div>
 <svg width="3400" height="1400" style={{position:'absolute',left:0,top:0,opacity:windowed(t,22.7,25.3,.4),pointerEvents:'none'}}><path d="M920 820V1110H1885V325H1915M1885 1025H1915" fill="none" stroke="#8fa88b" strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={1-p(t,22.7,1.2,'inOutCubic')}/></svg>
 </div>
 <div style={{position:'absolute',right:22,bottom:18,padding:'7px 12px',fontSize:14,color:'#74846e',border:'1px solid #d5dece',borderRadius:9,background:'#f7f9f3'}}>{Math.round(z*100)}%</div>
 <div style={{position:'absolute',right:28,top:25,width:430,borderRadius:18,background:'#ffffff',border:'1px solid #c8d7c2',boxShadow:'0 18px 50px #263e2920',overflow:'hidden',opacity:windowed(t,18.65,20.5),translate:`${30*(1-p(t,18.65,.5))}px 0px`,scale:.96+.04*p(t,18.65,.6)}}>
 <div style={{fontSize:17,color:C.muted,padding:'17px 21px',borderBottom:'1px solid #e6ebe2'}}>消息提醒　<span style={{float:'right',color:C.green}}>1 条新消息</span></div>
 <div style={{padding:24,borderLeft:`3px solid ${C.gold}`}}><div style={{fontSize:22,color:C.ink}}>Tests · Claude Code</div><div style={{fontSize:17,color:C.muted,marginTop:9}}>回复完成 · 未读</div><div style={{fontSize:23,color:C.green,marginTop:17}}>✓ 12 项检查通过。</div></div>
 </div>
 <Cursor x={1600} y={45} t={t} at={15.3}/><Cursor x={1600} y={45} t={t} at={16.6}/><Cursor x={1500} y={155} t={t} at={20.15}/>
 </div>;
}
const captions=[
 [2,5.8,'01 / MULTIPLE TERMINALS','多个终端，同时展开。','实现、测试、审查与服务，各自推进。'],
 [6,9.8,'02 / FILE PREVIEW','文件，就在画布上预览。','需求文档与图片素材，始终贴近工作现场。'],
 [10,13.8,'03 / BROWSER CANVAS','浏览器，也在你的画布里。','代码与页面并排，结果抬眼可见。'],
 [14,17.8,'04 / WORKSPACE GROUPS','把一个任务，收成一组。','相关终端一起整理，收起后继续运行。'],
 [18,21.9,'05 / STAY IN FOCUS','完成提醒，带你回到结果。','点一下，定位对应终端。'],
 [22.1,25,'06 / ONE WORKSPACE','所有上下文，在同一处。','终端、文件、浏览器。一个完整的工作空间。'],
] as const;
function Headlines({t}:{t:number}){return <>{captions.map(([a,b,kicker,title,sub])=><div key={a} style={{position:'absolute',left:100,top:104,opacity:windowed(t,a-.18,b+.1)}}><div style={{fontSize:14,letterSpacing:2.5,color:C.gold,marginBottom:10}}>{kicker}</div><div style={{fontSize:61,fontWeight:600,lineHeight:1.25,letterSpacing:-2}}>{[...title].map((char,i)=><span key={i} style={{display:'inline-block',opacity:p(t,a-.16+i*.018,.38),translate:`0px ${15*(1-p(t,a-.16+i*.018,.48))}px`}}>{char}</span>)}</div><div style={{fontSize:24,marginTop:13,color:C.muted,opacity:p(t,a+.12,.5)}}>{sub}</div></div>)}</>}
function Rail({t}:{t:number}){const active=t<6?0:t<10?1:t<14?2:t<18?3:t<22?4:5;return <div style={{position:'absolute',left:100,right:100,top:1000,display:'flex',alignItems:'center',justifyContent:'space-between',opacity:windowed(t,2,25.2)}}><div style={{display:'flex',gap:11}}>{['多个终端','文件预览','浏览器','分组整理','完成提醒','同一画布'].map((x,i)=><div key={x} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 13px',borderRadius:9,fontSize:14,color:i===active?C.green:'#94a08f',background:i===active?'#e7eee2':'transparent',border:`1px solid ${i===active?'#ccd9c5':'transparent'}`}}><span style={{width:5,height:5,borderRadius:99,background:i===active?C.green:'#c7d0c2'}}/>{x}</div>)}</div><div style={{fontSize:12,color:'#97a08f'}}>产品场景演绎 · 终端输出为示例</div></div>}
function Hero({t}:{t:number}){const opening=1-p(t,1.55,.35,'inOutSine'),closing=p(t,25,.6,'inOutSine');return <>
 <div style={{position:'absolute',left:100,top:260,opacity:opening,translate:`0px ${20*(1-p(t,0,.7))}px`}}><Badge>TERMINALS. REIMAGINED.</Badge><div style={{display:'flex',alignItems:'center',gap:19,marginTop:32}}><Icon size={100}/><span style={{fontSize:89,fontWeight:600,letterSpacing:-4}}>Tetris</span></div><div style={{fontSize:76,fontWeight:600,lineHeight:1.3,letterSpacing:-3,marginTop:28}}>把终端展开。<br/><span style={{color:C.green}}>让思路连起来。</span></div><div style={{fontSize:23,color:C.muted,marginTop:26}}>终端、文件、浏览器。在同一张画布。</div></div>
 <div style={{position:'absolute',left:1035,top:220,width:750,height:720,opacity:opening}}>{[0,1,2].map((id)=><div key={id} style={{position:'absolute',left:35+id*20,top:id*160,rotate:`${[-5,2,-2][id]*(1-p(t,1.3,.65))}deg`,translate:`${80*(1-p(t,.12+id*.14,.8))}px 0px`,opacity:p(t,.08+id*.14,.65)}}><Tile name={`term${id}`} x={0} y={0} w={650} h={408} t={t+2.9+id*.3}/></div>)}</div>
 <div style={{position:'absolute',inset:0,opacity:closing,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',translate:`0px ${25*(1-closing)}px`}}>
 <div style={{display:'flex',alignItems:'center',gap:27}}><Icon size={150}/><span style={{fontSize:124,fontWeight:600,letterSpacing:-6}}>Tetris</span></div><div style={{fontSize:47,fontWeight:500,marginTop:30}}>把终端，变成你的工作空间。</div><div style={{display:'flex',gap:14,marginTop:34}}>{['多个终端','文件预览','浏览器画布'].map((x,i)=><div key={x} style={{opacity:p(t,25.4+i*.1,.5),translate:`0px ${14*(1-p(t,25.4+i*.1,.5))}px`}}><Badge>{x}</Badge></div>)}</div><div style={{fontSize:21,color:C.muted,marginTop:40}}>github.com/auenger/Tetris　↗</div>
 </div>
 </>}
export function FilmV3(){const f=useCurrentFrame(),{fps}=useVideoConfig(),t=f/fps;return <AbsoluteFill style={{background:C.bg,color:C.ink,fontFamily:sans}}><style>{'*{box-sizing:border-box}'}</style><Audio src={staticFile('soundtrack-v3.wav')}/><div style={{position:'absolute',right:-80,top:-350,width:1300,height:1100,background:'radial-gradient(ellipse,#e2eacb88,transparent 68%)',opacity:.8}}/><Workspace t={t}/><Headlines t={t}/><Rail t={t}/><Hero t={t}/><div style={{position:'absolute',left:96,top:33,display:'flex',alignItems:'center',gap:11,fontSize:24,fontWeight:600,opacity:windowed(t,1.6,25.4)}}><Icon size={33}/>Tetris</div><div style={{position:'absolute',right:95,top:45,fontSize:13,letterSpacing:2,color:'#8c9985',opacity:windowed(t,1.6,25.4)}}>A CANVAS FOR YOUR WORK</div></AbsoluteFill>}
registerRoot(()=> <Composition id="TetrisV3" component={FilmV3} durationInFrames={840} fps={30} width={1920} height={1080}/>);
