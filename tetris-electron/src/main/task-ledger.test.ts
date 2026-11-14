import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTaskSpec, SuperAgentTasks } from './super-agent-tasks';
import { TaskNotificationStore } from './task-notification-store';
import { parseWorkerReport, workerReportInstruction } from './worker-report';
function fixture(fn: (store: SuperAgentTasks, dir: string, path: string) => void) {
 const dir=mkdtempSync(join(tmpdir(),'tetris-ledger-')),path=join(dir,'tasks.json');
 try { fn(new SuperAgentTasks(path),dir,path); } finally { rmSync(dir,{recursive:true,force:true}); }
}
test('migration backup, dispatch idempotence and durable complete tool history',()=>fixture((_store,dir,path)=>{
 writeFileSync(path,JSON.stringify({version:1,tasks:[{id:'old',sessionId:'old',cwd:'/old',title:'Old',runs:[]}]}));
 const store=new SuperAgentTasks(path);
 expect(store.get('old')?.historyIncomplete).toBe(true);
 expect(JSON.parse(readFileSync(path+'.v1.backup','utf8')).version).toBe(1);
 const task=store.register('pending:op','/p','New',{operationId:'op',originConversationId:'conversation-A'});
 expect(store.register('duplicate','/p','Duplicate',{operationId:'op'})).toBe(task);
 store.bindSession(task,'s'); const run=store.start('s','/p','Inspect',{});
 for(let i=0;i<105;i++)store.activity('s',{toolCallId:`t${i}`,status:'completed',rawOutput:'x'.repeat(5000)});
 const events=store.timeline(task),tools=events.filter(e=>e.type==='tool.updated');
 expect(tools).toHaveLength(105);expect(store.get(task)?.runs[0]?.activity).toHaveLength(100);
 expect(readFileSync((tools[0]!.payload as {detailPath:string}).detailPath,'utf8')).toHaveLength(5000);
 expect(events.map(e=>e.sequence)).toEqual(events.map((_,i)=>i+1));
 store.appendOutput('s','durable partial output'); const reloaded=new SuperAgentTasks(path);
 expect(reloaded.get(task)?.runs.find(r=>r.id===run)?.output).toBe('durable partial output');
 expect(reloaded.get(task)?.runs[0]?.status).toBe('interrupted');
 expect(reloaded.get(task)?.originConversationId).toBe('conversation-A');
}),15000);
test('decisions retain natural language, reject stale rounds and deliver only once',()=>fixture(store=>{
 const task=store.register('s','/p','Change'),run=store.start('s','/p','Work',{});
 const request=store.requestDecision(task,run,{question:'是否调整布局？'},'decision-op');
 expect(store.requestDecision(task,run,{question:'是否调整布局？'},'decision-op').id).toBe(request.id);
 expect(()=>store.start('s','/p','Premature',{})).toThrow('human decision');
 const input={userMessageId:'m1',userText:'先补内容，布局别动。',instruction:'补充缺失内容；保持现有布局。'};
 expect(store.resolveDecision(task,request.id,input).alreadyResolved).toBe(false);
 expect(store.resolveDecision(task,request.id,input).alreadyResolved).toBe(true);
 expect(()=>store.resolveDecision(task,request.id,{...input,userMessageId:'m2'})).toThrow('no longer pending');
 store.markDecisionDelivered(task,request.id);store.markDecisionDelivered(task,request.id);
 expect(store.timeline(task).filter(e=>e.type==='decision.delivered')).toHaveLength(1);
 expect(store.get(task)?.decisions?.[0]?.response?.userText).toBe(input.userText);
 const next=store.start('s','/p',input.instruction,{});expect(next).not.toBe(run);
 expect(()=>store.requestDecision(task,run,{question:'late'})).toThrow('Stale');
 expect(()=>store.applyReport({taskId:task,runId:run,status:'completed',summary:'late'})).toThrow('Stale');
}));
test('permission output survives restart but live permission request expires',()=>fixture((store,_dir,path)=>{
 const task=store.register('s','/p','Work'),run=store.start('s','/p','Work',{});
 const d=store.requestDecision(task,run,{kind:'permission',question:'Allow?',permissionRequestId:'p1',options:[{optionId:'yes',kind:'allow_once'},{optionId:'always',kind:'allow_always'}]});
 store.appendOutput('s','waiting output');store.activity('s',{toolCallId:'read',status:'completed',rawOutput:'content'});
 expect(()=>store.resolveDecision(task,d.id,{userMessageId:'m',userText:'允许',instruction:'允许',optionId:'always'})).toThrow('one-time');
 const restored=new SuperAgentTasks(path);expect(restored.get(task)?.runs[0]?.output).toBe('waiting output');
 expect(restored.get(task)?.runs[0]?.status).toBe('interrupted');expect(restored.get(task)?.decisions?.[0]?.status).toBe('cancelled');
 expect(()=>restored.resolveDecision(task,d.id,{userMessageId:'m',userText:'允许',instruction:'允许',optionId:'yes'})).toThrow();
}));
test('report artifacts are immutable and completion differs from acceptance',()=>fixture((store,dir)=>{
 const task=store.register('s','/p','Report'),run=store.start('s','/p','Report',{}),source=join(dir,'report.md');
 writeFileSync(source,'Version one');const one=store.attachArtifact(run,source);expect(store.attachArtifact(run,source).id).toBe(one.id);
 writeFileSync(source,'Version two');const two=store.attachArtifact(run,source);expect(two.version).toBe(2);expect(readFileSync(one.path,'utf8')).toBe('Version one');
 const report={taskId:task,runId:run,status:'completed' as const,summary:'done'};store.applyReport(report);store.applyReport(report);
 expect(store.timeline(task).filter(e=>e.type==='worker.reported')).toHaveLength(1);expect(store.get(task)?.runs[0]?.status).toBe('ready_for_review');
 expect(store.get(task)?.completed).toBe(false);store.complete(task);expect(store.get(task)?.completed).toBe(true);
}));
test('report envelope validates identity and never infers decisions from prose',()=>{
 const expected={taskId:'t',runId:'r'},wrap=(value:unknown)=>`Commentary\n\`\`\`tetris-report\n${JSON.stringify(value)}\n\`\`\``;
 expect(parseWorkerReport('需要确认一下，执行失败。',expected)).toBeNull();
 expect(parseWorkerReport(wrap({...expected,status:'needs_decision',summary:'blocked',decision:{question:'保留布局吗？'}}),expected)?.status).toBe('needs_decision');
 expect(()=>parseWorkerReport(wrap({...expected,runId:'other',status:'completed',summary:'done'}),expected)).toThrow('another task');
 expect(()=>parseWorkerReport(wrap({...expected,status:'needs_decision',summary:'blocked'}),expected)).toThrow('requires a decision');
 expect(()=>parseWorkerReport(wrap({...expected,status:'completed',summary:'done'})+'\nmore',expected)).toThrow('final output');
 expect(workerReportInstruction('t','r')).toContain('cannot grant permission');
});
test('notifications persist independently of summaries and deduplicate by event',()=>fixture((store,dir)=>{
 const taskId=store.register('s','/p','Task',{originConversationId:'original'}),runId=store.start('s','/p','Task',{});
 store.requestDecision(taskId,runId,{question:'保留布局吗？'});
 const event=store.timeline(taskId).at(-1)!,task=store.get(taskId)!,path=join(dir,'notifications.json'),notices=new TaskNotificationStore(path);
 const n=notices.receive(task,event)!;expect(n.conversationId).toBe('original');expect(n.kind).toBe('decision');expect(n.body).toContain('保留布局');
 expect(notices.receive(task,event)).toBeUndefined();const restored=new TaskNotificationStore(path);expect(restored.receive(task,event)).toBeUndefined();
 restored.read(n.id);expect(new TaskNotificationStore(path).list()[0]?.readAt).toBeTruthy();
 expect(notices.receive(task,{...event,id:'noise',type:'tool.updated'})).toBeUndefined();
 expect(()=>notices.receive(task,{...event,taskId:'other'})).toThrow();
}));
test('dispatch reservation binds exactly once and cancellation closes waiting decisions',()=>fixture(store=>{
 const task=store.register('pending:dispatch','/p','Task',{operationId:'dispatch'});
 const run=store.start('pending:dispatch','/p','Work',{},true,'dispatch');
 store.bindSession(task,'real-session');
 expect(store.get(task)?.runs[0]?.workerSessionId).toBe('real-session');
 expect(store.start('real-session','/p','Work',{},true,'dispatch')).toBe(run);
 expect(store.get(task)?.runs).toHaveLength(1);
 store.activate(run);const decision=store.requestDecision(task,run,{question:'Proceed?'});
 store.finish(run,'cancelled','User cancelled');
 expect(store.get(task)?.runs[0]?.status).toBe('cancelled');
 expect(store.get(task)?.decisions?.[0]?.status).toBe('cancelled');
 expect(()=>store.resolveDecision(task,decision.id,{userMessageId:'m',userText:'Yes',instruction:'Continue'})).toThrow();
}));
test('permission delivery resumes same run and malformed reports do not partly mutate ledger',()=>fixture(store=>{
 const task=store.register('s','/p','Task'),run=store.start('s','/p','Work',{});
 const decision=store.requestDecision(task,run,{kind:'permission',question:'Allow?',permissionRequestId:'p',options:[{optionId:'yes',kind:'allow_once'}]});
 const reply={userMessageId:'m',userText:'只允许这一次',instruction:'Allow once',optionId:'yes'};
 store.resolveDecision(task,decision.id,reply);store.markDecisionDelivered(task,decision.id);
 expect(store.get(task)?.runs[0]?.status).toBe('running');expect(store.get(task)?.runs).toHaveLength(1);
 expect(()=>store.resolveDecision(task,decision.id,{...reply,instruction:'Changed'})).toThrow('different content');
 const count=store.timeline(task).length;
 expect(()=>store.applyReport({taskId:task,runId:run,status:'needs_decision',summary:'Missing question'})).toThrow();
 expect(store.get(task)?.runs[0]?.report).toBeUndefined();expect(store.timeline(task)).toHaveLength(count);
}));
test('restart before decision enqueue marks delivery unconfirmed and blocks idle run without replay',()=>fixture((store,_dir,path)=>{
 const task=store.register('s','/p','Task'),run=store.start('s','/p','Original goal',{});
 const d=store.requestDecision(task,run,{question:'Which option?'});
 const input={userMessageId:'human-message',userText:'选择 B，保留现有样式。',instruction:'Choose B without changing style.'};
 store.resolveDecision(task,d.id,input);
 const recovered=new SuperAgentTasks(path),saved=recovered.get(task)!;
 expect(saved.runs).toHaveLength(1);expect(saved.runs[0]?.status).toBe('blocked');
 expect(saved.decisions?.[0]?.status).toBe('resolved');expect(saved.decisions?.[0]?.response).toMatchObject({...input,deliveryStatus:'unconfirmed',deliveryDetail:'应用关闭时交付未确认，未自动重放'});
 expect(recovered.timeline(task).filter(e=>e.type==='decision.delivery_unconfirmed')).toHaveLength(1);
 expect(recovered.timeline(task).filter(e=>e.type==='run.blocked')).toHaveLength(1);
 expect(recovered.timeline(task).filter(e=>e.type==='decision.delivered')).toHaveLength(0);
 expect(recovered.resolveDecision(task,d.id,input).alreadyResolved).toBe(true);
 expect(new SuperAgentTasks(path).timeline(task)).toEqual(recovered.timeline(task));
}));
test('restart after durable continuation enqueue quarantines instructions or interrupts run without redelivery',()=>{
 for(const queuedRun of [false,true])fixture((store,_dir,path)=>{
  const task=store.register('s','/p','Task'),run=store.start('s','/p','Goal',{}),d=store.requestDecision(task,run,{question:'Continue?'});
  const input={userMessageId:'m',userText:'只补内容。',instruction:'Add missing content only.'};store.resolveDecision(task,d.id,input);
  if(queuedRun)store.start('s','/p',input.instruction,{},true,'continuation');else store.enqueue('s',input.instruction);
  const recovered=new SuperAgentTasks(path),saved=recovered.get(task)!;
  expect(saved.decisions?.[0]?.response).toMatchObject({...input,deliveryStatus:'unconfirmed'});
  expect(saved.runs).toHaveLength(queuedRun?2:1);
  expect(saved.runs.at(-1)?.status).toBe(queuedRun?'interrupted':'blocked');
  expect(saved.pendingMessages||[]).toEqual([]);
  if(!queuedRun)expect(recovered.timeline(task).find(e=>e.type==='instructions.interrupted')?.payload).toMatchObject({texts:[input.instruction]});
  expect(recovered.timeline(task).filter(e=>e.type==='decision.delivered')).toHaveLength(0);
  expect(new SuperAgentTasks(path).timeline(task)).toEqual(recovered.timeline(task));
 });
});
test('fresh continuation after restart cannot replay a previously queued decision instruction',()=>fixture((store,_dir,path)=>{
 const task=store.register('s','/p','Task'),run=store.start('s','/p','Goal',{}),d=store.requestDecision(task,run,{question:'Continue?'});
 const original='只补内容，保留现有布局。',instruction='Add content and preserve layout.';
 store.resolveDecision(task,d.id,{userMessageId:'original-user-message',userText:original,instruction});
 store.enqueue('s',instruction);store.enqueue('s','Also check the footer.');
 const recovered=new SuperAgentTasks(path);
 expect(recovered.get(task)?.runs[0]?.status).toBe('blocked');
 const next=recovered.start('s','/p','Fresh explicit user continuation',{});
 recovered.finish(next,'ready_for_review');
 expect(recovered.takeNext('s')).toBeUndefined();
 expect(recovered.get(task)?.runs).toHaveLength(2);
 expect(recovered.get(task)?.decisions?.[0]?.response).toMatchObject({userText:original,instruction,deliveryStatus:'unconfirmed'});
 expect(recovered.timeline(task).filter(e=>e.type==='instructions.interrupted').map(e=>e.payload)).toEqual([{texts:[instruction,'Also check the footer.'],reason:'应用关闭时排队指令尚未执行，未自动重放'}]);
 expect(new SuperAgentTasks(path).timeline(task).filter(e=>e.type==='instructions.interrupted')).toHaveLength(1);
}));
test('restart preserves confirmed delivery and marks uncertain native permission response without granting it',()=>{
 for(const delivered of [false,true])fixture((store,_dir,path)=>{
  const task=store.register('s','/p','Task'),run=store.start('s','/p','Goal',{});
  const d=store.requestDecision(task,run,{kind:'permission',question:'Allow?',permissionRequestId:'p',options:[{optionId:'once',kind:'allow_once'}]});
  const input={userMessageId:'m',userText:'只允许这一次。',instruction:'Allow once',optionId:'once'};store.resolveDecision(task,d.id,input);
  if(delivered)store.markDecisionDelivered(task,d.id);
  const recovered=new SuperAgentTasks(path),saved=recovered.get(task)!;
  expect(saved.runs).toHaveLength(1);expect(saved.runs[0]?.status).toBe('interrupted');
  expect(saved.decisions?.[0]?.response).toMatchObject({...input,deliveryStatus:delivered?'delivered':'unconfirmed'});
  expect(recovered.timeline(task).filter(e=>e.type==='decision.delivered')).toHaveLength(delivered?1:0);
  expect(recovered.timeline(task).filter(e=>e.type==='decision.delivery_unconfirmed')).toHaveLength(delivered?0:1);
  expect(new SuperAgentTasks(path).timeline(task)).toEqual(recovered.timeline(task));
 });
});
test('confirmed ordinary decision remains delivered while saved continuation is interrupted on restart',()=>fixture((store,_dir,path)=>{
 const task=store.register('s','/p','Task'),run=store.start('s','/p','Goal',{}),d=store.requestDecision(task,run,{question:'Continue?'});
 const input={userMessageId:'m',userText:'按 B 继续',instruction:'Continue option B'};
 store.resolveDecision(task,d.id,input);store.start('s','/p',input.instruction,{},true,'continuation');store.markDecisionDelivered(task,d.id);
 const recovered=new SuperAgentTasks(path),saved=recovered.get(task)!;
 expect(saved.runs).toHaveLength(2);expect(saved.runs.at(-1)?.status).toBe('interrupted');
 expect(saved.decisions?.[0]?.response).toMatchObject({...input,deliveryStatus:'delivered'});
 expect(recovered.timeline(task).filter(e=>e.type==='decision.delivery_unconfirmed')).toHaveLength(0);
 expect(recovered.timeline(task).filter(e=>e.type==='decision.delivered')).toHaveLength(1);
}));
test('live failed decision delivery blocks only idle latest run and retains original response',()=>fixture(store=>{
 const task=store.register('s','/p','Task'),run=store.start('s','/p','Goal',{}),d=store.requestDecision(task,run,{question:'Continue?'});
 store.resolveDecision(task,d.id,{userMessageId:'m',userText:'继续，只补内容',instruction:'Continue content only'});
 store.markDecisionDeliveryFailed(task,d.id,'Canvas disconnected');store.markDecisionDeliveryFailed(task,d.id,'Canvas disconnected');
 expect(store.get(task)?.runs[0]?.status).toBe('blocked');
 expect(store.get(task)?.decisions?.[0]?.response).toMatchObject({userText:'继续，只补内容',deliveryStatus:'failed',deliveryDetail:'Canvas disconnected'});
 expect(store.timeline(task).filter(e=>e.type==='run.blocked')).toHaveLength(1);
 expect(store.timeline(task).filter(e=>e.type==='decision.delivery_failed')).toHaveLength(1);
}));
test('TaskSpec preserves explicit scope and acceptance while resolving the physical worktree',()=>fixture(store=>{
 const spec=makeTaskSpec({goal:'Read project and write report',workspaceId:'workspace-1',sourceCwd:'/project',executionCwd:'/project',provider:'claude',scope:['Read only; do not change source'],expectedArtifacts:['report.md'],acceptance:['Include actual commands and findings']});
 const task=store.register('s','/project','Task',{provider:'claude',spec});
 store.updateSession('s',{cwd:'/worktree',sourceCwd:'/project'});
 expect(store.get(task)?.spec).toEqual({...spec,executionCwd:'/worktree'});
 expect(store.timeline(task).filter(e=>e.type==='task.specified')).toHaveLength(1);
 expect(store.timeline(task).filter(e=>e.type==='task.execution_resolved')).toHaveLength(1);
 const defaultSpec=makeTaskSpec({goal:'Inspect only',workspaceId:'p',sourceCwd:'/p',executionCwd:'/p',provider:'codex'});
 expect(defaultSpec.acceptance).toEqual([]);expect(defaultSpec.expectedArtifacts).toEqual([]);
 expect(()=>makeTaskSpec({...defaultSpec,scope:[42 as unknown as string]})).toThrow('TaskSpec scope');
}));
test('raw stop reason is durable and abnormal stop cannot promote a completed report to success',()=>{
 for(const reason of ['end_turn','max_tokens','refusal'])fixture((store,_dir,path)=>{
  const task=store.register('s','/p','Task'),run=store.start('s','/p','Goal',{});
  store.recordStopReason(run,reason);store.recordStopReason(run,reason);
  store.applyReport({taskId:task,runId:run,status:'completed',summary:'Claimed done'});
  const recovered=new SuperAgentTasks(path),saved=recovered.get(task)!.runs[0]!;
  expect(saved.stopReason).toBe(reason);expect(saved.report?.summary).toBe('Claimed done');
  expect(saved.status).toBe(reason==='end_turn'?'ready_for_review':'blocked');
  expect(recovered.timeline(task).filter(e=>e.type==='run.stopped')).toHaveLength(1);
 });
});
test('accepted task instructions atomically retain raw user intent with stable operation identity',()=>fixture((store,_dir,path)=>{
 const create={action:'create_task' as const,conversationId:'conversation-a',userMessageId:'user-create',userText:'先看看这个项目，不要改代码。',instruction:'Inspect the project without edits.',operationId:'create-op'};
 const task=store.register('s','/p','Inspect',{operationId:create.operationId},create),first=store.start('s','/p',create.instruction,{});
 store.finish(first,'ready_for_review');
 const follow={...create,action:'send_task_message' as const,userMessageId:'user-follow',userText:'刚才那项补充检查一下页脚，但仍然不要修改。',instruction:'Read the footer only; do not edit.',operationId:'follow-op'};
 const second=store.start('s','/p',follow.instruction,{},true,follow.operationId,follow);
 expect(store.start('s','/p',follow.instruction,{},true,follow.operationId,follow)).toBe(second);
 const queued={...follow,userMessageId:'user-queued',userText:'还有，列出缺失链接。',instruction:'List missing links.',operationId:'queue-op'};
 store.enqueue('s',queued.instruction,queued);store.enqueue('s',queued.instruction,queued);
 expect(store.get(task)?.pendingMessages).toEqual([queued.instruction]);
 const persisted=JSON.parse(readFileSync(path,'utf8')).tasks[0];
 expect(persisted.events.filter((e:{type:string})=>e.type==='user.intent').map((e:{payload:unknown})=>e.payload)).toEqual([create,follow,queued]);
 const restored=new SuperAgentTasks(path),events=restored.timeline(task).filter(e=>e.type==='user.intent');
 expect(events).toHaveLength(3);expect(events[1]?.runId).toBe(second);
 expect(events.map(e=>e.operationId)).toEqual(['user-intent:create-op','user-intent:follow-op','user-intent:queue-op']);
 expect(events.every(e=>e.actor==='user')).toBe(true);
 expect(restored.get(task)?.pendingMessages).toEqual([]);
}));
