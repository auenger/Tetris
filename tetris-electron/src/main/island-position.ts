export type IslandAnchor={displayId:number;ratio:number};
export function topBounds(area:{x:number;y:number;width:number;height:number},ratio:number,width:number,height:number){
 width=Math.min(width,area.width);height=Math.min(height,area.height);
 const center=area.x+Math.max(0,Math.min(1,ratio))*area.width;
 return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,center-width/2))),y:area.y,width,height};
}

export type DisplayNotch = {displayId:number;x:number;width:number;height:number};
type IslandDisplay = {id:number;bounds:{x:number;y:number;width:number;height:number}};

export function parseDisplayNotches(value:unknown):DisplayNotch[] {
 if(!Array.isArray(value))return [];
 return value.filter((n):n is DisplayNotch=>n!==null&&typeof n==='object'&&
  ['displayId','x','width','height'].every(key=>typeof n[key]==='number'&&Number.isFinite(n[key]))&&
  n.x>=0&&n.width>0&&n.height>0&&n.height<=200);
}

export function islandLayout(displays:IslandDisplay[],primary:IslandDisplay,notches:DisplayNotch[],anchor:IslandAnchor|null,expanded:boolean,contentHeight:number) {
 // Prefer the actual camera housing over a legacy floating-panel position.
 const notched=displays.find(d=>notches.some(n=>n.displayId===d.id&&n.x+n.width<=d.bounds.width));
 const display=notched||displays.find(d=>d.id===anchor?.displayId)||primary;
 const notch=notched?notches.find(n=>n.displayId===display.id)!:null;
 const compactHeight=notch?Math.ceil(notch.height)+8:40;
 const headerHeight=notch?(expanded?compactHeight+36:compactHeight):40;
 const gap=notch?Math.ceil(notch.width):0;
 const ratio=notch?(notch.x+notch.width/2)/display.bounds.width:anchor?.ratio??.5;
 // Equal 76pt wings flank the camera, flush from screen top to 8pt below its lower edge.
 // Keep all avatar/status content outside the native camera exclusion area.
 if(notch&&!expanded){
  return {bounds:{x:Math.round(display.bounds.x+notch.x-76),
   y:Math.round(display.bounds.y),width:76+gap+76,height:compactHeight},
   mode:'notch' as const,headerHeight,notchWidth:gap};
 }
 const width=notch?400:expanded?460:238;
 const area=display.bounds;
 const bounds=topBounds(area,ratio,width,expanded?Math.min(notch?420:520,Math.max(headerHeight,contentHeight)):headerHeight);
 return {bounds,mode:notch?'notch' as const:'floating' as const,headerHeight,notchWidth:gap};
}
