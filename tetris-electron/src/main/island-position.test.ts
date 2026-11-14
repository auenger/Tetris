import {test,expect} from 'bun:test';
import {topBounds,islandLayout,parseDisplayNotches} from './island-position';
test('stays flush to top and keeps compact/expanded island within screen edges',()=>{
 const area={x:0,y:0,width:1440,height:900};
 expect(topBounds(area,.5,238,40)).toEqual({x:601,y:0,width:238,height:40});
 expect(topBounds(area,0,460,520).x).toBe(0);expect(topBounds(area,1,460,520).x).toBe(980);
 expect(topBounds(area,.8,238,40).y).toBe(0);
});
test('supports negative monitor coordinates and smaller displays',()=>{expect(topBounds({x:-1280,y:-800,width:1280,height:800},0,460,520)).toEqual({x:-1280,y:-800,width:460,height:520});expect(topBounds({x:0,y:0,width:400,height:300},1,460,520)).toEqual({x:0,y:0,width:400,height:300})});

test('notch layout uses display ID and logical geometry instead of CPU or saved drag position',()=>{
 const primary={id:2,bounds:{x:0,y:0,width:2560,height:1440}};
 const laptop={id:1,bounds:{x:-1512,y:100,width:1512,height:982}};
 const notch={displayId:1,x:666,width:180,height:32};
 const layout=islandLayout([primary,laptop],primary,[notch],{displayId:2,ratio:.1},false,500);
 expect(layout.mode).toBe('notch');expect(layout.bounds).toEqual({x:-922,y:100,width:332,height:40});
 expect(layout.notchWidth).toBe(180);
 const opened=islandLayout([primary,laptop],primary,[notch],null,true,510);
 expect(opened.bounds).toEqual({x:-956,y:100,width:400,height:420});
});
test('large notch and scaled menu bar remain fully reserved',()=>{
 const d={id:1,bounds:{x:0,y:0,width:1800,height:1100}};
 const l=islandLayout([d],d,[{displayId:1,x:750,width:300,height:48}],null,true,40);
 expect(l.bounds.width).toBe(400);expect(l.headerHeight).toBe(92);expect(l.bounds.height).toBe(92);expect(l.bounds.y).toBe(0);
});
test('unplugged notch display falls back to saved external display or primary',()=>{
 const d={id:2,bounds:{x:100,y:-900,width:1440,height:900}};
 expect(islandLayout([d],d,[{displayId:1,x:600,width:200,height:32}],{displayId:2,ratio:1},false,40)).toMatchObject({mode:'floating',bounds:{x:1302,y:-900,width:238,height:40}});
 expect(islandLayout([d],d,[],{displayId:99,ratio:.5},false,40).bounds.x).toBe(701);
});
test('malformed native geometry cannot create unsafe window bounds',()=>{
 expect(parseDisplayNotches(null)).toEqual([]);
 expect(parseDisplayNotches([{displayId:1,x:1,width:NaN,height:40},{displayId:1,x:-1,width:200,height:40},{displayId:1,x:1,width:200,height:0}])).toEqual([]);
 const n={displayId:1,x:700,width:100,height:40};expect(parseDisplayNotches([n])).toEqual([n]);
});

test('small system island reserves the camera between compact avatar and status wings',()=>{
 const d={id:1,bounds:{x:0,y:0,width:1512,height:982}};
 const n={displayId:1,x:726.5,width:59,height:40};
 const closed=islandLayout([d],d,[n],null,false,420);
 expect(closed.bounds).toEqual({x:651,y:0,width:211,height:48});
 expect(closed.bounds.x+32).toBeLessThan(n.x);
 expect(closed.bounds.x+76+closed.notchWidth+6).toBeGreaterThan(n.x+n.width);
 expect(closed.bounds.y+closed.bounds.height).toBe(n.height+8);
 const opened=islandLayout([d],d,[n],null,true,420);
 expect(opened.bounds.width).toBe(400);expect(opened.headerHeight).toBe(84);expect(opened.bounds.y).toBe(0);
});
