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
const output=resolve(root,'../docs/screenshots');
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
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.demo?.ready && ['demo-codex','demo-claude','demo-review'].every(s=>demo.getTerminal(s)?.term));
  await page.evaluate(()=>{
    const outputs={
      'demo-codex':['$ codex','', 'TETRIS / feature workspace','', '> Add unread notifications to the canvas.','', '  Updated notification previews','  Added one-click mark-all-read','  Kept one message per terminal','', 'Files changed','  agent-notifications.js','  notification-badge.js','', 'Implementation ready for review.'],
      'demo-claude':['$ claude','', 'TETRIS / verification','', '> Check the notification interactions.','', '  PASS  click message -> focus tile','  PASS  read message -> remove bell','  PASS  mark all read -> clear list','  PASS  collapsed group -> expand','', 'Waiting for review.'],
      'demo-review':['$ git diff --stat','', ' agent-notifications.js | 42 +++++',' notification-badge.js  | 12 +++','', '$ git status --short',' M agent-notifications.js',' M notification-badge.js','', 'Demo workspace / sample output']
    };
    for(const [id,lines] of Object.entries(outputs))demo.getTerminal(id).write('\x1b[2J\x1b[H\x1b[?25l'+lines.join('\r\n'));
  });
  await page.waitForTimeout(500);
  await page.screenshot({path:join(output,'canvas-workspace.png')});
  await page.evaluate(()=>receiveNotices([
    {sessionId:'demo-codex',title:'Codex',body:'Added message previews and a one-click clear action. Ready for review.',kind:'complete',time:1000,read:false},
    {sessionId:'demo-claude',title:'Claude Code',body:'Checked focus, unread clearing and collapsed-group navigation. All demo checks passed.',kind:'complete',time:2000,read:false},
  ]));
  await page.screenshot({path:join(output,'agent-notifications.png')});
  await page.getByRole('button',{name:'收起',exact:true}).click();
  await page.locator('.canvas-group > .agent-notification-badge').hover();
  await page.screenshot({path:join(output,'collapsed-group.png')});
  await page.locator('.agent-notification-item[data-session-id="demo-claude"]').click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.agent-notification-item').count(),1);
  assert.equal(await page.locator('.canvas-group.collapsed').count(),0);
  await page.getByRole('button',{name:'Mark all as read',exact:true}).click();
  assert.equal(await page.locator('.agent-notification-item').count(),0);
  assert.equal(await page.locator('.agent-notification-badge').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Saved 3 actual-component screenshots with demo data; notification interactions verified.');
} finally {await browser.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
