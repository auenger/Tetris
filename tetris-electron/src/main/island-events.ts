import { EventEmitter } from 'node:events';
export const islandEvents = new EventEmitter();
export type IslandEvent = {sessionId:string; event:string; agent?:string; tool?:string; cwd?:string; time:number};
