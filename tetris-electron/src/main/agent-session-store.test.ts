import {test,expect} from 'bun:test';
import {agentSessions,agentSessionChanges} from './agent-session-store';
import {islandEvents} from './island-events';
test('session updates are available to multiple subscribers without an island window',()=>{
 let updates=0;const listener=()=>updates++;agentSessionChanges.on('change',listener);
 try{islandEvents.emit('event',{sessionId:'shared-test',agent:'Claude Code',event:'UserPromptSubmit',time:100});
 const tiles=agentSessions.snapshot(200);const island=agentSessions.snapshot(200);expect(tiles).toEqual(island);expect(tiles.sessions.find(s=>s.id==='shared-test')?.status).toBe('working');expect(updates).toBe(1);
 }finally{agentSessions.forget('shared-test');agentSessionChanges.off('change',listener);}
});
