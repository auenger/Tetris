// Slice the imagegen artwork into genuine state-specific GIFs. No geometric animation.
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const names=['codex','claude-code','gpt','claude','glm','deepseek'];
const states=['idle','working','attention','done'];
const output=join(root,'resources/dynamic-island/avatars/animated');
await mkdir(output,{recursive:true});
const manifest={size:96,columns:4,rows:4,avatars:{}};
for(const name of names){
 const source=join(root,'artwork/island-avatars',`${name}.png`);
 const {width,height}=await sharp(source).metadata();
 if(width!==height)throw new Error(`Expected square 4x4 sheet: ${source}`);
 const cell=width/4;manifest.avatars[name]={};
 for(const [row,state] of states.entries()){
  const frames=await Promise.all([0,1,2,3].map(col=>sharp(source).extract({left:Math.round(col*cell),top:Math.round(row*cell),width:Math.round((col+1)*cell)-Math.round(col*cell),height:Math.round((row+1)*cell)-Math.round(row*cell)}).resize(96,96).ensureAlpha().raw().toBuffer()));
  if(new Set(frames.map(frame=>createHash('sha256').update(frame).digest('hex'))).size<2)throw new Error(`Static frames: ${name} ${state}`);
  const sequence=state==='idle'?[0,1,2,1,3]:[0,1,2,3,2,1];
  const delays=state==='idle'?[1800,100,140,100,1200]:state==='working'?[180,180,180,180,180,180]:[380,180,260,500,260,180];
  const basename=`${name}-${state}`;
  await sharp(Buffer.concat(sequence.map(i=>frames[i])),{raw:{width:96,height:96*sequence.length,channels:4,pageHeight:96}}).gif({loop:0,delay:delays,effort:7,dither:0}).toFile(join(output,basename+'.gif'));
  await sharp(frames[0],{raw:{width:96,height:96,channels:4}}).png().toFile(join(output,basename+'.png'));
  const meta=await sharp(join(output,basename+'.gif'),{animated:true}).metadata();
  if((meta.pages||0)<4||!meta.hasAlpha||meta.delay?.some(delay=>delay<=0))throw new Error(`Invalid transparent animation: ${basename}`);
  manifest.avatars[name][state]={frames:meta.pages,delay:meta.delay};
 }
}
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Built 24 transparent GIF animations and 24 reduced-motion stills.');
