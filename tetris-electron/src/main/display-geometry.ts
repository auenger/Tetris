import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {app} from 'electron';
import {parseDisplayNotches,type DisplayNotch} from './island-position';
const exec=promisify(execFile);

export async function readDisplayNotches():Promise<DisplayNotch[]> {
 if(process.platform!=='darwin')return [];
 const root=app.isPackaged?process.resourcesPath:join(app.getAppPath(),'resources');
 try {
  const {stdout}=await exec(join(root,'native/display-geometry'),[],{timeout:3000,maxBuffer:64*1024});
  return parseDisplayNotches(JSON.parse(stdout));
 } catch(error) {
  console.warn('[island] Display geometry unavailable; using floating panel.',error instanceof Error?error.message:String(error));
  return [];
 }
}
