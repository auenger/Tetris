import {app} from 'electron';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync,renameSync} from 'node:fs';
import {islandHookConfig} from './agent-hook-command';
import {getNodeHostExecutable} from './node-host';
export function installIslandHooks() {
 const directory=process.env.CODEX_HOME || join(homedir(),'.codex');
 const path=join(directory,'hooks.json');
 const script=app.isPackaged?join(process.resourcesPath,'island-hook.cjs'):join(app.getAppPath(),'resources/island-hook.cjs');
 const original=existsSync(path)?readFileSync(path,'utf8'):'';
 const data=islandHookConfig(original?JSON.parse(original):{},getNodeHostExecutable(),script,[process.execPath]);
 const updated=JSON.stringify(data,null,2)+'\n';
 if(updated===original)return;
 mkdirSync(directory,{recursive:true});
 if(original)copyFileSync(path,path+'.tetris-backup-'+Date.now());
 const temp=path+'.tetris-'+process.pid;writeFileSync(temp,updated,{mode:0o600});renameSync(temp,path);
}
