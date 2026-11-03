const $=id=>document.getElementById(id);let leave;let dragging=false;
const avatarNames=['codex','claude-code','gpt','claude','glm','deepseek'];
const face=(index=0,status='unknown')=>{const el=document.createElement('span');el.className='face';const name=avatarNames[Math.abs(Math.trunc(index)||0)%avatarNames.length];el.style.backgroundImage=`url("avatars/${name}.png")`;el.style.backgroundPosition=`${status==='done'?100:status==='working'||status==='attention'?50:0}% 50%`;el.setAttribute('aria-hidden','true');return el};
const elapsed=(start,end)=>{if(!start)return '—';const seconds=Math.max(0,Math.floor((end-start)/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`};
$('island').addEventListener('mouseenter',()=>{clearTimeout(leave);window.island.expand(true)});
$('island').addEventListener('mouseleave',()=>{if(!dragging)leave=setTimeout(()=>window.island.expand(false),250)});
window.island.subscribe(data=>{
 const sessions=data.sessions||[];const working=sessions.filter(s=>s.status==='working');const attention=sessions.filter(s=>s.status==='attention');const fresh=sessions.filter(s=>s.status==='done'&&s.unread);
 $('island').className=[dragging?'dragging':'',data.expanded?'expanded':'',working.length?'busy':'',attention.length?'attention':''].join(' ');
 $('count').textContent=attention.length?`${attention.length} 个待处理`:fresh.length?`${fresh.length} 个新完成`:working.length?`${working.length} 个运行中`:`Agent · ${sessions.length} 个会话`;
 $('faces').replaceChildren(...(sessions.length?sessions.slice(0,3):[{avatar:0}]).map(s=>face(s.avatar,s.status)));
 $('toast').textContent=data.toast;$('toast').style.display=data.toast?'block':'none';$('total').textContent=String(sessions.length);
 $('sessions').replaceChildren(...sessions.map(s=>{const row=document.createElement('button');row.className=`row ${s.status==='attention'?'attention-row':s.status}`;row.title=s.cwd;row.onclick=()=>window.island.open(s.id);
 const desc=document.createElement('span');desc.className='description';const name=document.createElement('span');name.className='name';name.textContent=s.title;const path=document.createElement('span');path.className='path';path.textContent=[s.agent||'Codex',s.cwd].filter(Boolean).join(' · ');desc.append(name,path);
 const tool=document.createElement('span');tool.className='tool';tool.textContent=[s.tool||({done:'本轮回复完成',idle:'已中断',unknown:'状态未知'}[s.status]||'思考'),s.status==='attention'?`等待 ${elapsed(s.waitingSince,data.time)}`:s.status==='working'?`运行 ${elapsed(data.time-(s.runningMs||0)-(s.activeSince?data.time-s.activeSince:0),data.time)}`:s.status==='done'?(s.unread?'未读':'已读'):''].filter(Boolean).join(' · ');
 const state=document.createElement('span');state.className='state';state.textContent=s.status==='working'?'':s.status==='done'?'✓':s.status==='attention'?'!':'·';row.append(face(s.avatar,s.status),desc,tool,state);return row}));
 renderQuotas(data.usages||[]);
 $('empty').style.display=sessions.length?'none':'block';
});

const text=(tag,className,value)=>{const el=document.createElement(tag);el.className=className;el.textContent=value;return el};
let quotaSignature='';
function renderQuotas(cards){
 const signature=JSON.stringify(cards);if(signature===quotaSignature)return;quotaSignature=signature;
 const nodes=[];const names={deepseek:'DeepSeek',openrouter:'OpenRouter',zhipu:'智谱 GLM',zai:'Z.ai'};
 for(const provider of [...new Set(cards.map(c=>c.provider))]){
 nodes.push(text('div','quota-group',(names[provider]||provider).toUpperCase()));
 for(const c of cards.filter(c=>c.provider===provider)){
 const card=text('article','quota-card',''),top=text('div','quota-top',''),account=text('div','quota-account',c.account);account.append(text('div','quota-kind',c.kind));
 if(c.keyHint){const copy=text('button','quota-copy-key','');copy.title='Copy API key';copy.setAttribute('aria-label','Copy API key');
 const icon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';copy.innerHTML=icon;
 copy.onclick=async()=>{copy.disabled=true;try{await window.island.copyKey(c.id);copy.textContent='✓';copy.title='Copied';}catch{copy.textContent='!';copy.title='Could not copy key';}finally{setTimeout(()=>{copy.disabled=false;copy.innerHTML=icon;copy.title='Copy API key'},1500)}};account.append(copy);}

 const rings=text('div','quota-rings','');for(const w of c.windows){const wrap=text('div','quota-window',''),ring=text('div','quota-ring','');ring.style.background=`conic-gradient(${w.usedPercent>85?'#e2b56c':'#b6b8c5'} ${w.usedPercent*3.6}deg,#ffffff12 0)`;ring.append(text('b','',Math.round(w.usedPercent)+'%'));wrap.append(ring,text('small','',w.label));rings.append(wrap)}
 if(c.balance||!c.windows.length)rings.append(text('strong','quota-balance',c.balance||'—'));top.append(account,rings);card.append(top,text('div','quota-note',c.detail));
 for(const w of c.windows.filter(w=>w.resetsAt))card.append(text('div','quota-note',w.label+' 重置于 '+new Date(w.resetsAt).toLocaleString()));
 if(c.history?.length>1){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('quota-chart');svg.setAttribute('viewBox','0 0 400 30');svg.setAttribute('preserveAspectRatio','none');const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',c.history.map((p,i)=>`${i*400/(c.history.length-1)},${28-p.value*.25}`).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#acb9e7');svg.append(line);card.append(svg)}
 if(c.error)card.append(text('div','quota-error',c.error+' · 数值可能过期'));
 card.append(text('div','quota-updated',c.readAt?'更新于 '+new Date(c.readAt).toLocaleTimeString():'本地快照 / 等待查询'));nodes.push(card);
 }}$('quotas').replaceChildren(...nodes);
}
new ResizeObserver(()=>window.island.height(document.getElementById('island').getBoundingClientRect().height)).observe(document.getElementById('island'));

const summary=$('summary');let lastDrag={x:0,y:0};
summary.addEventListener('pointerdown',event=>{
 if(event.button!==0||event.target.closest('button'))return;event.preventDefault();dragging=true;clearTimeout(leave);lastDrag={x:event.screenX,y:event.screenY};summary.setPointerCapture(event.pointerId);$('island').classList.add('dragging');window.island.drag('start',event.screenX,event.screenY);
});
summary.addEventListener('pointermove',event=>{if(!dragging)return;lastDrag={x:event.screenX,y:event.screenY};window.island.drag('move',event.screenX,event.screenY)});
function endDrag(){if(!dragging)return;dragging=false;$('island').classList.remove('dragging');window.island.drag('end',lastDrag.x,lastDrag.y);if(!$('island').matches(':hover'))window.island.expand(false)}
summary.addEventListener('pointerup',endDrag);summary.addEventListener('pointercancel',endDrag);summary.addEventListener('lostpointercapture',endDrag);

$('refresh').onclick=()=>window.island.refresh();
$('close').onclick=()=>window.island.close();
