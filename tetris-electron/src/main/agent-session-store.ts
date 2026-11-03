import {EventEmitter} from 'node:events';
import {createIslandState} from './island-state';
import {islandEvents} from './island-events';
// One source of truth, alive even when the island window is disabled.
export const agentSessions=createIslandState();
export const agentSessionChanges=new EventEmitter();
export const publishAgentSessions=()=>agentSessionChanges.emit('change');
islandEvents.on('event',event=>{agentSessions.event(event);publishAgentSessions();});
