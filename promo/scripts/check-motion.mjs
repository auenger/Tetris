import assert from 'node:assert/strict';
import {progress,terminalEntrance} from '../src/anime-motion.mjs';
const frames=Array.from({length:840},(_,i)=>i);
const sample=f=>[
 ...['outExpo','inOutSine','inOutQuint','inOutCubic','outCubic'].map(ease=>progress(f/30,2,.8,ease)),
 ...terminalEntrance(f/30).flatMap(s=>[s.opacity,s.y,s.scale]),
];
const expected=frames.map(sample);
for(const f of [...frames].reverse())assert.deepEqual(sample(f),expected[f]);
for(let i=0;i<840;i++){const f=(i*317)%840;assert.deepEqual(sample(f),expected[f]);}
console.log('840 frames: Anime.js forward, reverse and shuffled seeks agree.');
