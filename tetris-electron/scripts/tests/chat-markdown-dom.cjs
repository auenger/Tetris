const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const directory=process.env.TETRIS_MARKDOWN_FIXTURE_DIR;
app.setPath('userData',path.join(directory,'profile'));
const checks={};let window;
const run=code=>window.webContents.executeJavaScript(code);
const nextFrame=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
app.whenReady().then(async()=>{
 try{
  window=new BrowserWindow({width:480,height:700,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  await window.loadFile(path.join(directory,'index.html'));
  const first='保留这一段 **已完成内容**。\n\n```typescript\nconst value = "'+ 'long value '.repeat(30)+'";';
  await run(`renderMarkdown(${JSON.stringify(first)},true)`);await nextFrame();
  await run("window.stableParagraph=document.querySelector('.chat-markdown p');window.stableCode=document.querySelector('.chat-markdown pre');stableCode.scrollLeft=110;const range=document.createRange();range.selectNodeContents(stableParagraph);getSelection().removeAllRanges();getSelection().addRange(range)");
  checks.partialCodeVisible=await run("document.querySelector('code').textContent.includes('const value')");
  const second=first+'\nconsole.log(value);\n```\n\n尾部 **继续';
  await run(`renderMarkdown(${JSON.stringify(second)},true)`);await nextFrame();
  checks.completedPrefixDOMRetained=await run("document.querySelector('.chat-markdown p')===stableParagraph&&getSelection().toString().includes('已完成内容')");
  checks.codeViewportRetained=await run("document.querySelector('.chat-markdown pre')===stableCode&&stableCode.scrollLeft===110");
  const final=second+'输出**。';
  await run(`renderMarkdown(${JSON.stringify(final)},false)`);await nextFrame();
  checks.finalFlushKeepsCodeAndText=await run("document.querySelector('.chat-markdown pre')===stableCode&&document.querySelector('.chat-markdown').textContent.includes('继续输出')");
  checks.longCodeScrollsWithinMessage=await run("stableCode.scrollWidth>stableCode.clientWidth&&document.documentElement.scrollWidth===document.documentElement.clientWidth&&getComputedStyle(stableCode).whiteSpace==='pre'");
  await run("document.querySelector('[aria-label=复制代码]').click()");await nextFrame();
  checks.copyMatchesDisplayedCode=await run("copiedMarkdownCode===stableCode.textContent&&document.querySelector('[aria-label=复制代码]').textContent==='已复制'");
  await run(`renderMarkdown(${JSON.stringify(final)},false)`);await nextFrame();
  checks.completedMessageKeepsDOM=await run("document.querySelector('.chat-markdown pre')===stableCode&&document.querySelector('.chat-markdown p')===stableParagraph");
  const table='| 项目 | 长内容 |\n| --- | --- |\n| 页面 | '+ 'long-cell-'.repeat(50)+' |\n\n[安全外链](https://example.com)\n\n<script>window.unsafeMarkdownExecuted=true</script>';
  await run(`renderMarkdown(${JSON.stringify(table)},false)`);await nextFrame();
  checks.tableScrollsWithoutPageOverflow=await run("(()=>{const el=document.querySelector('.chat-markdown-table');return el.scrollWidth>el.clientWidth&&document.documentElement.scrollWidth===document.documentElement.clientWidth})()");
  checks.safeLinksAndInertHTML=await run("document.querySelector('a').target==='_blank'&&document.querySelector('a').rel.includes('noopener')&&!window.unsafeMarkdownExecuted&&!document.querySelector('#root script')");
  checks.themeFontSizes=await run("getComputedStyle(document.querySelector('.chat-markdown')).fontSize==='13px'&&getComputedStyle(document.querySelector('.chat-markdown')).lineHeight==='22.75px'");
  console.log(JSON.stringify({checks,directory},null,2));
  if(Object.values(checks).some(value=>value!==true))throw Error('Chat Markdown DOM verification failed');
  window.destroy();app.exit(0);
 }catch(error){console.error(error);if(window&&!window.isDestroyed())window.destroy();app.exit(1)}
});
