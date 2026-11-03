export type IslandAnchor={displayId:number;ratio:number};
export function topBounds(area:{x:number;y:number;width:number;height:number},ratio:number,width:number,height:number){
 width=Math.min(width,area.width);height=Math.min(height,area.height);
 const center=area.x+Math.max(0,Math.min(1,ratio))*area.width;
 return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,center-width/2))),y:area.y,width,height};
}
