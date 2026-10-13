import { test, expect } from 'bun:test';
import { normalizeTerminalAppearance, resolveTerminalTheme, bindTerminalTheme } from './theme';

test('invalid preferences fall back; explicit mode overrides app appearance', () => {
  expect(normalizeTerminalAppearance({mode:'bogus',light:'bogus'})).toEqual({mode:'auto',light:'default',dark:'default'});
  expect(resolveTerminalTheme({mode:'light'},true).background).toBe('#f8f8f8');
  expect(resolveTerminalTheme({mode:'dark'},false).background).toBe('#080808');
  expect(resolveTerminalTheme({},true).background).toBe('#080808');
  expect(resolveTerminalTheme({},false).background).toBe('#f8f8f8');
});
test('every preset has an opaque background for terminal color queries', () => {
  for (const mode of ['light','dark']) for (const light of ['default','paper']) for(const dark of ['default','midnight']) {
    expect(resolveTerminalTheme({mode,light,dark},false).background).toMatch(/^#[a-f0-9]{6}$/);
  }
});
test('live preference updates beat stale initial reads and dispose unsubscribes', async () => {
  const old = globalThis.window;
  const listeners = new Set<() => void>(); const media = {matches:false,addEventListener(_k:string,fn:()=>void){listeners.add(fn);},removeEventListener(_k:string,fn:()=>void){listeners.delete(fn);}};
  globalThis.window = {matchMedia:()=>media} as any;
  try {
    let change!: (key:string,value:unknown)=>void; let resolve!: (v:unknown)=>void; let removed=false;
    const term={options:{theme:resolveTerminalTheme({},false)}}; const container={style:{}} as HTMLElement;
    const binding=bindTerminalTheme(term,container,{getPref:()=>new Promise(r=>{resolve=r;}),onPrefChanged:cb=>{change=cb;return()=>{removed=true;};}});
    change('terminalAppearance',{mode:'dark',dark:'midnight'}); resolve({mode:'light'}); await binding.ready;
    expect(term.options.theme.background).toBe('#18202e');
    expect(container.style.backgroundColor).toBe('#18202e');
    binding.dispose(); expect(removed).toBe(true); expect(listeners.size).toBe(0);
    change('terminalAppearance',{mode:'light'}); expect(term.options.theme.background).toBe('#18202e');
  } finally { globalThis.window=old; }
});
