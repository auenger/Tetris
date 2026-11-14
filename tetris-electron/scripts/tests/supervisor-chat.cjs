const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const directory = process.env.TETRIS_SUPERVISOR_CHAT_FIXTURE_DIR;
app.setPath('userData', path.join(directory, 'profile'));
let window;
const run = code => window.webContents.executeJavaScript(code);
app.whenReady().then(async () => {
  try {
    // Keep the fixture deterministic and do not fetch web fonts or remote markdown resources.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    window = new BrowserWindow({ width: 560, height: 900, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    window.webContents.on('console-message', event => { if (['warning', 'error'].includes(event.level) && !event.message.includes('Electron Security Warning')) console.error(event.message); });
    await window.loadFile(path.join(directory, 'renderer/scripts/tests/supervisor-chat.html'));
    const checks = await run('chatFixture.test()');
    const screenshots = [], layouts = [];
    for (const width of [360, 560, 900]) {
      window.setContentSize(width, 900);
      for (const theme of ['light', 'dark']) {
        layouts.push(await run(`chatFixture.showcase(${JSON.stringify(theme)})`));
        const name = `chat-${width}-${theme}.png`;
        fs.writeFileSync(path.join(directory, name), (await window.webContents.capturePage()).toPNG());
        screenshots.push(name);
      }
    }
    window.setContentSize(360, 900);
    await run('chatFixture.archiveShowcase()');
    fs.writeFileSync(path.join(directory, 'archive-360-dark.png'), (await window.webContents.capturePage()).toPNG());
    screenshots.push('archive-360-dark.png');
    const result = { checks, layouts, screenshots, directory };
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    window.destroy();
    app.exit(checks.some(check => !check.pass) || layouts.some(layout => layout.pageOverflow || layout.composerOverflow) ? 1 : 0);
  } catch (error) { console.error(error); if (window && !window.isDestroyed()) window.destroy(); app.exit(1); }
});
