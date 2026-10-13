import { test, expect } from 'bun:test';
import { createGroupModel } from './canvas-groups.js';
const fixture = () => [{id:'a',x:100,y:80,width:400,height:300},{id:'b',x:560,y:180,width:200,height:240}];
test('collapse and expand preserve layout; moving a collapsed group preserves offsets', () => {
  const tiles = fixture(); const m = createGroupModel(tiles);
  const g = m.create(['a','b'], ' 工作区 ');
  expect(g.name).toBe('工作区'); expect(m.isHidden('a')).toBe(true);
  expect(tiles).toEqual(fixture());
  m.move(g, 40, -20); g.collapsed = false;
  expect(m.isHidden('a')).toBe(false);
  expect(tiles[0].x).toBe(140); expect(tiles[1].x - tiles[0].x).toBe(460);
  expect(m.bounds(g)).toEqual({x:140,y:60,width:660,height:340});
});
test('saved groups round trip, tolerate stale and duplicate members', () => {
  const m = createGroupModel(fixture()); m.create(['a','b'], '任务');
  const n = createGroupModel(fixture()); n.restore(JSON.parse(JSON.stringify(m.serialize())));
  expect(n.serialize()).toEqual(m.serialize());
  n.restore([{id:'g',tileIds:['a','a','missing'],collapsed:true},{id:'h',tileIds:['a','b']}]);
  expect(n.groups.map(g=>g.tileIds)).toEqual([['a'],['b']]);
  n.restore(null); expect(n.groups).toEqual([]);
});
test('ungroup and deleted members never delete other tiles', () => {
  const tiles=fixture(); const m=createGroupModel(tiles); const g=m.create(['a','b'],'A');
  expect(m.create(['a','b'],'B')).toBe(null);
  tiles.splice(0,1); m.prune(); expect(g.tileIds).toEqual(['b']);
  m.remove(g); expect(m.isHidden('b')).toBe(false); expect(tiles).toHaveLength(1);
  expect(m.create(['b'],'single')).toBe(null);
});

test('resizing persists empty space, contains members, and moves frame with content', () => {
  const tiles=fixture(), m=createGroupModel(tiles), g=m.create(['a','b'],'area');
  g.collapsed=false;
  m.resize(g,{x:40,y:20,width:1000,height:800});
  expect(m.bounds(g)).toEqual({x:40,y:20,width:1000,height:800});
  const restored=createGroupModel(tiles); restored.restore(m.serialize());
  expect(restored.bounds(restored.groups[0])).toEqual(m.bounds(g));
  m.move(g,20,40); expect(m.bounds(g).x).toBe(60); expect(tiles[0].x).toBe(120);
  m.resize(g,{x:500,y:500,width:1,height:1});
  const b=m.bounds(g); expect(b.x).toBeLessThanOrEqual(tiles[0].x);
  expect(b.x+b.width).toBeGreaterThanOrEqual(tiles[1].x+tiles[1].width);
});
test('new and dropped tiles join expanded area; collapsed and outside groups do not capture', () => {
  const tiles=fixture(), m=createGroupModel(tiles), g=m.create(['a','b'],'area');
  tiles.push({id:'c',x:800,y:100,width:100,height:100});
  expect(m.adoptAt([tiles[2]],200,100)).toBeNull();
  g.collapsed=false; m.resize(g,{x:80,y:60,width:1000,height:600});
  expect(m.adoptAt([tiles[2]],800,100)).toBe(g);
  expect(g.tileIds).toEqual(['a','b','c']);
  m.adoptAt([tiles[2]],800,100); expect(g.tileIds).toHaveLength(3);
  expect(m.adoptAt([tiles[2]],2000,100)).toBeNull();
});
