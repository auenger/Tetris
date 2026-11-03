import {app, ipcMain, safeStorage, clipboard} from 'electron';
import {readFileSync, writeFileSync, renameSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readSubscriptionQuota} from './subscription-quota';
import {parseProviderQuota, type QuotaResult} from './provider-quota-model';
export type QuotaCard = QuotaResult & {id:string; provider:string; account:string; kind:string; keyHint?:string; readAt?:number; error?:string; history:{time:number;value:number}[]};
type Stored = {id:string;provider:string;account:string;secret:string;keyHint:string};
const endpoints: Record<string,string> = {deepseek:'https://api.deepseek.com/user/balance',openrouter:'https://openrouter.ai/api/v1/key',zhipu:'https://open.bigmodel.cn/api/monitor/usage/quota/limit',zai:'https://api.z.ai/api/monitor/usage/quota/limit'};
let accounts:Stored[]|undefined;const cards=new Map<string,QuotaCard>();const pending=new Map<string,Promise<void>>();let nextRefresh=0;
const file=()=>join(app.getPath('userData'),'provider-accounts.json');
function load(){if(accounts)return accounts;try{const data=JSON.parse(readFileSync(file(),'utf8'));if(!Array.isArray(data))throw 0;accounts=data.filter(a=>a&&typeof a.id==='string'&&Object.hasOwn(endpoints,a.provider)&&typeof a.secret==='string'&&typeof a.account==='string');}catch(error:any){if(error?.code!=='ENOENT')throw new Error('Could not read provider settings');accounts=[];}return accounts!;}
function persist(next:Stored[]){mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(file()+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file()+'.tmp',file());accounts=next;}
function base(a:Stored):QuotaCard{return {id:a.id,provider:a.provider,account:a.account,keyHint:a.keyHint,kind:'API Key',detail:'Not yet refreshed',windows:[],history:[]};}
async function refreshOne(a:Stored){if(pending.has(a.id))return pending.get(a.id);const job=(async()=>{const previous=cards.get(a.id)||base(a);try{
 if(!safeStorage.isEncryptionAvailable())throw new Error('Secure storage is unavailable');
 const key=safeStorage.decryptString(Buffer.from(a.secret,'base64'));
 const response=await fetch(endpoints[a.provider],{headers:{Authorization:a.provider==='zhipu'||a.provider==='zai'?key:`Bearer ${key}`},signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!response.ok)throw new Error(response.status===401||response.status===403?'API key is invalid or lacks permission':`Request failed (HTTP ${response.status})`);
 const result=parseProviderQuota(a.provider,await response.json());const now=Date.now();
 const history=[...previous.history];const value=result.windows[0]?.usedPercent;
 if(value!==undefined&&(!history.length||now-history[history.length-1].time>=60000))history.push({time:now,value});
 if(load().some(item=>item.id===a.id&&item.secret===a.secret))cards.set(a.id,{...base(a),...result,kind:result.plan||base(a).kind,readAt:now,history:history.slice(-96)});
 }catch(error){if(load().some(item=>item.id===a.id&&item.secret===a.secret))cards.set(a.id,{...previous,error:error instanceof Error&&/^(API|Request|Secure|Quota|Invalid|Balance|No plan)/.test(error.message)?error.message:'Connection failed. Please try again.'});}
 })().finally(()=>pending.delete(a.id));pending.set(a.id,job);return job;}
export async function getQuotaCards(refresh=false):Promise<QuotaCard[]>{
 const saved=load();if(refresh||Date.now()>nextRefresh){nextRefresh=Date.now()+300000;await Promise.all(saved.map(refreshOne));}
 const subscription=await readSubscriptionQuota();
 const previous=cards.get('codex-local');let history=previous?.history||[];const value=subscription.windows.find(w=>w.label==='7d')?.usedPercent;
 if(value!==undefined&&subscription.readAt&&history.at(-1)?.time!==subscription.readAt){if(history.length&&value<history[history.length-1].value)history=[];history=[...history,{time:subscription.readAt,value}].slice(-96)}
 const local:QuotaCard={id:'codex-local',provider:'Codex',account:'Local Codex',kind:subscription.plan?`${subscription.plan} · Subscription`:'Subscription · Local snapshot',detail:'Local subscription snapshot · Not live; expires after 1 hour',windows:subscription.windows,readAt:subscription.readAt,history:subscription.windows.length?history:[]};cards.set(local.id,local);
 return [local,...load().map(a=>cards.get(a.id)||base(a))];
}
export function copyProviderKey(id:unknown){
 if(typeof id!=='string')throw new Error('Invalid account');
 const account=load().find(a=>a.id===id);if(!account)throw new Error('Account not found');
 if(!safeStorage.isEncryptionAvailable())throw new Error('Secure storage is unavailable');
 clipboard.writeText(safeStorage.decryptString(Buffer.from(account.secret,'base64')));
}
export function registerProviderQuotas(settingsURL:()=>string){
 function verify(event:Electron.IpcMainInvokeEvent){if(event.senderFrame?.url!==settingsURL())throw new Error('Provider management is only available in Settings');}
 ipcMain.handle('quotas:copy-key',(event,id)=>{verify(event);copyProviderKey(id)});
 ipcMain.handle('quotas:list',async event=>{verify(event);return getQuotaCards()});
 ipcMain.handle('quotas:refresh',async event=>{verify(event);return getQuotaCards(true)});
 ipcMain.handle('quotas:save',async(event,input)=>{verify(event);if(!input||!Object.hasOwn(endpoints,input.provider)||typeof input.account!=='string'||!input.account.trim()||input.account.length>120||typeof input.key!=='string'||!input.key.trim()||input.key.length>4096)throw new Error('Enter a provider, account name, and valid API key');
 if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw new Error('Secure storage is unavailable. API key was not saved.');
 const existing=load();if(existing.length>=20)throw new Error('Up to 20 accounts are supported');
 const key=input.key.trim();const a:Stored={id:randomUUID(),provider:input.provider,account:input.account.trim(),secret:safeStorage.encryptString(key).toString('base64'),keyHint:'••••'+key.slice(-4)};
 persist([...existing,a]);await refreshOne(a);return getQuotaCards();});
 ipcMain.handle('quotas:remove',async(event,id)=>{verify(event);persist(load().filter(a=>a.id!==id));cards.delete(id);return getQuotaCards()});
}
