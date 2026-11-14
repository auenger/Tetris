// Native Electron interaction checks for the production shared Select and menu.
// Run: ./node_modules/.bin/electron scripts/test-select.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const base = path.join(root, 'src/shared/ui');
const source = name => fs.readFileSync(path.join(base, name), 'utf8').replace(/^import .*$/gm, '').replaceAll('export function', 'function');
const wrapper = ts.transpileModule(fs.readFileSync(path.join(base, 'Select.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^import .*$/gm, '').replaceAll('export function', 'function');
const deadline = setTimeout(() => { console.error('Select checks timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 780, height: 620, show: true, title: 'Tetris select checks', webPreferences: { nodeIntegration: true, contextIsolation: false } });
  try {
    await window.loadURL('data:text/html,<body></body>');
    await window.webContents.executeJavaScript(`
      window.enhanceSelect = new Function(${JSON.stringify(source('select-control.js') + ';return enhanceSelect')})();
      window.attachMenu = new Function(${JSON.stringify(source('menu.js') + ';return attachMenu')})();
      window.React = require(${JSON.stringify(require.resolve('react'))});
      window.createRoot = require(${JSON.stringify(require.resolve('react-dom/client'))}).createRoot;
      window.Select = new Function('React','useLayoutEffect','useRef','enhanceSelect',${JSON.stringify(wrapper + ';return Select')})(React,React.useLayoutEffect,React.useRef,enhanceSelect);
      document.head.append(Object.assign(document.createElement('style'),{textContent:${JSON.stringify(fs.readFileSync(path.join(base, 'select.css'), 'utf8'))}}));
    `);
    const checks = await window.webContents.executeJavaScript(`(async()=>{
      const wait = () => new Promise(resolve => setTimeout(resolve,35)), checks = {};
      document.head.append(Object.assign(document.createElement('style'),{textContent:':root{--bg:#f8f8f8;--fg:#202020;--border:#cecece;--muted:#71717b;--font-sans:system-ui}.dark{--bg:#121212;--fg:#dcdcdc;--border:#444;--muted:#888}body{margin:24px;font:13px system-ui;background:var(--bg);color:var(--fg)}#form{height:130px}#scroller{position:absolute;left:24px;top:210px;width:320px;height:140px;overflow:auto}#spacer{padding-top:60px;height:400px}.edge{position:absolute;right:8px;bottom:12px}h2{font-size:16px;margin:0 0 15px}'}));
      document.body.innerHTML='<h2>Tetris · 统一下拉选择器</h2><form id="form"><select name="provider" aria-label="Worker"><option value="claude">Claude Code</option><option disabled value="disabled">Unavailable</option><option value="codex">Codex</option><option value="long" title="/Users/ryan/very-long-workspace-name/project">Very long workspace name that must be truncated without expanding the window</option></select><button id="outside" type="button">Outside</button></form><div id="react"></div><div id="scroller"><div id="spacer"><select aria-label="滚动容器"><option>One</option><option>Two</option></select></div></div><div class="edge"><select aria-label="回放速度"><option>0.5×</option><option>1×</option><option>2×</option><option>4×</option></select></div><button id="menu-trigger">Canvas</button><div id="menu"><button type="button" role="menuitemradio" tabindex="-1" aria-checked="true">IDE 画布</button><button type="button" role="menuitemradio" tabindex="-1">Tetris Agent</button></div>';
      const native=document.querySelector('#form select'), control=enhanceSelect(native), trigger=control.trigger;
      const key = value => trigger.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
      let changes=0;native.addEventListener('change',()=>changes++);
      checks.nativeIsHiddenAndLabelled=getComputedStyle(native).display==='none'&&trigger.getAttribute('role')==='combobox'&&trigger.getAttribute('aria-label')==='Worker';
      trigger.click(); checks.opensInTopLayer=control.menu.matches(':popover-open')&&trigger.getAttribute('aria-expanded')==='true';
      key('ArrowDown');key('Enter'); checks.keyboardSkipsDisabledAndCommits=native.value==='codex'&&changes===1&&trigger.textContent.includes('Codex');
      trigger.click();key('Home');key('Escape'); checks.escapeCancelsAndRestoresFocus=native.value==='codex'&&changes===1&&document.activeElement===trigger&&!control.menu.isConnected;
      trigger.click();document.querySelector('#outside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); checks.outsideCloses=!control.menu.isConnected;
      trigger.click();key('Tab'); checks.tabCloses=!control.menu.isConnected;
      trigger.click();key('c');key('o');key('Enter');checks.typeaheadFindsOption=native.value==='codex';
      native.disabled=true;control.refresh();trigger.click();checks.disabledCannotOpen=trigger.disabled&&!control.menu.isConnected;native.disabled=false;control.refresh();
      trigger.click();control.menu.querySelectorAll('[role=option]')[3].click();checks.pointerCommitsOnce=native.value==='long'&&changes===2&&new FormData(document.querySelector('#form')).get('provider')==='long';
      control.wrapper.style.width='155px';checks.longValueHasTitleAndEllipsis=trigger.title.includes('/Users/ryan')&&getComputedStyle(trigger.querySelector('span')).textOverflow==='ellipsis';
      document.querySelector('#form').reset();await wait();checks.formResetSyncs=native.value==='claude'&&trigger.textContent.includes('Claude');
      native.replaceChildren(new Option('Replacement','new'));await wait();checks.dynamicOptionsSync=trigger.textContent.includes('Replacement');
      const light=getComputedStyle(trigger).backgroundColor;document.documentElement.classList.add('dark');const dark=getComputedStyle(trigger).backgroundColor;checks.themeUsesCurrentTokens=light!==dark&&dark==='rgb(18, 18, 18)';
      const scrolled=enhanceSelect(document.querySelector('#scroller select'));scrolled.open();const before=scrolled.menu.getBoundingClientRect().top;document.querySelector('#scroller').scrollTop=35;document.querySelector('#scroller').dispatchEvent(new Event('scroll'));await wait();checks.repositionsOnParentScroll=Math.abs(scrolled.menu.getBoundingClientRect().top-before+35)<2;scrolled.close();
      const edge=enhanceSelect(document.querySelector('.edge select'));edge.open();const box=edge.menu.getBoundingClientRect(),anchor=edge.trigger.getBoundingClientRect();checks.clampsAndFlipsAtWindowEdge=box.left>=0&&box.right<=innerWidth&&box.bottom<=anchor.top&&box.top>=0;
      edge.close();
      let reactChanges=0;function Demo(){const[value,setValue]=React.useState('claude'),[disabled,setDisabled]=React.useState(false);window.updateReact=setValue;window.disableReact=setDisabled;return React.createElement(Select,{'aria-label':'React Worker',value,disabled,variant:'ghost',onChange:e=>{reactChanges++;setValue(e.target.value)}},React.createElement('option',{value:'claude'},'Claude Code'),React.createElement('option',{value:'codex'},'Codex'));}
      const reactRoot=createRoot(document.querySelector('#react'));reactRoot.render(React.createElement(React.StrictMode,null,React.createElement(Demo)));await wait();const reactTrigger=document.querySelector('#react button');checks.strictModeDoesNotDuplicateControl=document.querySelectorAll('#react button').length===1;reactTrigger.click();document.querySelector('.tetris-dropdown [role=option]:last-child').click();await wait();checks.reactControlledChange=reactChanges===1&&reactTrigger.textContent.includes('Codex');
      updateReact('claude');await wait();checks.reactExternalValueSync=reactTrigger.textContent.includes('Claude');reactTrigger.click();disableReact(true);await wait();checks.reactDisabledCloses=reactTrigger.disabled&&!document.querySelector('.tetris-dropdown:popover-open');disableReact(false);await wait();
      const anchorMenu=document.querySelector('#menu-trigger'),menu=document.querySelector('#menu'),attached=attachMenu(anchorMenu,menu);attached.open();const menuItems=menu.querySelectorAll('button');menuItems[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));checks.menuKeyboardNavigation=document.activeElement===menuItems[1];menuItems[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));checks.menuEscapeRestores=menu.hidden&&document.activeElement===anchorMenu;
      attached.open();const menuLeft=menu.getBoundingClientRect().left;anchorMenu.style.transform='translateX(60px)';await wait();checks.menuFollowsCanvasTransform=Math.abs(menu.getBoundingClientRect().left-menuLeft-60)<2;attached.close();
      trigger.click();const selectLeft=control.menu.getBoundingClientRect().left;control.wrapper.style.transform='translateX(45px)';await wait();checks.selectFollowsAnchorTransform=Math.abs(control.menu.getBoundingClientRect().left-selectLeft-45)<2;control.close();
      trigger.click();control.wrapper.remove();await wait();checks.detachedTriggerCloses=!control.menu.isConnected;control.destroy();checks.destroyRemovesPopup=!document.querySelector('#'+control.menu.id);attached.destroy();
      reactRoot.unmount();await wait();checks.reactUnmountCleansPopup=!document.querySelector('.tetris-dropdown:popover-open');
      // Leave a compact visual specimen: long text, selection, shared dark tokens.
      document.querySelector('#form').prepend(native);native.replaceChildren(new Option('Claude Code','claude'),new Option('Codex','codex'),new Option('长工作目录 · personal-site / articles / research','long'));const final=enhanceSelect(native);final.open();
      return checks;
    })()`);
    console.log(JSON.stringify(checks,null,2));
    if (process.env.TETRIS_SELECT_SCREENSHOT) { window.focus(); await new Promise(resolve=>setTimeout(resolve,150)); fs.writeFileSync(process.env.TETRIS_SELECT_SCREENSHOT,(await window.webContents.capturePage()).toPNG()); }
    clearTimeout(deadline); window.destroy(); app.exit(Object.values(checks).every(Boolean)?0:1);
  } catch(error) { console.error(error);clearTimeout(deadline);window.destroy();app.exit(1); }
});
