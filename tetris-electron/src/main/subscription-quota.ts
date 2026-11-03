import {readdir,stat,open} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import type {QuotaWindow} from './provider-quota-model';
export function subscriptionWindows(record:any,now=Date.now()):QuotaWindow[]{
 const time=Date.parse(record?.timestamp),rates=record?.payload?.rate_limits;
 if(!Number.isFinite(time)||now-time>3600000||time>now+60000||!rates||(rates.limit_id&&rates.limit_id!=='codex'))return [];
 return [rates.primary,rates.secondary].filter(w=>w&&typeof w.used_percent==='number'&&Number.isFinite(w.used_percent)&&w.used_percent>=0&&w.used_percent<=100&&typeof w.resets_at==='number'&&w.resets_at*1000>now&&typeof w.window_minutes==='number'&&w.window_minutes>0).map(w=>({label:w.window_minutes===10080?'7d':w.window_minutes===300?'5h':`${w.window_minutes}m`,usedPercent:w.used_percent,resetsAt:new Date(w.resets_at*1000).toISOString()}));
}
let cached:{windows:QuotaWindow[];readAt?:number;plan?:string}={windows:[]};let nextRead=0;
export async function readSubscriptionQuota(){
 if(Date.now()<nextRead)return cached;nextRead=Date.now()+60000;
  const root = process.env.CODEX_HOME || join(homedir(), '.codex');
  const files: {path:string; time:number}[] = [];
  for (let day = 0; day < 3; day++) {
    const date = new Date(Date.now() - day * 86400000);
    const dir = join(root, 'sessions', String(date.getFullYear()), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0'));
    for (const name of await readdir(dir).catch(() => [])) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(dir,name); const info = await stat(path).catch(() => null);
      if (info) files.push({path,time:info.mtimeMs});
    }
  }

 let newest=0;let latest:any=null;
 for(const file of files.sort((a,b)=>b.time-a.time).slice(0,8)){
 try{const handle=await open(file.path,'r');try{const size=(await handle.stat()).size;const buffer=Buffer.alloc(Math.min(size,1024*1024));await handle.read(buffer,0,buffer.length,Math.max(0,size-buffer.length));
 for(const line of buffer.toString().split('\n')){try{const record=JSON.parse(line);if(subscriptionWindows(record).length&&Date.parse(record.timestamp)>newest){newest=Date.parse(record.timestamp);latest=record}}catch{}}
 }finally{await handle.close()}}catch{}
 }
 cached=latest?{windows:subscriptionWindows(latest),readAt:newest,plan:typeof latest.payload.rate_limits.plan_type==='string'?latest.payload.rate_limits.plan_type:undefined}:{windows:[]};return cached;
}
