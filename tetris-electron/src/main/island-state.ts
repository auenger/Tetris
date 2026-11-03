import type {IslandEvent} from './island-events';
export type IslandSession = {id:string;title:string;taskTitle:string;agent:string;cwd:string;status:string;tool:string;started:number;activeSince:number;runningMs:number;updated:number;waitingSince:number;completedAt:number;unread:boolean;avatar:number};
export function createIslandState() {
 const sessions=new Map<string,IslandSession>();let toast={text:'',until:0};
 const make=(id:string):IslandSession=>({id,title:'Codex',taskTitle:'',agent:'Codex',cwd:'',status:'unknown',tool:'状态未知',started:0,activeSince:0,runningMs:0,updated:0,waitingSince:0,completedAt:0,unread:false,avatar:Math.floor(Math.random()*6)});
 return {
  event(e:IslandEvent) {
   const row=sessions.get(e.sessionId)||make(e.sessionId);
   if(e.time<row.updated)return;
   if(row.status==='working'&&['PermissionRequest','Stop','Interrupt'].includes(e.event)){row.runningMs+=Math.max(0,e.time-row.activeSince);row.activeSince=0;}
   row.updated=e.time;if(e.agent){row.agent=e.agent;if(!row.cwd&&!row.taskTitle)row.title=e.agent;}
   if(e.cwd){row.cwd=e.cwd;if(!row.taskTitle)row.title=e.cwd.split('/').filter(Boolean).pop()||'/';}
   if(e.event==='UserPromptSubmit'){row.started=e.time;row.activeSince=e.time;row.runningMs=0;row.status='working';row.tool='思考';row.unread=false;row.waitingSince=0;row.completedAt=0;}
   else if(e.event==='PreToolUse'||e.event==='PostToolUse'){if(row.status!=='working')row.activeSince=e.time;row.status='working';row.tool=e.event==='PreToolUse'?e.tool||'工具调用':'思考';row.started ||= e.time;row.waitingSince=0;row.unread=false;row.completedAt=0;}
   else if(e.event==='PermissionRequest'){if(row.status!=='attention')row.waitingSince=e.time;row.status='attention';row.tool=e.tool||'等待确认或输入';row.unread=false;}
   else if(e.event==='Stop'){
    if(row.status!=='done'){toast={text:row.title+' 本轮回复完成',until:e.time+4000};row.completedAt=e.time;row.unread=true;}
    row.status='done';row.tool='本轮回复完成';row.waitingSince=0;
   }
   else if(e.event==='Interrupt'){row.status='idle';row.tool='已中断';row.waitingSince=0;row.unread=false;}
   else if(e.event==='SessionEnd'){sessions.delete(e.sessionId);return;}
   sessions.set(e.sessionId,row);
  },
  setTitle(id:string,title:string){const row=sessions.get(id);if(!row||row.taskTitle===title)return false;row.taskTitle=title;row.title=title||row.cwd.split('/').filter(Boolean).pop()||row.agent;return true;},
  read(id:string,throughTime=Infinity){const row=sessions.get(id);if(row&&row.status==='done'&&row.completedAt<=throughTime)row.unread=false;},
  forget(id:string){sessions.delete(id);},
  reconcile(roots:{sessionId:string;cwdHostPath:string;name?:string}[]) {
   const active=new Set(roots.map(r=>r.sessionId));
   for(const id of sessions.keys())if(!active.has(id))sessions.delete(id);
   for(const root of roots){
    let row=sessions.get(root.sessionId);
    if(!row){row=make(root.sessionId);sessions.set(root.sessionId,row);}
    if(!row.cwd){row.cwd=root.cwdHostPath;if(!row.taskTitle)row.title=root.cwdHostPath.split('/').filter(Boolean).pop()||root.name||'Codex';}
   }
  },
  shuffleAvatars(){for(const row of sessions.values())row.avatar=(row.avatar+1+Math.floor(Math.random()*5))%6;},
  snapshot(now=Date.now()){return {sessions:[...sessions.values()].map(row=>({...row})).sort((a,b)=>{const rank=(s:IslandSession)=>s.status==='attention'?0:s.status==='done'&&s.unread?1:s.status==='working'?2:3;return rank(a)-rank(b)||(a.status==='attention'&&b.status==='attention'?a.waitingSince-b.waitingSince:0);}),toast:toast.until>now?toast.text:'',time:now};},
 };
}
