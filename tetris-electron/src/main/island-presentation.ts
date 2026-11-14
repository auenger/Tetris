import type {IslandSession} from './island-state';
export type AgentActivityStatus='working'|'attention'|'done'|'idle'|'unknown';
export function activityPresentation(sessions:IslandSession[]) {
 const working=sessions.filter(s=>s.status==='working').length;
 const waiting=sessions.filter(s=>s.status==='attention').length;
 const unread=sessions.filter(s=>s.status==='done'&&s.unread).length;
 const unknown=sessions.filter(s=>s.status==='unknown').length;
 const status:AgentActivityStatus=waiting?'attention':working?'working':unread?'done':unknown?'unknown':'idle';
 const label=({attention:`待处理 ${waiting}`,working:`工作中 ${working}`,done:`新完成 ${unread}`,unknown:'未接入',idle:'空闲'})[status];
 const symbol=({attention:'exclamationmark.circle.fill',working:'arrow.triangle.2.circlepath',done:'checkmark.circle.fill',unknown:'questionmark.circle',idle:'pause.circle'})[status];
 const priority=(s:IslandSession)=>s.status==='attention'?0:s.status==='working'?1:s.status==='done'&&s.unread?2:3;
 const rows=[...sessions].sort((a,b)=>priority(a)-priority(b));
 return {status,label,symbol,working,waiting,unread,total:sessions.length,avatar:rows[0]?.avatar??0,
  sessions:rows.slice(0,4).map(s=>({id:s.id,title:s.title.slice(0,80),agent:s.agent.slice(0,30),status:s.status,unread:s.unread}))};
}
