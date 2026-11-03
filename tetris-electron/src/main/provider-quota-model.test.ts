import {describe,it,expect} from 'bun:test';
import {parseProviderQuota} from './provider-quota-model';
describe('provider quota semantics',()=>{
 it('keeps API currency balances separate from percentage quotas',()=>{expect(parseProviderQuota('deepseek',{is_available:true,balance_infos:[{currency:'CNY',total_balance:'110.00'}]})).toEqual({balance:'¥110.00',detail:'Available API balance · Includes credits',windows:[]})});
 it('never interprets an uncapped key as unlimited account credits',()=>{const r=parseProviderQuota('openrouter',{data:{limit:null,limit_remaining:null,usage:10}});expect(r.balance).toBeUndefined();expect(r.windows).toHaveLength(0);expect(r.detail).toContain('Account balance unknown')});
 it('uses used percentages and remaining money distinctly',()=>{const r=parseProviderQuota('openrouter',{data:{limit:100,limit_remaining:74.5,usage:25.5,limit_reset:'monthly'}});expect(r.balance).toBe('$74.50');expect(r.windows[0].usedPercent).toBeCloseTo(25.5)});
 it('rejects malformed responses',()=>{expect(()=>parseProviderQuota('deepseek',{balance_infos:[]})).toThrow();expect(()=>parseProviderQuota('openrouter',{data:{}})).toThrow()});
});
describe('GLM Coding Plan compatibility',()=>{
 for(const provider of ['zhipu','zai'])it(`${provider}: reads legacy and credit quotas, separate MCP and reset timestamps`,()=>{
 const result=parseProviderQuota(provider,{success:true,data:{level:'pro',limits:[{type:'TOKENS_LIMIT',unit:3,number:5,percentage:3,nextResetTime:1800000000000},{type:'CREDIT_LIMIT',unit:6,number:7,percentage:29},{type:'TIME_LIMIT',unit:5,number:1,percentage:10}]}});
 expect(result.plan).toBe('GLM Coding pro');expect(result.windows.map(w=>w.label)).toEqual(['5h','7d','MCP · Monthly']);expect(result.windows[0].resetsAt).toBe(new Date(1800000000000).toISOString());expect(result.windows[1].resetsAt).toBeUndefined();
 });
 it('does not invent zero usage for missing or failed data',()=>{expect(()=>parseProviderQuota('zai',{success:false,data:{limits:[]}})).toThrow();expect(()=>parseProviderQuota('zhipu',{data:{limits:[{type:'CREDIT_LIMIT',unit:6}]}})).toThrow();expect(parseProviderQuota('zai',{data:{limits:[]}}).detail).toContain('No plan usage returned')});
 it('accepts count-based MCP usage and zero usage',()=>{const r=parseProviderQuota('zai',{data:{limits:[{type:'TIME_LIMIT',usage:100,currentValue:10},{type:'TOKENS_LIMIT',percentage:0}]}});expect(r.windows.map(w=>w.usedPercent)).toEqual([10,0])});
});
