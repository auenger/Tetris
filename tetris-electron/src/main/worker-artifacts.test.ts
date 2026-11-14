import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { SuperAgentTasks } from './super-agent-tasks';
import { artifactIsText, snapshotWorkerArtifacts } from './worker-artifacts';

test('formal deliverable versions preserve bytes/extension and cannot replace primary result summary', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tetris-deliverable-'));
 try{
  const root=join(dir,'project');mkdirSync(root);
  const store=new SuperAgentTasks(join(dir,'tasks.json')),task=store.register('s',root,'Task'),run=store.start('s',root,'Produce output',{});
  const summary=join(dir,'summary.md');writeFileSync(summary,'App result summary');const primary=store.attachArtifact(run,summary,'result-summary');
  const output=join(root,'output.json');writeFileSync(output,'{"version":1}');await snapshotWorkerArtifacts(store,task,run,root,['output.json']);
  writeFileSync(output,'{"version":2}');await snapshotWorkerArtifacts(store,task,run,root,['output.json']);await snapshotWorkerArtifacts(store,task,run,root,['output.json']);
  const saved=store.get(task)!,files=saved.artifacts!.filter(a=>a.kind==='deliverable');
  expect(files).toHaveLength(2);expect(files.map(a=>readFileSync(a.path,'utf8'))).toEqual(['{"version":1}','{"version":2}']);
  expect(files.every(a=>extname(a.path)==='.json')).toBe(true);expect(files[1]!.version).toBeGreaterThan(files[0]!.version);
  expect(saved.runs[0]!.artifactPath).toBe(primary.path);
  const view=store.artifactView(run,files[0]!.id);writeFileSync(view,'editor changes');expect(readFileSync(files[0]!.path,'utf8')).toBe('{"version":1}');
  expect(()=>store.artifactView(run,'foreign-artifact')).toThrow('does not belong');
  writeFileSync(join(root,'image.png'),Buffer.from([137,80,78,71,0,255]));await snapshotWorkerArtifacts(store,task,run,root,['image.png']);
  const binary=store.get(task)!.artifacts!.at(-1)!;expect(extname(binary.path)).toBe('.png');expect(artifactIsText(binary.path,readFileSync(binary.path))).toBe(false);
  expect(artifactIsText(files[0]!.path,readFileSync(files[0]!.path))).toBe(true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('missing and escaped formal artifacts are recorded without reading outside workspace',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tetris-deliverable-scope-'));
 try{
  const root=join(dir,'project');mkdirSync(root);writeFileSync(join(dir,'outside.txt'),'outside');symlinkSync(join(dir,'outside.txt'),join(root,'escape.txt'));
  const store=new SuperAgentTasks(join(dir,'tasks.json')),task=store.register('s',root,'Task'),run=store.start('s',root,'Produce output',{});
  const paths=['missing.md','../outside.txt','escape.txt'];const issues=await snapshotWorkerArtifacts(store,task,run,root,paths);await snapshotWorkerArtifacts(store,task,run,root,paths);
  expect(store.get(task)!.artifacts).toHaveLength(0);
  const unavailable=store.timeline(task).filter(e=>e.type==='artifact.unavailable');expect(unavailable).toHaveLength(3);
  expect(unavailable.map(e=>(e.payload as {declaredPath:string}).declaredPath)).toEqual(paths);
  store.recordStopReason(run,'end_turn');store.applyReport({taskId:task,runId:run,status:'completed',summary:'Claimed produced files',artifacts:paths},issues);
  expect(store.get(task)!.runs[0]?.status).toBe('blocked');expect(store.get(task)!.runs[0]?.report?.status).toBe('completed');
  expect(store.get(task)!.runs[0]?.detail).toContain('正式产物未完整归档');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
