// Run after `bun run build`: node scripts/test-file-viewer.cjs
// Exercises the production viewer in an isolated Electron profile and temp files.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, ipcMain, protocol, net, session } = require('electron');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tetris-viewer-test-'));
app.setPath('userData', path.join(temp, 'profile'));
app.commandLine.appendSwitch('disable-gpu');
protocol.registerSchemesAsPrivileged([{ scheme: 'collab-preview', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);
require('node:child_process').execFileSync('bun', ['build', path.resolve(__dirname, '../packages/shared/src/collab-file-url.ts'), '--target', 'node', '--format', 'cjs', '--outfile', path.join(temp, 'preview-url.cjs')], {stdio:'pipe'});
const {fromHtmlPreviewUrl} = require(path.join(temp, 'preview-url.cjs'));
const preload = path.join(temp, 'preload.cjs');
fs.writeFileSync(preload, `
  const { contextBridge, ipcRenderer } = require('electron');
  const noop = () => () => {};
  const listen = channel => cb => {
    const handler = (_event, ...args) => cb(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
  contextBridge.exposeInMainWorld('api', {
    onToggleFileSource: listen('viewer:toggle-source'),
    sendToHost: (channel,state) => ipcRenderer.send('test:viewer-state',state),
    getPlatform: () => process.platform,
    getConfig: async () => ({workspaces: []}),
    readFile: p => ipcRenderer.invoke('test:read', p),
    getFileStats: p => ipcRenderer.invoke('test:stats', p),
    writeFile: (p, text, mtime) => ipcRenderer.invoke('test:write', p, text, mtime),
    onFsChanged: listen('test:fs'), onFileSelected: listen('test:select'),
    onShellBlur: noop, onWorkspaceAdded: noop, onWorkspaceRemoved: noop,
    onFolderSelected: noop, onFileRenamed: noop, onFilesDeleted: noop,
    onWikilinksUpdated: noop, onNavVisibility: noop,
    getBacklinks: async () => [], selectFile() {},
  });
`);
const htmlPath = path.join(temp, '网页 #1.HTML');
const markdownPath = path.join(temp, '说明.MD');
const html = title => `<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><h1>${title}</h1><img src="./image.svg"><script type="module" src="./script.js"></script></body></html>`;
fs.writeFileSync(htmlPath, html('HTML original'));
fs.writeFileSync(path.join(temp, 'style.css'), 'h1 { color: rgb(12, 34, 56); }');
fs.writeFileSync(path.join(temp, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="green"/></svg>');
fs.writeFileSync(path.join(temp, 'script.js'), 'document.body.dataset.script = "loaded";');
const markdown = '---\ncustom_field: "keep me"\ntags: [one, two]\n---\n# Markdown original\n\n**Bold text**\n';
fs.writeFileSync(markdownPath, markdown);
let win;let sourceState;ipcMain.on('test:viewer-state',(_event,state)=>{sourceState=state});
let fontServer;
let failWrites = false;
let releaseWrite;
let heldWrite;
let writeStarted = false;
const writes = [];
const stats = p => {
  const s = fs.statSync(p);
  return { ctime: s.ctime.toISOString(), mtime: s.mtime.toISOString() };
};
const js = expression => win.webContents.executeJavaScript(expression, true);
const until = async (predicate, label) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${label}`);
};
const has = selector => js(`!!document.querySelector(${JSON.stringify(selector)})`);
const click = async selector => {if(selector==='.file-view-toggle' && !await has(selector)){win.webContents.send('viewer:toggle-source');await new Promise(r=>setTimeout(r,100));return;}return js(`document.querySelector(${JSON.stringify(selector)}).click()`);};
const replaceSource = async text => {
  await until(() => js('document.querySelector(".monaco-editor [role=textbox]")?.getBoundingClientRect().height > 0'), 'source editor');
  await js(`document.querySelector('.monaco-editor [role="textbox"]').focus()`);
  const key = {key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:process.platform === 'darwin' ? 4 : 2};
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyDown',...key});
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyUp',...key});
  await js(`{
    const data = new DataTransfer(); data.setData('text/plain', ${JSON.stringify(text)});
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }`);
  const compact = text.replace(/\s/g, '');
  await until(() => js(`document.querySelector('.view-lines')?.textContent.replace(/\\s/g, '').includes(${JSON.stringify(compact)})`), 'pasted source is visible');
};
const frame = () => win.webContents.mainFrame.frames.find(f => f.url.startsWith('collab-preview:'));
const previewText = () => frame()?.executeJavaScript('document.querySelector("h1")?.textContent');
const load = async (p, tile = true) => {
  sourceState=null;
  await win.loadFile(path.resolve(__dirname, '../out/renderer/viewer/index.html'), tile ? {query:{tilePath:p}} : {});
  if (!tile) {
    await until(() => js('!!document.querySelector(".app")'), 'viewer mount');
    win.webContents.send('test:select', p);
  }
  if(tile){await until(()=>sourceState?.available,'header source action');assert.equal(await has('.file-view-controls'),false,'tiles have no separate source toolbar');}else await until(()=>has('.file-view-toggle'),'preview toggle');
  await js(`window.addEventListener('unhandledrejection', e => {
    // Monaco 0.55 cancels its delayed word highlighting when the editor is disposed.
    // This known visual-task cancellation is independent of file writes.
    if (e.reason?.name === 'Canceled' && /WordHighlighter.*dispose/.test(e.reason.stack)) {
      e.preventDefault();
    }
  })`);
};

app.whenReady().then(async () => {
  // Return successful empty stylesheets: aborting a nested @import makes Vite's
  // production CSS preload reject the entire viewer module.
  fontServer = require('node:http').createServer((_req, res) => {
    res.writeHead(200, {'Content-Type':'text/css', 'Access-Control-Allow-Origin':'*'}).end('');
  });
  await new Promise(resolve => fontServer.listen(0, '127.0.0.1', resolve));
  const fonts = `http://127.0.0.1:${fontServer.address().port}/empty.css`;
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (details, cb) => cb(details.url === fonts ? {} : {redirectURL:fonts}));
  protocol.handle('collab-preview', request => {
    return net.fetch(pathToFileURL(fromHtmlPreviewUrl(request.url)).href);
  });
  ipcMain.handle('test:read', (_event, p) => fs.readFileSync(p, 'utf8'));
  ipcMain.handle('test:stats', (_event, p) => stats(p));
  ipcMain.handle('test:write', async (_event, p, text, expectedMtime) => {
    assert(p.startsWith(temp + path.sep), 'only test fixtures can be written');
    writeStarted = true;
    if (heldWrite) await heldWrite;
    if (failWrites) throw new Error('Simulated write failure');
    const current = stats(p).mtime;
    if (expectedMtime && expectedMtime !== current) return {ok:false, conflict:true, mtime:current};
    fs.writeFileSync(p, text);
    writes.push({p, text});
    win.webContents.send('test:fs', [{changes:[{path:p}]}]);
    return {ok:true, mtime:stats(p).mtime};
  });
  win = new BrowserWindow({show:false, width:880, height:680, webPreferences:{preload, sandbox:true, contextIsolation:true, backgroundThrottling:false}});
  win.webContents.debugger.attach('1.3');
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level === 3 && !/net::ERR_BLOCKED|Simulated write failure/.test(message)) errors.push(message);
  });
  try {
    await load(htmlPath);
    await until(async () => await previewText() === 'HTML original', 'HTML renders by default');
    await until(async () => await frame().executeJavaScript('document.body.dataset.script === "loaded" && document.images[0].naturalWidth === 40'), 'relative module and image');
    assert.equal(await frame().executeJavaScript('getComputedStyle(document.querySelector("h1")).color'), 'rgb(12, 34, 56)');
    assert.equal(await frame().executeJavaScript('typeof window.api'), 'undefined');
    assert.equal(await frame().executeJavaScript('try { parent.api; false } catch { true }'), true, 'preview is isolated from the app');
    fs.writeFileSync(path.join(os.tmpdir(), 'tetris-html-preview.png'), (await win.webContents.capturePage()).toPNG());
    await click('.file-view-toggle');
    await replaceSource(html('HTML edited'));
    await click('.file-view-toggle');
    await until(async () => await previewText() === 'HTML edited', 'immediate switch saves and refreshes HTML');
    assert.equal(fs.readFileSync(htmlPath, 'utf8'), html('HTML edited'));

    await load(markdownPath);
    await until(() => js('document.querySelector(".bn-editor")?.textContent.includes("Markdown original")'), 'Markdown preview');
    await click('.file-view-toggle');
    const updated = markdown.replace('Markdown original', 'Markdown edited');
    await replaceSource(updated);
    await click('.file-view-toggle');
    await until(() => js('document.querySelector(".bn-editor")?.textContent.includes("Markdown edited")'), 'updated Markdown preview');
    assert.equal(fs.readFileSync(markdownPath, 'utf8'), updated, 'frontmatter is preserved verbatim');
    fs.writeFileSync(path.join(os.tmpdir(), 'tetris-markdown-preview.png'), (await win.webContents.capturePage()).toPNG());
    assert.equal(await has('.file-source-pane[hidden] .monaco-editor'), true, 'source editor is retained across preview switches');

    await click('.file-view-toggle');
    heldWrite = new Promise(resolve => {releaseWrite = resolve;});
    writeStarted = false;
    await replaceSource(updated.replace('edited', 'saving'));
    await until(() => writeStarted, 'auto-save starts');
    const latest = updated.replace('edited', 'latest');
    await replaceSource(latest);
    await click('.file-view-toggle');
    assert.equal(await has('.file-source-pane:not([hidden]) .monaco-editor'), true, 'source stays visible during pending save');
    heldWrite = null; releaseWrite();
    await until(() => js('document.querySelector(".bn-editor")?.textContent.includes("Markdown latest")'), 'edits made during save are flushed');
    assert.equal(fs.readFileSync(markdownPath, 'utf8'), latest);

    await click('.file-view-toggle');
    failWrites = true;
    await replaceSource(updated.replace('edited', 'retry'));
    await click('.file-view-toggle');
    await until(() => has('[role="alert"]'), 'save failure is visible');
    assert.equal(await has('.file-source-pane:not([hidden]) .monaco-editor'), true, 'failed save retains the draft');
    failWrites = false;
    await click('.file-view-toggle');
    await until(() => js('document.querySelector(".bn-editor")?.textContent.includes("Markdown retry")'), 'retry saves draft');

    await click('.file-view-toggle');
    await replaceSource(updated.replace('edited', 'my draft'));
    fs.writeFileSync(markdownPath, updated.replace('edited', 'external'));
    win.webContents.send('test:fs', [{changes:[{path:markdownPath}]}]);
    await until(() => has('.code-editor-dirty-banner-actions'), 'external conflict');
    await click('.file-view-toggle');
    assert.equal(await has('.file-source-pane:not([hidden]) .monaco-editor'), true, 'conflict blocks mode switch');
    assert(fs.readFileSync(markdownPath, 'utf8').includes('external'), 'external content is not overwritten');
    await click('.code-editor-dirty-banner-actions button');
    await click('.file-view-toggle');
    await until(() => js('document.querySelector(".bn-editor")?.textContent.includes("Markdown external")'), 'reload resolves conflict');

    await load(markdownPath, false);
    await click('.file-view-toggle');
    heldWrite = new Promise(resolve => {releaseWrite = resolve;});
    writeStarted = false;
    await replaceSource(updated.replace('edited', 'before navigation'));
    await until(() => writeStarted, 'save before file navigation');
    const finalDraft = updated.replace('edited', 'after navigation');
    await replaceSource(finalDraft);
    win.webContents.send('test:select', htmlPath);
    await until(async () => await previewText() === 'HTML edited', 'navigate while save is pending');
    heldWrite = null; releaseWrite();
    await until(() => fs.readFileSync(markdownPath, 'utf8') === finalDraft, 'previous file retains its final draft');

    await load(htmlPath, false);
    await until(async () => await previewText() === 'HTML edited', 'file tree singleton uses HTML preview');
    await click('.file-view-toggle');
    await until(() => has('.file-source-pane:not([hidden]) .monaco-editor'), 'singleton source toggle');
    const screenshot = path.join(os.tmpdir(), 'tetris-file-viewer-source.png');
    fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, [], 'no unexpected renderer errors');
    console.log(`Viewer UI passed: HTML assets/scripts/isolation; tile and file-tree modes; Markdown frontmatter; immediate/overlapping saves and file navigation; failed save retry; external conflicts. ${writes.length} writes. Screenshot: ${screenshot}`);
  } catch (error) {
    console.error({rendererErrors: errors, body: await js('document.body.innerText'), writes, preview:await previewText(), html:fs.readFileSync(htmlPath,'utf8')});
    throw error;
  } finally {
    win?.destroy();
    fontServer?.close();
  }
}).then(() => {fs.rmSync(temp, {recursive:true, force:true}); app.exit(0);}).catch(error => {
  console.error(error);
  fs.rmSync(temp, {recursive:true, force:true}); app.exit(1);
});
