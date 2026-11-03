// Uses the real notification UI with delayed IPC snapshots, no agents or PTYs.
// Run: node scripts/test-notification-ui.cjs
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
if (!process.versions.electron) {
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  process.exit(spawnSync(require('electron'), [__filename], {env, stdio:'inherit'}).status ?? 1);
}
const {app, BrowserWindow} = require('electron');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tetris-notification-ui-'));
app.setPath('userData', path.join(temp, 'profile'));
app.commandLine.appendSwitch('disable-gpu');
execFileSync('bun', ['build', 'src/windows/shell/src/agent-notifications.js', '--target', 'browser', '--tsconfig-override', path.join(root, 'tsconfig.web.json'), '--outfile', path.join(temp, 'ui.mjs')], {cwd:root, stdio:'pipe'});
fs.writeFileSync(path.join(temp, 'index.html'), `<!doctype html><body><div id="tile"></div><script type="module">
  import {createAgentNotificationUI} from './ui.mjs';
  window.acks = [];
  window.shellApi = {
    getPref() { return Promise.resolve(true); },
    onPrefChanged(cb) { window.changePref=cb; },
    onAgentNotifications(cb) { window.receive = cb; },
    onAgentNotificationOpen() {},
    readAgentNotification(target) { acks.push(target); },
    getAgentNotifications() { return new Promise(resolve => { window.resolveSnapshot = resolve; }); },
  };
  const tile = {id:'t', type:'term', ptySessionId:'session', userTitle:'Test terminal'};
  window.ui = createAgentNotificationUI({
    tiles:[tile], container:document.body,
    tileManager:{getTileDOMs:()=>new Map([['t',{container:document.querySelector('#tile')}]]),repositionAllTiles(){}},
    navigateToTile() { window.opened = true; },
  });
  window.restore = ui.restore();
</script>`);
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false, webPreferences:{sandbox:true,contextIsolation:true}});
  const js = code => win.webContents.executeJavaScript(code, true);
  try {
    await win.loadFile(path.join(temp, 'index.html'));
    await js(`changePref('showNotificationPanel',false)`);
    assert.equal(await js(`document.querySelector('.agent-notification-panel').style.display`),'none');
    const first = {sessionId:'session',title:'Codex',body:'Done',kind:'complete',time:100,read:false};
    const next = {...first,time:101,eventId:'next'};
    await js(`receive([${JSON.stringify(first)}]); document.querySelector('.agent-notification-clear').click();`);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-item').length`), 0);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-badge').length`), 0);
    assert.deepEqual(await js('acks'), [[{sessionId:'session',time:100}]], 'acknowledgements identify the displayed event');
    await js(`receive([${JSON.stringify(first)}])`);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-item').length`), 0, 'old broadcasts stay dismissed');
    await js(`resolveSnapshot([${JSON.stringify(first)}]); restore`);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-item').length`), 0, 'late startup snapshot stays dismissed');
    await js(`receive([${JSON.stringify(next)}])`);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-item').length`), 1, 'new events with the same text still appear');
    await js(`document.querySelector('.agent-notification-item').click()`);
    assert.equal(await js('opened'), true);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-item').length`), 0);
    assert.deepEqual(await js('acks[1]'), [{sessionId:'session',time:101}]);
    await js('window.restore = ui.restore(); void 0');
    await js(`receive([${JSON.stringify({...next,time:102})}]); resolveSnapshot([${JSON.stringify(first)}]); restore`);
    assert.equal(await js(`document.querySelectorAll('.agent-notification-item').length`), 1, 'stale restore cannot replace a newer event');
    await js(`changePref('showNotificationPanel',true)`);
    assert.equal(await js(`document.querySelector('.agent-notification-panel').style.display`),'');
    console.log('Notification UI passed: clear/click acknowledgements, stale broadcasts, delayed restore and new events with identical text.');
  } finally { win.destroy(); }
}).then(() => {fs.rmSync(temp, {recursive:true,force:true});app.exit(0);}).catch(error => {
  console.error(error);fs.rmSync(temp, {recursive:true,force:true});app.exit(1);
});
