import {test,expect} from 'bun:test';
import {topBounds} from './island-position';
test('stays flush to top and keeps compact/expanded island within screen edges',()=>{
 const area={x:0,y:0,width:1440,height:900};
 expect(topBounds(area,.5,238,40)).toEqual({x:601,y:0,width:238,height:40});
 expect(topBounds(area,0,460,520).x).toBe(0);expect(topBounds(area,1,460,520).x).toBe(980);
 expect(topBounds(area,.8,238,40).y).toBe(0);
});
test('supports negative monitor coordinates and smaller displays',()=>{expect(topBounds({x:-1280,y:-800,width:1280,height:800},0,460,520)).toEqual({x:-1280,y:-800,width:460,height:520});expect(topBounds({x:0,y:0,width:400,height:300},1,460,520)).toEqual({x:0,y:0,width:400,height:300})});
