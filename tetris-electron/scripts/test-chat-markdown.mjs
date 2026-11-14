// Isolated renderer/DOM verification; no provider, user App or existing build output.
import { spawn } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const directory=mkdtempSync(join(tmpdir(),'tetris-markdown-')),env={...process.env,TETRIS_MARKDOWN_FIXTURE_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
async function run(command,args){const child=spawn(command,args,{cwd:root,env,stdio:'inherit'});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});if(code!==0)throw Error(`${command} exited ${code}`)}
try{
 await run('bun',['build','scripts/tests/chat-markdown-dom.tsx','--target','browser','--tsconfig-override','tsconfig.web.json','--splitting','--outdir',directory]);
 writeFileSync(join(directory,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="chat-markdown-dom.css"><style>:root{--background:#141414;--foreground:#ddd;--card:#202020;--border:#3c3c3c;--muted-foreground:#999;--primary:#9db7cc;--link:#9db7cc;--font-sans:system-ui;--font-mono:monospace}*{box-sizing:border-box}body{margin:0;padding:20px;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}#root{width:100%;min-width:0}</style><div id="root"></div><script type="module" src="chat-markdown-dom.js"></script>`);
 await run(require('electron'),['scripts/tests/chat-markdown-dom.cjs']);
}finally{rmSync(directory,{recursive:true,force:true})}
