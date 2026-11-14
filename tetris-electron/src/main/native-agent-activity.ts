import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {app} from 'electron';
import {agentSessions,agentSessionChanges} from './agent-session-store';
import {activityPresentation} from './island-presentation';
let child:ChildProcessWithoutNullStreams|undefined;
let heartbeat:ReturnType<typeof setInterval>|undefined;
let last='';
let ready=false;
export function supportsNativeAgentActivity(){
 if(process.platform!=='darwin')return false;
 const [major=0,minor=0]=process.getSystemVersion().split('.').map(Number);
 return (major>27||(major===27&&minor>=3))&&existsSync(nativeExecutable());
}
function nativeExecutable(){
 const root=app.isPackaged?process.resourcesPath:join(app.getAppPath(),'resources');
 return join(root,'native/TetrisActivityHost.app/Contents/MacOS/TetrisActivityHost');
}
function send(force=false){
 if(!child||!ready||child.stdin.destroyed)return;
 const payload=JSON.stringify(activityPresentation(agentSessions.snapshot().sessions));
 if(!force&&last===payload)return;
 last=payload;child.stdin.write(payload+'\n');
}
export function stopNativeAgentActivity(){
 agentSessionChanges.off('change',send);
 if(heartbeat)clearInterval(heartbeat);heartbeat=undefined;
 const old=child;child=undefined;ready=false;last='';
 if(old&&!old.stdin.destroyed)old.stdin.end('stop\n');
 // Give ActivityKit time to dismiss before forcing an unresponsive helper out.
 if(old){const timeout=setTimeout(()=>old.kill(),5000);timeout.unref();old.once('exit',()=>clearTimeout(timeout));}
}
export async function startNativeAgentActivity(){
 if(child)return;
 const executable=nativeExecutable();
 if(!existsSync(executable))throw new Error('缺少原生 Live Activity 组件，请使用 Xcode 27.3+ 重新构建。');
 const helper=spawn(executable,[],{stdio:'pipe'});child=helper;
 helper.stderr.on('data',data=>console.warn('[activity]',String(data).trim()));
 await new Promise<void>((resolve,reject)=>{
  let started=false;
  const fail=(message:string)=>{
   if(child===helper)stopNativeAgentActivity();
   if(!started)reject(new Error(message));else console.error('[activity]',message);
  };
  const timeout=setTimeout(()=>fail('原生 Live Activity 启动超时。'),15000);
  const lines=createInterface({input:helper.stdout});
  lines.on('line',line=>{
   let event;try{event=JSON.parse(line)}catch{return}
   if(child!==helper)return;
   if(event.event==='ready'){ready=true;send(true)}
   else if(event.event==='updated'&&!started){started=true;clearTimeout(timeout);agentSessionChanges.on('change',send);heartbeat=setInterval(()=>send(true),30000);resolve()}
   else if(event.event==='error'){clearTimeout(timeout);fail(String(event.message))}
  });
  helper.stdin.on('error',error=>{clearTimeout(timeout);fail(error.message)});
  helper.on('error',error=>{clearTimeout(timeout);fail(error.message)});
  helper.once('exit',code=>{clearTimeout(timeout);lines.close();if(child===helper)fail(`原生 Live Activity 组件已退出 (${code})`);else if(!started)reject(new Error('原生 Live Activity 启动已取消。'));});
 });
}
