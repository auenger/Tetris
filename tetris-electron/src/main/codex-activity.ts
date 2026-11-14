import { terminalActivity } from './terminal-activity';
export function createActivityTracker() {
  const states = new Map<number, {text:string; changed:number; notice:number; blocked:boolean}>();
  return {
    resolve(pid:number, text:string, notice?:{time:number;kind:string}, now=Date.now()) {
      const previous = states.get(pid) || {text:'',changed:now,notice:0,blocked:false};
      if (text !== previous.text) { previous.text=text; previous.changed=now; }
      const working = terminalActivity(text) === 'working';
      if (notice && notice.time > previous.notice) {previous.notice=notice.time; previous.blocked=true;}
      // An old interrupt footer must disappear before it can represent a new turn.
      if (!working && (!notice || notice.time <= previous.notice)) previous.blocked=false;
      states.set(pid,previous);
      if (notice && (previous.blocked || !working)) return notice.kind === 'complete' ? 'done' : '待确认';
      if (working && now-previous.changed < 30000) return 'working';
      return '状态未接入';
    },
    prune(pids:number[]) { for(const pid of states.keys()) if(!pids.includes(pid)) states.delete(pid); },
  };
}
