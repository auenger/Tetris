// Render production canvas/group/xterm/notification components with synthetic data.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {mkdtemp,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(tmpdir(),'tetris-terminal-ui');
const require=createRequire(join(root,'package.json'));
const {build,loadConfigFromFile}=await import(createRequire(require.resolve('electron-vite')).resolve('vite'));
const temp=await mkdtemp(join(tmpdir(),'tetris-docs-'));
const loaded=await loadConfigFromFile({command:'build',mode:'production'},join(root,'electron.vite.config.ts'));
await build({...loaded.config.renderer,configFile:false,build:{outDir:temp,emptyOutDir:true,lib:{entry:join(root,'scripts/docs/entry.js'),formats:['es'],fileName:'demo'},rollupOptions:{}}});
const routes=new Map([
['/',join(root,'scripts/docs/fixture.html')],['/shell.css',join(root,'src/windows/shell/src/shell.css')],['/bundle/demo.js',join(temp,'demo.js')],['/bundle/demo.css',join(temp,'demo.css')],
]);
const server=createServer(async(req,res)=>{const path=routes.get(req.url);if(!path){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.TETRIS_CHROMIUM_PATH?{executablePath:process.env.TETRIS_CHROMIUM_PATH}:{})});
try {
  await mkdir(output,{recursive:true});
  const page=await browser.newPage({viewport:{width:1600,height:940},deviceScaleFactor:1,colorScheme:'light'});
  // Keep screenshots deterministic/offline, including CSS's optional CDN fonts.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => {
    window.testInput=[]; window.testClipboard={kind:'text',text:'hello\nworld'};
    window.testPrefs={mode:'light',light:'paper',dark:'midnight'};
    window.testPrefListeners=new Set();
    Object.defineProperty(window,'shellApi',{configurable:true,set(api){
      api.ptyWrite=(id,data)=>window.testInput.push({id,data});
      api.readTerminalClipboard=async()=>window.testClipboard;
      api.getPref=async()=>window.testPrefs;
      api.onPrefChanged=cb=>{window.testPrefListeners.add(cb);return()=>window.testPrefListeners.delete(cb)};
      Object.defineProperty(window,'shellApi',{value:api,writable:true,configurable:true});
    }});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.demo?.ready && ['demo-codex','demo-claude','demo-review'].every(s=>demo.getTerminal(s)?.term));
  await page.waitForTimeout(200);
  await page.evaluate(async()=>{
    const term=demo.getTerminal('demo-codex').term;
    window.testTerm=term;
    await new Promise(resolve=>term.write('\x1b[?2004h\x1b]11;?\x07',resolve));
    term.focus();
  });
  assert((await page.evaluate(()=>testInput.some(x=>x.data.includes('rgb:f5f5/f0f0/e6e6')))), 'OSC 11 reports selected light background');
  await page.evaluate(()=>{testInput=[]});
  await page.keyboard.press('Meta+v');
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>testInput.map(x=>x.data)),['\x1b[200~hello\rworld\x1b[201~']);
  await page.evaluate(()=>{testInput=[];testClipboard={kind:'image'}});
  await page.keyboard.press('Meta+v');
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>testInput.map(x=>x.data)),['\x16']);
  await page.evaluate(()=>{testInput=[]});
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>testInput.map(x=>x.data)),['\x16']);
  await page.evaluate(()=>{
    testInput=[];testPrefs={mode:'dark',dark:'midnight'};
    for(const cb of testPrefListeners)cb('terminalAppearance',testPrefs);
  });
  assert.equal(await page.evaluate(()=>demo.getTerminal('demo-codex').term===testTerm),true);
  assert.equal(await page.evaluate(()=>testTerm.options.theme.background),'#18202e');
  await page.evaluate(()=>new Promise(resolve=>testTerm.write('\x1b]11;?\x07',resolve)));
  assert(await page.evaluate(()=>testInput.some(x=>x.data.includes('rgb:1818/2020/2e2e'))));
  // Menu paste is independent of the last keyboard paste (no sticky suppression).
  await page.evaluate(()=>{testInput=[];testClipboard={kind:'text',text:'menu'};testTerm.textarea.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true}))});
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>testInput.map(x=>x.data)),['\x1b[200~menu\x1b[201~']);
  await page.screenshot({path:join(output,'terminal-midnight.png')});
  assert.deepEqual(errors,[]);
  console.log('Terminal UI passed: image/text/menu paste, native Ctrl+V, bracketed paste, OSC 11 and live theme without terminal recreation.');
} finally {await browser.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
