import React from 'react';
import {AbsoluteFill,CanvasImage,Composition,interpolate,Easing,registerRoot,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
const C={bg:'#eff0ec',ink:'#242925',muted:'#6f766f',accent:'#b88b49',border:'#d1d5ce'};
const sans='"Helvetica Neue", "PingFang SC", sans-serif';
const mono='Menlo, monospace';
const opts={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const,easing:Easing.bezier(.65,0,.2,1)};
const ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const enter=(t:number,a:number,d=.55)=>ease((t-a)/d);
const windowed=(t:number,a:number,b:number)=>enter(t,a,.3)*(1-enter(t,b-.3,.3));
function Cursor({x,y,click=0}:{x:number,y:number,click?:number}){return <div style={{position:'absolute',left:x,top:y,zIndex:30}}><div style={{position:'absolute',left:-24,top:-24,width:60,height:60,border:'2px solid '+C.accent,borderRadius:'50%',opacity:click,scale:1+(1-click)*.3}}/><svg width="29" height="35" viewBox="0 0 30 36"><path d="M3 2L26 22L16 23L12 33Z" fill={C.ink} stroke="white" strokeWidth="2"/></svg></div>}
function Tile({name,x,y,w,h,opacity=1}:{name:string,x:number,y:number,w:number,h:number,opacity?:number}){return <div style={{position:'absolute',left:x,top:y,width:w,height:h,opacity,boxShadow:'0 8px 24px #303b3010',overflow:'hidden',background:'#f8f8f8'}}><CanvasImage src={staticFile(`v2/${name}.png`)} style={{width:w,height:h,display:'block'}}/></div>}
const cameras=[
[0,915,385,.86],[2,915,385,.86],[5.5,915,385,.86],
[6.3,2510,325,1.04],[9.5,2510,325,1.04],
[10.3,2450,1025,1.03],[13.5,2450,1025,1.03],
[14.3,915,385,.86],[17.5,915,385,.86],
[18.3,915,385,.86],[20.1,915,385,.86],
[20.8,1535,185,1.62],[21.8,1535,185,1.62],
[22.55,1640,655,.49],[25,1640,655,.49],[28,1640,655,.49]
];
function Workspace(){const f=useCurrentFrame(),{fps}=useVideoConfig(),t=f/fps;
 const cx=interpolate(t,cameras.map(x=>x[0]),cameras.map(x=>x[1]),opts),cy=interpolate(t,cameras.map(x=>x[0]),cameras.map(x=>x[2]),opts),z=interpolate(t,cameras.map(x=>x[0]),cameras.map(x=>x[3]),opts);
 const collapse=enter(t,15.3,.35)*(1-enter(t,16.6,.4));
 const reveal=enter(t,1.7,.65),out=1-enter(t,25,.65);
 return <div style={{position:'absolute',left:72,top:250,width:1776,height:744,opacity:reveal*out,overflow:'hidden',borderRadius:16,border:'1px solid '+C.border,background:'#e7eae3'}}>
 <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(#b5bcb0 1px, transparent 1px)',backgroundSize:'24px 24px',opacity:.45}}/>
 <div style={{position:'absolute',left:888-cx*z,top:372-cy*z,scale:z,transformOrigin:'0 0'}}>
 <div style={{position:'absolute',left:-16,top:-43,width:1862,height:428-350*collapse,background:'#f1f3ee',border:`${t>=14&&t<18?2:1}px solid ${t>=14&&t<18?C.accent:'#c4cbbd'}`,borderRadius:10}}><div style={{position:'absolute',left:18,top:12,fontSize:18,color:'#636e5d',display:'flex',justifyContent:'space-between',width:1825}}><span>⠿　Launch workspace</span><span>3　⌄　 ⛶</span></div></div>
 <div style={{position:'absolute',left:0,top:0,width:1840,height:370*(1-collapse),overflow:'hidden'}}>{[0,1,2].map(i=><Tile key={i} name={'term'+i} x={i*620} y={0} w={590} h={370} opacity={.5+.5*enter(t,1.85+i*.12,.4)}/>)}</div>
 {[3,4,5].map(i=><Tile key={i} name={'term'+i} x={(i-3)*620} y={400-350*collapse} w={590} h={370} opacity={.5+.5*enter(t,2.2+(i-3)*.12,.4)}/>)}
 <Tile name="doc" x={1950} y={0} w={680} h={650}/>
 <Tile name="image" x={2670} y={0} w={620} h={470}/>
 <div style={{position:'absolute',left:2685,top:500,width:580,color:'#75816f',fontSize:25,lineHeight:1.8}}>PLAN.md　/　preview.png<br/><span style={{fontSize:18}}>文档和图片，就在实现旁边。</span></div>
 <Tile name="browser" x={1950} y={700} w={1000} h={650}/>
 <div style={{position:'absolute',left:2990,top:860,width:290,fontSize:35,color:'#5e6d55',lineHeight:1.6}}>写代码。<br/>看结果。<br/><span style={{color:'#87917f',fontSize:22}}>留在同一张画布。</span></div>
 <div style={{position:'absolute',left:0,top:880,width:1800,display:'flex',alignItems:'center',gap:28,color:'#87917f',fontSize:40}}><CanvasImage src={staticFile('icon.png')} style={{width:90,height:90}}/><span>终端 · 文件 · 浏览器</span></div>
 </div>
 <div style={{position:'absolute',right:22,bottom:18,fontFamily:mono,fontSize:16,color:'#7d8775',background:'#f5f6f1',padding:'7px 12px',borderRadius:5}}>{Math.round(z*100)}%</div>
 <div style={{position:'absolute',left:0,right:0,bottom:0,height:0}}/>
 {t>=14.5&&t<17.7&&<Cursor x={1585} y={63} click={Math.max(0,1-Math.abs(t-15.3)/.16)}/>}
 <div style={{position:'absolute',right:28,top:24,width:440,opacity:windowed(t,18.65,20.6),translate:`0px ${18*(1-enter(t,18.65,.3))}px`,border:'1px solid #c6cdc0',borderRadius:11,background:'#fbfcf8',boxShadow:'0 15px 40px #2733251c',overflow:'hidden'}}><div style={{padding:'15px 18px',borderBottom:'1px solid #dfe3d9',fontSize:20,color:'#495443'}}>消息提醒 · 1 <span style={{float:'right',color:'#87917e'}}>✓　⌄</span></div><div style={{borderLeft:'3px solid '+C.accent,padding:'18px 20px',fontSize:23,lineHeight:1.5}}><div>Tests · Claude Code</div><div style={{fontSize:16,color:'#87917e',margin:'4px 0 12px'}}>回复完成 · 未读</div><div style={{fontSize:20}}>12 项检查通过。可以查看结果。</div></div></div>
 {t>=19.6&&t<20.5&&<Cursor x={1515} y={155} click={Math.max(0,1-Math.abs(t-20.15)/.16)}/>}
 </div>
}
const captions=[
 [2,5.8,'多个终端，同时展开。','实现、测试、审查与服务，各就各位。'],
 [6,9.8,'文件，就在画布上预览。','需求文档与图片素材，始终贴近工作现场。'],
 [10,13.8,'浏览器，也在你的画布里。','代码与页面并排，结果抬眼可见。'],
 [14,17.8,'把一个任务，收成一组。','相关终端一起整理，收起后继续运行。'],
 [18,21.9,'完成提醒，带你回到结果。','点一下，定位对应终端。'],
 [22.1,25,'所有上下文，在同一处。','终端、文件、浏览器。一个完整的工作空间。']
];
function Headlines(){const f=useCurrentFrame(),{fps}=useVideoConfig(),t=f/fps;return <>{captions.map(([a,b,title,sub])=><div key={a} style={{position:'absolute',left:104,top:82,opacity:windowed(t,Number(a)-.15,Number(b)+.1),translate:`0px ${12*(1-enter(t,Number(a)-.15,.3))}px`}}><div style={{fontSize:64,fontWeight:550,letterSpacing:-2.5,color:C.ink}}>{title}</div><div style={{fontSize:25,marginTop:20,color:C.muted}}>{sub}</div></div>)}</>}
function IntroOutro(){const f=useCurrentFrame(),{fps}=useVideoConfig(),t=f/fps;const opening=1-enter(t,1.6,.4),closing=enter(t,25,.55);return <><div style={{position:'absolute',left:104,top:230,opacity:opening}}><div style={{display:'flex',alignItems:'center',gap:20}}><CanvasImage src={staticFile('icon.png')} style={{width:125,height:125}}/><span style={{fontSize:95,fontWeight:600,letterSpacing:-4}}>Tetris</span></div><div style={{fontSize:88,fontWeight:550,lineHeight:1.25,letterSpacing:-4,marginTop:28}}>把终端展开。<br/><span style={{color:C.accent}}>让思路连起来。</span></div></div><div style={{position:'absolute',left:1120,top:220,opacity:opening,rotate:'-4deg'}}><div style={{width:590,height:370,translate:`${24*(1-enter(t,0,.65))}px 0px`,boxShadow:'0 35px 80px #2432251c'}}><CanvasImage src={staticFile('v2/term0.png')} style={{width:590,height:370}}/></div><div style={{width:590,height:370,marginLeft:70,marginTop:-70,translate:`${40*(1-enter(t,.15,.65))}px 0px`,boxShadow:'0 35px 80px #2432251c'}}><CanvasImage src={staticFile('v2/term1.png')} style={{width:590,height:370}}/></div></div>
 <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',opacity:closing,translate:`0px ${20*(1-closing)}px`}}><div style={{display:'flex',alignItems:'center',gap:25}}><CanvasImage src={staticFile('icon.png')} style={{width:165,height:165}}/><div style={{fontSize:126,fontWeight:600,letterSpacing:-6}}>Tetris</div></div><div style={{fontSize:48,marginTop:30}}>把终端，变成你的工作空间。</div><div style={{fontFamily:mono,fontSize:23,color:C.muted,marginTop:47}}>github.com/auenger/Tetris　↗</div></div></>}
function Brand(){const f=useCurrentFrame(),{fps}=useVideoConfig(),t=f/fps;return <div style={{position:'absolute',right:88,top:45,display:'flex',alignItems:'center',gap:10,fontSize:23,fontWeight:600,opacity:windowed(t,1.6,25.5)}}><CanvasImage src={staticFile('icon.png')} style={{width:43,height:43}}/>Tetris</div>}
function Film(){return <AbsoluteFill style={{background:C.bg,color:C.ink,fontFamily:sans}}><Audio src={staticFile('soundtrack-v2.wav')}/><Workspace/><Headlines/><IntroOutro/><Brand/></AbsoluteFill>}
registerRoot(()=> <Composition id="TetrisV2" component={Film} durationInFrames={840} fps={30} width={1920} height={1080}/>);
