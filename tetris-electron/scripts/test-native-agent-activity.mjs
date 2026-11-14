import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const app=join(root,'resources/native/TetrisActivityHost.app');
execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',app]);
execFileSync('/usr/bin/pluginkit',['-a',join(app,'Contents/PlugIns/TetrisActivityWidget.appex')]);
const child=spawn(join(app,'Contents/MacOS/TetrisActivityHost'),[],{stdio:['pipe','pipe','inherit']});
const lines=createInterface({input:child.stdout});
const statuses=['working','attention','done','idle','unknown'];
const labels=['工作中 1','待处理 1','新完成 1','空闲','未接入'];
const symbols=['arrow.triangle.2.circlepath','exclamationmark.circle.fill','checkmark.circle.fill','pause.circle','questionmark.circle'];
let index=0,verified=0;
const preview=process.argv.includes('--preview');
const timeout=setTimeout(()=>{console.error('Native Activity lifecycle timed out');child.stdin.end('stop\n');setTimeout(()=>child.kill(),3000).unref();process.exitCode=1},preview?120000:45000);
function update(){child.stdin.write(JSON.stringify({status:statuses[index],label:labels[index],symbol:symbols[index],working:index===0?1:0,waiting:index===1?1:0,unread:index===2?1:0,total:1,avatar:0,sessions:[{id:'native-preview',title:'原生 Live Activity 验证',agent:'Tetris · 演示数据',status:statuses[index],unread:index===2}]})+'\n')}
lines.on('line',line=>{
 let event;try{event=JSON.parse(line)}catch{return}
 console.log(event);
 if(event.event==='ready')update();
 if(event.event==='error'){process.exitCode=1;child.stdin.end('stop\n')}
 if(event.event==='updated'){
  verified++;
  if(++index<statuses.length)setTimeout(update,preview?15000:1000);
  else child.stdin.end('stop\n');
 }
});
child.on('error',error=>{console.error(error);process.exitCode=1});
child.on('exit',code=>{clearTimeout(timeout);lines.close();if(code!==0||verified!==statuses.length)process.exitCode=1;else console.log('Native start, five status updates and end verified.');});
process.on('SIGINT',()=>child.stdin.end('stop\n'));
