// Run: ./node_modules/.bin/electron scripts/test-agent-canvas.cjs
// Real Electron DOM; production canvas/replay modules; memory-only persistence.
// This fixture never starts an agent or accesses the user's saved canvas.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '../src/windows/shell/src');
const source = ['../../../shared/ui/select-control.js', 'task-effects.js', 'task-event-replay.js', 'agent-canvas.js'].map(name => fs.readFileSync(path.join(base,name),'utf8').replace(/^import .*$/gm,'')).join('\n').replaceAll('export function','function').replaceAll('export const','const');
const css = fs.readFileSync(path.join(base,'../../../shared/ui/select.css'),'utf8') + '\n' + fs.readFileSync(path.join(base,'shell.css'),'utf8') + '\n' + fs.readFileSync(path.join(base,'task-event-replay.css'),'utf8');
const deadline = setTimeout(() => { console.error('Canvas audit timed out'); app.exit(1); },40000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({width:1300,height:800,show:true,title:'Tetris canvas audit',webPreferences:{webviewTag:true}});
  try {
    await window.loadURL('data:text/html,<body></body>');
    if (process.argv.includes('--reduced-motion')) { window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}); }
    await window.webContents.executeJavaScript(`window.canvasFactory=new Function(${JSON.stringify(source+';return createAgentCanvas')})();document.head.append(Object.assign(document.createElement('style'),{textContent:${JSON.stringify(css)}}));`);
    const checks = await window.webContents.executeJavaScript(`(async()=>{
      crypto.randomUUID ||= () => Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
      document.body.innerHTML='<div id="ide-tile">IDE note</div><main id="host" style="position:absolute;inset:0"></main>';
      const ide={tiles:[{id:'ide-tile',x:12,y:34}],viewport:{panX:100,panY:50,zoom:.8},selected:'ide-tile'},beforeIDE=JSON.stringify(ide),states={},checks={};
      window.shellApi={canvasLoadState:async id=>structuredClone(states[id]||null),canvasSaveState:async(state,id)=>{states[id]=structuredClone(state)},logFromWebview:()=>{}};
      const config={host:document.querySelector('#host'),configs:{agentChat:{src:'about:blank',preload:''},viewer:{src:'about:blank',preload:''}},getSource:()=>null};
      let canvas=window.canvasFactory(config);await canvas.ready;
      if (${process.argv.includes('--dropdowns')}) {
        const first=(await canvas.handle({method:'workerTile',params:{sessionId:'one',taskId:'task-one',title:'第一个项目',cwd:'/projects/one'}})).tileId;
        const second=(await canvas.handle({method:'workerTile',params:{sessionId:'two',taskId:'task-two',title:'第二个项目',cwd:'/projects/two'}})).tileId;
        canvas.show();await new Promise(resolve=>setTimeout(resolve,180));
        const stage=document.querySelector('.agent-canvas'),trigger=stage.querySelector('.agent-project-filter button');
        trigger.focus();trigger.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));
        checks.projectSpaceOpensWithoutCanvasPan=trigger.getAttribute('aria-expanded')==='true'&&!stage.classList.contains('is-panning');
        trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        checks.projectSelectionUpdatesCanvasFilter=canvas.snapshot().filter.cwd==='/projects/one'&&stage.querySelector('[data-tile-id="'+second+'"]').hidden&&!stage.querySelector('[data-tile-id="'+first+'"]').hidden;
        checks.projectFullPathTitle=trigger.title==='/projects/one';
        trigger.click();trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        checks.clearProjectFilterRestoresBoth=!canvas.snapshot().filter.cwd&&!stage.querySelector('[data-tile-id="'+second+'"]').hidden;
        const before=JSON.stringify(canvas.snapshot()),at=new Date().toISOString();
        await canvas.handle({method:'taskReplay',params:{title:'回放',events:[{sequence:1,type:'task.created',at,payload:{title:'回放'}},{sequence:2,type:'worker.linked',at,payload:{}}],artifacts:[]}});
        const replay=document.querySelector('.agent-event-replay'),speed=replay.querySelector('select'),speedTrigger=speed.parentElement.querySelector('button');speedTrigger.click();
        document.querySelector('.tetris-dropdown [role=option]:last-child').click();
        checks.replaySpeedUsesSharedControl=speed.value==='4'&&speedTrigger.textContent.includes('4×');
        speedTrigger.click();canvas.hide();await new Promise(resolve=>setTimeout(resolve,80));
        checks.hiddenPageClosesPopup=!document.querySelector('.tetris-dropdown:popover-open');
        canvas.show();replay.querySelector('.replay-exit').click();
        checks.dropdownReplayDoesNotMutateLive=JSON.stringify(canvas.snapshot())===before&&JSON.stringify(ide)===beforeIDE;
        return checks;
      }
      if (${process.argv.includes('--replay-canvas')}) {
        await canvas.handle({method:'workerTile',params:{sessionId:'live',taskId:'live-task',title:'实时任务'}});canvas.show();await new Promise(resolve=>setTimeout(resolve,220));
        const before=JSON.stringify(canvas.snapshot()),at=new Date().toISOString();
        const events=[
          {type:'task.created',payload:{title:'整理项目资料'}},
          {type:'user.intent',payload:{action:'create_task',userText:'只整理资料，不要改代码',instruction:'盘点项目资料并输出建议'}},
          {type:'worker.linked',payload:{provider:'claude'}},
          {type:'run.started',payload:{prompt:'检查项目资料',provider:'claude'}},
          {type:'tool.updated',payload:{id:'read-1',title:'读取项目文档',status:'completed',detail:'已读 README'}},
          {type:'decision.requested',payload:{id:'d1',question:'是否补充缺少的说明？',reason:'项目说明还不完整'}},
          {type:'decision.responded',payload:{decisionId:'d1',userText:'补充说明，代码不动',instruction:'仅补充说明文档'}},
          {type:'decision.delivered',payload:{decisionId:'d1',instruction:'仅补充说明文档'}},
          {type:'artifact.created',payload:{id:'log',kind:'raw-execution-log'}},
          {type:'artifact.created',payload:{id:'a1',kind:'result-summary'}},
          {type:'run.ready_for_review',payload:{summary:'资料已整理'}},
          {type:'artifact.opened',payload:{artifactId:'a1'}},
          {type:'artifact.created',payload:{id:'a2',kind:'result-summary'}},
          {type:'artifact.opened',payload:{artifactId:'a2'}},
          {type:'artifact.opened',payload:{artifactId:'missing'}},
          {type:'agent.summarized',payload:{text:'资料已经整理完毕。'}}
        ].map((event,index)=>({...event,id:String(index),sequence:index+1,at,runId:'r1'}));
        const task={title:'整理项目资料',events,artifacts:[{id:'a1',runId:'r1',kind:'result-summary',path:'/archive/uuid-v1.md',content:'版本一：原始建议'},{id:'a2',runId:'r1',kind:'result-summary',path:'/archive/uuid-v2.md',content:'版本二：补充说明后的建议'},{id:'log',runId:'r1',kind:'raw-execution-log',content:'原始工具输出'}]};
        await canvas.handle({method:'taskReplay',params:task});
        const root=document.querySelector('.agent-event-replay'),slider=root.querySelector('input[type=range]');
        const seek=(type,id)=>{slider.value=events.findIndex(event=>event.type===type&&(!id||event.payload.id===id||event.payload.artifactId===id));slider.dispatchEvent(new Event('input'));};
        checks.noEventNodeList=!root.querySelector('ol,.replay-timeline,.replay-card');
        checks.noWorkerBeforeDispatch=root.querySelector('.replay-worker').hidden;
        seek('user.intent');checks.earlyUserWordsVisible=root.querySelector('.replay-delegation').textContent.includes('只整理资料，不要改代码');
        seek('worker.linked');const worker=root.querySelector('.replay-worker');checks.workerAppearsOnRecordedCreation=!worker.hidden;
        seek('tool.updated');checks.executionUpdatesSameWorker=worker===root.querySelector('.replay-worker')&&worker.textContent.includes('读取项目文档');
        seek('decision.responded');checks.decisionAndWordsStayInsideWorker=worker.querySelector('.replay-decision').textContent.includes('是否补充缺少的说明')&&worker.querySelector('.replay-decision').textContent.includes('补充说明，代码不动');
        seek('artifact.created','a1');checks.createdArtifactDoesNotFakeOpening=root.querySelectorAll('.replay-report:not([hidden])').length===0;
        seek('artifact.opened','a1');checks.reportAppearsOnlyWhenOpened=root.querySelectorAll('.replay-report:not([hidden])').length===1&&root.querySelector('.replay-report:not([hidden])').textContent.includes('版本一');
        task.artifacts[0].content='实时内容被改写';seek('artifact.created','a2');checks.openReportKeepsHistoricalVersion=root.querySelector('.replay-report[data-artifact-id="a1"]').textContent.includes('版本一')&&!root.querySelector('.replay-report[data-artifact-id="a1"]').textContent.includes('版本二');
        seek('artifact.opened','a2');checks.multipleVersionsUseExactArtifact=root.querySelector('.replay-report[data-artifact-id="a2"]').textContent.includes('版本二');
        checks.friendlyReportTitle=root.querySelector('.replay-report[data-artifact-id="a2"] .replay-tile-title').textContent.includes('整理项目资料 · 结果摘要')&&!root.querySelector('.replay-report[data-artifact-id="a2"] .replay-tile-title').textContent.includes('uuid');
        checks.logsStayInWorker=!!worker.querySelector('[data-artifact-kind="raw-execution-log"]')&&!root.querySelector('.replay-report[data-artifact-id="log"]');
        checks.relationshipsRetained=root.querySelectorAll('.replay-relationship').length===3;
        seek('artifact.opened','missing');checks.missingVersionNeverUsesLatest=root.querySelector('.replay-report[data-artifact-id="missing"]').textContent.includes('历史文件不可用');
        checks.readOnlyProjectionHasNoGuestsOrLiveMutation=!root.querySelector('webview,iframe')&&before===JSON.stringify(canvas.snapshot());
        seek('run.started');checks.reducedMotionRespected=!matchMedia('(prefers-reduced-motion: reduce)').matches||(getComputedStyle(root.querySelector('.replay-running-outline')).animationName==='none'&&root.querySelector('.replay-flight-trail').parentElement.style.display==='none');
        root.querySelector('.replay-play').click();canvas.hide();checks.hiddenPlaybackPauses=root.querySelector('.replay-play').textContent==='播放';canvas.show();
        const viewportBefore=JSON.stringify(canvas.snapshot().viewport);const background=await canvas.handle({method:'workerTile',params:{sessionId:'background-replay',taskId:'new-task'}});await canvas.handle({method:'tileFocus',params:{tileIds:[background.tileId],activate:false}});
        seek('task.created');checks.scrubbingBackRemovesFutureTiles=root.querySelector('.replay-worker').hidden&&!root.querySelector('.replay-report:not([hidden])');
        root.querySelector('.replay-exit').click();checks.exitRestoresLiveLayoutAndProgress=!document.querySelector('.agent-event-replay')&&viewportBefore===JSON.stringify(canvas.snapshot().viewport)&&canvas.snapshot().tiles.some(tile=>tile.agentSessionId==='background-replay');
        task.artifacts[0].content='版本一：原始建议';task.historyIncomplete=true;await canvas.handle({method:'taskReplay',params:task});const screenshotSlider=document.querySelector('.replay-progress');screenshotSlider.value=11;screenshotSlider.dispatchEvent(new Event('input'));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        checks.partialHistoryAlwaysLabelled=document.querySelector('.replay-position').textContent.includes('部分历史记录');
        const scene=document.querySelector('.agent-event-replay'),bounds=scene.getBoundingClientRect();checks.replayActuallyCoversLiveCanvas=bounds.width>500&&getComputedStyle(scene).display!=='none'&&scene.contains(document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2));
        return checks;
      }
      if (${process.argv.includes('--recovery')}) {
        const first=await canvas.handle({method:'workerTile',params:{sessionId:'lost-session',taskId:'stable-task',cwd:'/project',provider:'claude',title:'原任务'}});
        await canvas.handle({method:'tileMove',params:{tileId:first.tileId,position:{x:120,y:90}}});
        const report=await canvas.handle({method:'tileCreate',params:{filePath:'/archive/result.md',taskId:'stable-task'}});
        await canvas.handle({method:'taskGroup',params:{taskId:'stable-task',title:'原任务',tileIds:[first.tileId,report.tileId]}});
        await canvas.handle({method:'taskVisual',params:{state:'running',sessionId:'lost-session',sourceMessageId:'dispatch',tileIds:[first.tileId]}});
        await canvas.handle({method:'taskVisual',params:{state:'delivery',sessionId:'lost-session',sourceTileId:first.tileId,tileIds:[report.tileId]}});
        const prior=structuredClone(canvas.snapshot()),priorTile=prior.tiles.find(t=>t.id===first.tileId);
        const recovered=await canvas.handle({method:'workerTile',params:{sessionId:'fresh-session',taskId:'stable-task',tileId:first.tileId,cwd:'/project-recovered',provider:'codex',title:'继续原任务'}});
        await canvas.handle({method:'taskVisual',params:{state:'running',sessionId:'fresh-session',sourceMessageId:'dispatch',tileIds:[recovered.tileId]}});
        await canvas.handle({method:'workerTile',params:{sessionId:'fresh-session',taskId:'stable-task'}});
        const state=canvas.snapshot(),tile=state.tiles.find(t=>t.type==='agent'),source=document.querySelector('[data-tile-id="'+first.tileId+'"] webview').getAttribute('src');
        checks.recoveryReusesSingleTaskTile=recovered.tileId===first.tileId&&state.tiles.filter(t=>t.type==='agent').length===1;
        checks.recoveryPreservesLayout=['x','y','width','height'].every(key=>tile[key]===priorTile[key]);
        checks.recoveryPreservesGroupsAndEdges=JSON.stringify(state.groups)===JSON.stringify(prior.groups)&&state.taskLinks.length===prior.taskLinks.length&&state.taskLinks.every((link,index)=>link.key===prior.taskLinks[index].key&&link.sessionId==='fresh-session');
        checks.recoveryUpdatesGuestAndMetadata=source.includes('sessionId=fresh-session')&&source.includes('project-recovered')&&tile.provider==='codex'&&tile.userTitle==='继续原任务';
        await new Promise(resolve=>setTimeout(resolve,220));canvas.destroy();canvas=window.canvasFactory(config);await canvas.ready;
        checks.recoveryBindingRestores=canvas.snapshot().tiles.filter(t=>t.type==='agent').length===1&&canvas.snapshot().tiles.find(t=>t.id===first.tileId).agentSessionId==='fresh-session'&&document.querySelector('[data-tile-id="'+first.tileId+'"] webview').getAttribute('src').includes('sessionId=fresh-session');
        const foreign=await canvas.handle({method:'workerTile',params:{tileId:first.tileId,taskId:'other-task',sessionId:'other-session'}});
        checks.foreignTaskCannotRebindTile=foreign.tileId!==first.tileId&&canvas.snapshot().tiles.find(t=>t.id===first.tileId).taskId==='stable-task';
        const legacy=await canvas.handle({method:'workerTile',params:{sessionId:'legacy-session'}}),legacyRecovered=await canvas.handle({method:'workerTile',params:{tileId:legacy.tileId,taskId:'legacy-task',sessionId:'legacy-recovered'}});
        checks.legacyTaskUsesValidatedTileId=legacy.tileId===legacyRecovered.tileId&&canvas.snapshot().tiles.find(t=>t.id===legacy.tileId).taskId==='legacy-task';
        const at=new Date().toISOString();await canvas.handle({method:'taskReplay',params:{events:[{sequence:1,type:'user.intent',at,payload:{action:'send_task_message',userText:'继续分析，但不要改代码',instruction:'仅分析现有代码，不写入项目',operationId:'internal-op'}},{sequence:2,type:'task.created',at,payload:{title:'分析项目'}}]}});
        const intent=document.querySelector('.replay-intent');checks.intentPreservesWordsAndInstruction=intent.textContent.includes('你的原话：继续分析，但不要改代码')&&intent.textContent.includes('执行指令：仅分析现有代码，不写入项目')&&!intent.textContent.includes('internal-op');
        return checks;
      }
      if (${process.argv.includes('--artifacts')}) {
        await canvas.handle({method:'tileCreate',params:{tileType:'image',filePath:'/archive/preview.png',title:'项目预览',taskId:'asset-task'}});
        await canvas.handle({method:'tileCreate',params:{tileType:'pdf',filePath:'/archive/spec.pdf',userTitle:'设计说明 · v2',taskId:'asset-task'}});
        checks.typedArtifactsStayAgentScoped=canvas.snapshot().tiles.every(t=>t.canvasId==='agent:live'&&t.taskId==='asset-task')&&canvas.snapshot().tiles.map(t=>t.type).join(',')==='image,pdf';
        checks.friendlyArtifactTitles=canvas.snapshot().tiles.map(t=>t.userTitle).join('|')==='项目预览|设计说明 · v2';
        try { await canvas.handle({method:'tileCreate',params:{tileType:'term',filePath:'/archive/no'}}); checks.executableArtifactRejected=false; } catch { checks.executableArtifactRejected=true; }
        await new Promise(resolve=>setTimeout(resolve,220));canvas.destroy();canvas=window.canvasFactory(config);await canvas.ready;canvas.show();
        checks.artifactTypeAndTitleRestore=canvas.snapshot().tiles.map(t=>t.type+':'+t.userTitle).join('|')==='image:项目预览|pdf:设计说明 · v2';
        const at=new Date().toISOString(),events=[{sequence:1,type:'task.specified',at,payload:{goal:'交付设计说明',scope:['只调整文档'],acceptance:['PDF 可读取']}},{sequence:2,type:'run.stopped',at,payload:{stopReason:'end_turn'}},{sequence:3,type:'artifact.created',at,runId:'r',payload:{id:'summary',kind:'result-summary'}},{sequence:4,type:'artifact.created',at,runId:'r',payload:{id:'log',kind:'raw-execution-log'}},{sequence:5,type:'artifact.opened',at,runId:'r',payload:{artifactId:'pdf',path:'/archive/spec.pdf'}},{sequence:6,type:'artifact.unavailable',at,payload:{reason:'原文件不存在'}}];
        await canvas.handle({method:'taskReplay',params:{events,artifacts:[{id:'summary',runId:'r',kind:'result-summary',content:'最终摘要'},{id:'log',runId:'r',kind:'raw-execution-log',content:'原始工具日志'},{id:'pdf',runId:'r',kind:'deliverable',path:'/archive/spec.pdf',message:'二进制交付文件，请查看归档'}]}});
        const slider=document.querySelector('.agent-event-replay input');slider.value=5;slider.dispatchEvent(new Event('input'));
        checks.logDoesNotReplaceSummary=document.querySelector('.replay-worker-output[data-artifact-kind=\"result-summary\"]').textContent.includes('最终摘要')&&document.querySelector('.replay-worker-output[data-artifact-kind=\"raw-execution-log\"]').textContent.includes('原始工具日志')&&!document.querySelector('.replay-worker-output[data-artifact-kind=\"result-summary\"]').textContent.includes('原始工具日志');
        checks.openedDeliverableUsesExactArtifact=document.querySelector('.replay-report:not([hidden])').textContent.includes('二进制交付文件');
        checks.specStopAndUnavailableReadable=document.querySelector('.replay-request').textContent.includes('PDF 可读取')&&document.querySelector('.replay-worker').textContent.includes('停止原因')&&document.querySelector('.replay-artifact-error').textContent.includes('原文件不存在');
        return checks;
      }
      const worker=await canvas.handle({method:'workerTile',params:{sessionId:'fixture',title:'项目内容分析',cwd:'/alpha',taskId:'task-a'}}),report=await canvas.handle({method:'tileCreate',params:{filePath:'/archive/v2.md',taskId:'task-a'}});
      checks.backgroundStaysHidden=!canvas.isVisible();
      await canvas.handle({method:'taskGroup',params:{taskId:'task-a',title:'项目内容分析',tileIds:[worker.tileId,report.tileId]}});
      await canvas.handle({method:'taskVisual',params:{state:'delivery',sessionId:'fixture',sourceTileId:worker.tileId,tileIds:[report.tileId]}});
      canvas.show();await canvas.handle({method:'tileFocus',params:{tileIds:[worker.tileId,report.tileId]}});
      const shown=JSON.stringify(canvas.snapshot());canvas.hide();canvas.show();checks.pageToggleKeepsLayout=shown===JSON.stringify(canvas.snapshot());
      await canvas.handle({method:'taskFilter',params:{cwd:'/alpha'}});canvas.hide();const hidden=JSON.stringify(canvas.snapshot());await canvas.handle({method:'tileFocus',params:{tileIds:[report.tileId],activate:false}});
      const context=await canvas.handle({method:'contextSnapshot'});checks.hiddenPassiveFocusPreservesState=hidden===JSON.stringify(canvas.snapshot());checks.hiddenContextInactive=!context.visible&&!context.focusedTileId&&!context.selectedTileIds.length;
      canvas.show();await new Promise(resolve=>setTimeout(resolve,220));const saved=JSON.stringify(canvas.snapshot());canvas.destroy();canvas=window.canvasFactory(config);await canvas.ready;canvas.show();
      checks.recreatedStateIdentical=saved===JSON.stringify(canvas.snapshot());checks.groupsAndLinksRestored=canvas.snapshot().groups.length===1&&canvas.snapshot().taskLinks.length===1;
      const viewport=JSON.stringify(canvas.snapshot().viewport),links=JSON.stringify(canvas.snapshot().taskLinks),at=new Date().toISOString();
      const task={title:'项目内容分析',events:[{sequence:1,type:'task.created',at,payload:{title:'分析项目内容'}},{sequence:2,type:'run.started',at,runId:'r1',payload:{prompt:'分析内容并给出建议'}},{sequence:3,type:'decision.requested',at,payload:{question:'调整布局吗？'}},{sequence:4,type:'decision.responded',at,payload:{userText:'只补内容，布局不动',instruction:'保留布局，只补内容'}},{sequence:5,type:'artifact.created',at,runId:'r1',payload:{id:'a2'}},{sequence:6,type:'agent.summarized',at,payload:{text:'分析已完成。'}}],artifacts:[{id:'a1',runId:'r1',kind:'result-summary',content:'错误旧版本'},{id:'a2',runId:'r1',kind:'result-summary',content:'正确版本二'}]};
      await canvas.handle({method:'taskReplay',params:task});let slider=document.querySelector('.agent-event-replay input');slider.value=5;slider.dispatchEvent(new Event('input'));
      checks.exactArtifactVersion=document.querySelector('.replay-worker-output[data-artifact-kind=\"result-summary\"]').textContent.includes('正确版本二');checks.originalDecisionAndSummary=document.querySelector('.replay-decision').textContent.includes('布局不动')&&!!document.querySelector('.replay-agent-summary');
      const added=await canvas.handle({method:'workerTile',params:{sessionId:'background',taskId:'task-b',cwd:'/beta',title:'后台任务'}});await canvas.handle({method:'tileFocus',params:{tileIds:[added.tileId],activate:false}});
      checks.replayPreservesLiveLayout=viewport===JSON.stringify(canvas.snapshot().viewport)&&links===JSON.stringify(canvas.snapshot().taskLinks);checks.replayDoesNotMarkLiveTaskRead=canvas.viewState().replaying&&!canvas.viewState().taskIds.length;
      const replay=document.querySelector('.agent-event-replay');[...replay.querySelectorAll('button')].find(b=>b.textContent==='播放').click();canvas.hide();checks.hidePausesReplay=[...replay.querySelectorAll('button')].some(b=>b.textContent==='播放');
      canvas.show();[...replay.querySelectorAll('button')].find(b=>b.textContent==='返回实时任务').click();checks.exitRetainsBackgroundProgress=!document.querySelector('.agent-event-replay')&&canvas.snapshot().tiles.some(t=>t.agentSessionId==='background')&&viewport===JSON.stringify(canvas.snapshot().viewport);
      canvas.shortcut('focus-tile-right');canvas.shortcut('toggle-fullscreen-tile');const tileCount=canvas.snapshot().tiles.length;canvas.shortcut('close-tile');checks.closeShortcutRemovesOnlyAgentView=canvas.snapshot().tiles.length===tileCount-1;checks.agentShortcutsLeaveIDEIntact=beforeIDE===JSON.stringify(ide)&&document.querySelector('#ide-tile').textContent==='IDE note';
      await canvas.handle({method:'taskReplay',params:task});slider=document.querySelector('.agent-event-replay input');slider.value=5;slider.dispatchEvent(new Event('input'));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return checks;
    })()`);
    console.log(JSON.stringify(checks,null,2));
    if(Object.values(checks).some(value=>value!==true))throw Error('Canvas audit failed');
    clearTimeout(deadline);
    if(process.env.TETRIS_CANVAS_SCREENSHOT) {
      try { window.show();window.focus();await new Promise(resolve=>setTimeout(resolve,180));const image=await Promise.race([window.webContents.capturePage(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Optional screenshot timed out')),5000))]);fs.writeFileSync(process.env.TETRIS_CANVAS_SCREENSHOT,image.toPNG()); }
      catch(error) { console.warn(error.message); }
    }
    app.exit(0);
  }catch(error){console.error(error);clearTimeout(deadline);app.exit(1)}
});
