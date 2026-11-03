import {app} from 'electron';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync,renameSync} from 'node:fs';
import {shellQuote} from './agent-notification-hooks';
export function installIslandHooks() {
 const directory=process.env.CODEX_HOME || join(homedir(),'.codex');
 const path=join(directory,'hooks.json');
 const script=app.isPackaged?join(process.resourcesPath,'island-hook.cjs'):join(app.getAppPath(),'resources/island-hook.cjs');
 const command=['/usr/bin/env','ELECTRON_RUN_AS_NODE=1',process.execPath,script].map(shellQuote).join(' ');
 const original=existsSync(path)?readFileSync(path,'utf8'):'';
 const data=original?JSON.parse(original):{};
 if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Codex hooks.json 格式无效');
 data.hooks ??= {};
 for(const event of ['UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd']) {
  const groups=data.hooks[event] ?? [];
  if(!Array.isArray(groups)) throw new Error('Codex hook 事件格式无效');
  if(!groups.some((group:any)=>group.hooks?.some((hook:any)=>hook.command===command))) groups.push({hooks:[{type:'command',command,timeout:2,async:true}]});
  data.hooks[event]=groups;
 }
 const updated=JSON.stringify(data,null,2)+'\n';
 if(updated===original)return;
 mkdirSync(directory,{recursive:true});
 if(original)copyFileSync(path,path+'.tetris-backup-'+Date.now());
 const temp=path+'.tetris-'+process.pid;writeFileSync(temp,updated,{mode:0o600});renameSync(temp,path);
}
