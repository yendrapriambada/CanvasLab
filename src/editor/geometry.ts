import type { SceneObject } from '../lib/model';
export type Point = {x:number;y:number};
export type Camera = Point & {zoom:number};
export type Bounds = Point & {width:number;height:number};
export const uid=()=>crypto.randomUUID();
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function rotate(p:Point,angle:number,center:Point):Point { const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return {x:center.x+(p.x-center.x)*c-(p.y-center.y)*s,y:center.y+(p.x-center.x)*s+(p.y-center.y)*c}; }
export function box(o:SceneObject):Bounds {const c={x:o.x+o.width/2,y:o.y+o.height/2};const pts=[{x:o.x,y:o.y},{x:o.x+o.width,y:o.y},{x:o.x,y:o.y+o.height},{x:o.x+o.width,y:o.y+o.height}].map(p=>rotate(p,o.rotation||0,c));return {x:Math.min(...pts.map(p=>p.x)),y:Math.min(...pts.map(p=>p.y)),width:Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),height:Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y))};}
export function bounds(objects:SceneObject[]):Bounds {if(!objects.length)return {x:0,y:0,width:900,height:650};const bs=objects.map(box),x=Math.min(...bs.map(o=>o.x)),y=Math.min(...bs.map(o=>o.y));return {x,y,width:Math.max(...bs.map(o=>o.x+o.width))-x,height:Math.max(...bs.map(o=>o.y+o.height))-y};}
export function contains(o:SceneObject,p:Point){const t=rotate(p,-(o.rotation||0),{x:o.x+o.width/2,y:o.y+o.height/2});return t.x>=o.x&&t.x<=o.x+o.width&&t.y>=o.y&&t.y<=o.y+o.height;}
export function intersects(a:Bounds,b:Bounds){return a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y;}
export type ConnectorAnchor = 'top' | 'right' | 'bottom' | 'left';
const EPSILON = 1e-7;
const isAnchor = (value: unknown): value is ConnectorAnchor =>
  value === 'top' || value === 'right' || value === 'bottom' || value === 'left';
const samePoint = (a: Point, b: Point) => Math.abs(a.x-b.x)<EPSILON && Math.abs(a.y-b.y)<EPSILON;
const centerOf = (o: SceneObject): Point => ({ x:o.x+o.width/2, y:o.y+o.height/2 });

/** Intersect a ray from the object's center with its actual rendered boundary. */
export function boundary(o:SceneObject,toward:Point):Point {
 const c=centerOf(o),t=rotate(toward,-(o.rotation||0),c);
 let dx=t.x-c.x;
 const dy=t.y-c.y;
 // Coincident object centers still produce a deterministic, finite attachment.
 if(Math.abs(dx)+Math.abs(dy)<EPSILON)dx=1;
 const rx=Math.max(o.width/2,EPSILON),ry=Math.max(o.height/2,EPSILON);
 let scale:number;
 if(o.type==='ellipse')scale=1/Math.sqrt(dx*dx/(rx*rx)+dy*dy/(ry*ry));
 else if(o.type==='diamond')scale=1/(Math.abs(dx)/rx+Math.abs(dy)/ry);
 else if(o.type==='triangle'){
  const vertices=[{x:0,y:-ry},{x:rx,y:ry},{x:-rx,y:ry}];
  scale=Infinity;
  // Ray/segment intersection: ray * t = segmentStart + segmentDirection * u.
  for(let i=0;i<3;i++){
   const a=vertices[i],b=vertices[(i+1)%3],ex=b.x-a.x,ey=b.y-a.y;
   const determinant=dx*ey-dy*ex;
   if(Math.abs(determinant)<EPSILON)continue;
   const distance=(a.x*ey-a.y*ex)/determinant;
   const fraction=(a.x*dy-a.y*dx)/determinant;
   if(distance>=0&&fraction>=-EPSILON&&fraction<=1+EPSILON)scale=Math.min(scale,distance);
  }
 }else scale=Math.min(rx/(Math.abs(dx)||EPSILON),ry/(Math.abs(dy)||EPSILON));
 if(!Number.isFinite(scale))scale=0;
 return rotate({x:c.x+dx*scale,y:c.y+dy*scale},o.rotation||0,c);
}

/** A named side belongs to the object's local axes, and follows its rotation. */
export function shapeAnchorPoint(o:SceneObject,anchor:ConnectorAnchor):Point {
 const c=centerOf(o);
 const vector:Record<ConnectorAnchor,Point>={top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
 const direction=vector[anchor];
 const toward=rotate({x:c.x+direction.x*Math.max(o.width,1),y:c.y+direction.y*Math.max(o.height,1)},o.rotation||0,c);
 return boundary(o,toward);
}

export function connectorPoints(o:SceneObject,all:SceneObject[]):[Point,Point]{
 const a=all.find(v=>v.id===o.fromId),b=all.find(v=>v.id===o.toId);
 const start=a?centerOf(a):{x:o.fromX??o.x,y:o.fromY??o.y};
 const end=b?centerOf(b):{x:o.toX??(o.x+o.width),y:o.toY??(o.y+o.height)};
 return [a?(isAnchor(o.fromAnchor)?shapeAnchorPoint(a,o.fromAnchor):boundary(a,end)):start,
         b?(isAnchor(o.toAnchor)?shapeAnchorPoint(b,o.toAnchor):boundary(b,start)):end];
}

/** Kept for callers that deliberately need a simple, obstacle-free connector. */
export function connectorPath(a:Point,b:Point,routing?:string){if(routing==='elbow'){const x=(a.x+b.x)/2;return `M ${a.x} ${a.y} H ${x} V ${b.y} H ${b.x}`;}return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;}

interface Obstacle extends Bounds { id:string }
/** How far a shape's own rendered corner curve cuts inward - connectors need
 * at least this much standoff, or a route bending right at the bounding box
 * edge visually hugs/crosses the rounded corner instead of clearing it. */
function cornerClearance(o:SceneObject):number {
 if(!['rectangle','rounded','section'].includes(o.type))return 0;
 const base=o.type==='rounded'?16:o.type==='section'?14:0;
 return Math.min(o.radius??base,o.width/2,o.height/2);
}
function inflated(o:SceneObject,padding:number):Obstacle {
 const b=box(o),clearance=Math.max(padding,cornerClearance(o));
 return {id:o.id,x:b.x-clearance,y:b.y-clearance,width:b.width+clearance*2,height:b.height+clearance*2};
}
function inside(p:Point,b:Bounds):boolean {
 return p.x>b.x+EPSILON&&p.x<b.x+b.width-EPSILON&&p.y>b.y+EPSILON&&p.y<b.y+b.height-EPSILON;
}
function clearSegment(a:Point,b:Point,obstacles:Obstacle[]):boolean {
 if(Math.abs(a.y-b.y)<EPSILON){
  const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);
  return !obstacles.some(o=>a.y>o.y+EPSILON&&a.y<o.y+o.height-EPSILON&&right>o.x+EPSILON&&left<o.x+o.width-EPSILON);
 }
 if(Math.abs(a.x-b.x)<EPSILON){
  const top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
  return !obstacles.some(o=>a.x>o.x+EPSILON&&a.x<o.x+o.width-EPSILON&&bottom>o.y+EPSILON&&top<o.y+o.height-EPSILON);
 }
 return false;
}
function cleanRoute(points:Point[]):Point[]{
 const result:Point[]=[];
 for(const p of points){
  if(result.length&&samePoint(result[result.length-1],p))continue;
  while(result.length>1){
   const a=result[result.length-2],b=result[result.length-1];
   const horizontal=Math.abs(a.y-b.y)<EPSILON&&Math.abs(b.y-p.y)<EPSILON;
   const vertical=Math.abs(a.x-b.x)<EPSILON&&Math.abs(b.x-p.x)<EPSILON;
   // Preserve U-turns: dropping their middle point would cross the attached shape.
   if((horizontal&&(b.x-a.x)*(p.x-b.x)>=0)||(vertical&&(b.y-a.y)*(p.y-b.y)>=0))result.pop();else break;
  }
  result.push(p);
 }
 return result;
}
function routeLength(points:Point[]):number {
 return points.reduce((sum,p,i)=>i?sum+Math.abs(p.x-points[i-1].x)+Math.abs(p.y-points[i-1].y):sum,0);
}
function axisDirection(o:SceneObject,p:Point,anchor:unknown):Point {
 let d:Point;
 if(isAnchor(anchor)){
  const vectors:Record<ConnectorAnchor,Point>={top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
  d=rotate(vectors[anchor],o.rotation||0,{x:0,y:0});
 }else{
  const c=centerOf(o),local=rotate(p,-(o.rotation||0),c);
  const nx=(local.x-c.x)/Math.max(o.width/2,1),ny=(local.y-c.y)/Math.max(o.height/2,1);
  d=rotate(Math.abs(nx)>=Math.abs(ny)?{x:Math.sign(nx)||1,y:0}:{x:0,y:Math.sign(ny)||1},o.rotation||0,{x:0,y:0});
 }
 // World-orthogonal routing uses the dominant rotated outward normal.
 return Math.abs(d.x)>=Math.abs(d.y)?{x:Math.sign(d.x)||1,y:0}:{x:0,y:Math.sign(d.y)||1};
}
function exitPoint(o:SceneObject|undefined,p:Point,anchor:unknown,padding:number):Point {
 if(!o)return p;
 const b=inflated(o,padding),d=axisDirection(o,p,anchor);
 if(d.x>0)return {x:Math.max(p.x+padding,b.x+b.width),y:p.y};
 if(d.x<0)return {x:Math.min(p.x-padding,b.x),y:p.y};
 if(d.y>0)return {x:p.x,y:Math.max(p.y+padding,b.y+b.height)};
 return {x:p.x,y:Math.min(p.y-padding,b.y)};
}

/** Min-heap for deterministic Dijkstra search on a bounded rectilinear visibility grid. */
class RouteHeap {
 private entries:{key:number;cost:number}[]=[];
 private before(a:{key:number;cost:number},b:{key:number;cost:number}){return a.cost<b.cost||(a.cost===b.cost&&a.key<b.key);}
 push(entry:{key:number;cost:number}){let i=this.entries.length;this.entries.push(entry);while(i>0){const parent=(i-1)>>1;if(!this.before(entry,this.entries[parent]))break;this.entries[i]=this.entries[parent];i=parent;}this.entries[i]=entry;}
 pop(){const first=this.entries[0],last=this.entries.pop();if(!first||!last)return first;if(this.entries.length){let i=0;while(i*2+1<this.entries.length){let child=i*2+1;if(child+1<this.entries.length&&this.before(this.entries[child+1],this.entries[child]))child++;if(!this.before(this.entries[child],last))break;this.entries[i]=this.entries[child];i=child;}this.entries[i]=last;}return first;}
 get length(){return this.entries.length;}
}
function gridRoute(start:Point,end:Point,obstacles:Obstacle[],relevant:Obstacle[]):Point[]|null {
 const xs=[...new Set([start.x,end.x,...relevant.flatMap(o=>[o.x,o.x+o.width])])].sort((a,b)=>a-b);
 const ys=[...new Set([start.y,end.y,...relevant.flatMap(o=>[o.y,o.y+o.height])])].sort((a,b)=>a-b);
 const width=xs.length,count=width*ys.length;
 const startNode=ys.indexOf(start.y)*width+xs.indexOf(start.x),endNode=ys.indexOf(end.y)*width+xs.indexOf(end.x);
 const costs=new Float64Array(count*3).fill(Infinity),parents=new Int32Array(count*3).fill(-1);
 const heap=new RouteHeap();
 const origin=startNode*3;costs[origin]=0;heap.push({key:origin,cost:0});
 const edgeCache=new Map<string,boolean>();
 let found=-1;
 while(heap.length){
  const item=heap.pop()!;if(item.cost>costs[item.key]+EPSILON)continue;
  const node=Math.floor(item.key/3),direction=item.key%3,x=node%width,y=Math.floor(node/width);
  if(node===endNode){found=item.key;break;}
  const p={x:xs[x],y:ys[y]};
  const neighbors:[number,number][]=[];
  if(x>0)neighbors.push([node-1,1]);if(x+1<width)neighbors.push([node+1,1]);
  if(y>0)neighbors.push([node-width,2]);if(y+1<ys.length)neighbors.push([node+width,2]);
  for(const [next,nextDirection]of neighbors){
   const q={x:xs[next%width],y:ys[Math.floor(next/width)]};
   const cacheKey=node<next?`${node}:${next}`:`${next}:${node}`;
   let clear=edgeCache.get(cacheKey);
   if(clear===undefined){clear=clearSegment(p,q,obstacles);edgeCache.set(cacheKey,clear);}
   if(!clear)continue;
   const key=next*3+nextDirection;
   // Length is primary; a tiny turn cost breaks equal-distance routes consistently.
   const cost=item.cost+Math.abs(p.x-q.x)+Math.abs(p.y-q.y)+(direction&&direction!==nextDirection?.001:0);
   if(cost<costs[key]-EPSILON){costs[key]=cost;parents[key]=item.key;heap.push({key,cost});}
  }
 }
 if(found<0)return null;
 const result:Point[]=[];
 for(let key=found;key>=0;key=parents[key]){const node=Math.floor(key/3);result.push({x:xs[node%width],y:ys[Math.floor(node/width)]});}
 return cleanRoute(result.reverse());
}

/**
 * Route around inflated shape bounds. Sections and freehand/text annotations are
 * containers/content rather than blockers. Anchored endpoints retain a short
 * outward lead. The visibility grid is bounded to nearby obstacles; all accepted
 * segments are still checked against every page obstacle, including distant ones.
 */
function calculateConnectorRoute(o:SceneObject,all:SceneObject[]):Point[]{
 const [start,end]=connectorPoints(o,all);
 if(o.routing!=='elbow')return [start,end];
 // A manually-bent connector (dragged like FigJam's editable elbow line)
 // keeps exactly the points the user placed - skip the auto-router/obstacle
 // avoidance entirely so their routing is never second-guessed.
 if(o.bends&&o.bends.length)return cleanRoute([start,...o.bends,end]);
 const padding=Math.max(16,(o.strokeWidth||2)*2+8);
 const source=all.find(v=>v.id===o.fromId),target=all.find(v=>v.id===o.toId);
 const exit=exitPoint(source,start,o.fromAnchor,padding),entry=exitPoint(target,end,o.toAnchor,padding);
 const obstacles=all.filter(v=>v.pageId===o.pageId&&!['connector','section','pen','text','stamp'].includes(v.type))
  .map(v=>inflated(v,padding)).sort((a,b)=>a.x-b.x||a.y-b.y||a.id.localeCompare(b.id));
 // Overlapping objects can put a free endpoint/lead inside another object. Such
 // an obstacle cannot be avoided on exit; route around the remaining shapes.
 const blockers=obstacles.filter(b=>!inside(exit,b)&&!inside(entry,b));
 const valid=(points:Point[])=>points.every((p,i)=>!i||clearSegment(points[i-1],p,blockers));
 const candidates:Point[][]=[
  [exit,{x:entry.x,y:exit.y},entry],
  [exit,{x:exit.x,y:entry.y},entry],
 ];
 const direct=candidates.map(cleanRoute).find(p=>valid(p));
 // A valid L route already achieves the Manhattan lower bound.
 if(direct)return cleanRoute([start,...direct,end]);
 const routeArea={x:Math.min(exit.x,entry.x),y:Math.min(exit.y,entry.y),width:Math.abs(entry.x-exit.x),height:Math.abs(entry.y-exit.y)};
 const proximity=(b:Bounds)=>Math.max(routeArea.x-(b.x+b.width),b.x-(routeArea.x+routeArea.width),0)+Math.max(routeArea.y-(b.y+b.height),b.y-(routeArea.y+routeArea.height),0);
 const nearby=[...blockers].sort((a,b)=>proximity(a)-proximity(b)||a.x-b.x||a.y-b.y||a.id.localeCompare(b.id)).slice(0,40);
 const xs=[...new Set([(exit.x+entry.x)/2,...nearby.flatMap(b=>[b.x,b.x+b.width])])];
 const ys=[...new Set([(exit.y+entry.y)/2,...nearby.flatMap(b=>[b.y,b.y+b.height])])];
 // Outer corridors ensure an available fallback even on very dense pages.
 if(blockers.length){xs.push(Math.min(...blockers.map(b=>b.x))-padding,Math.max(...blockers.map(b=>b.x+b.width))+padding);ys.push(Math.min(...blockers.map(b=>b.y))-padding,Math.max(...blockers.map(b=>b.y+b.height))+padding);}
 xs.forEach(x=>candidates.push([exit,{x,y:exit.y},{x,y:entry.y},entry]));
 ys.forEach(y=>candidates.push([exit,{x:exit.x,y},{x:entry.x,y},entry]));
 const simple=candidates.map(cleanRoute).filter(valid).sort((a,b)=>routeLength(a)-routeLength(b)||a.length-b.length||JSON.stringify(a).localeCompare(JSON.stringify(b)))[0];
 // Solve the visibility grid whenever a detour is needed. This also finds routes
 // with four or more bends where every simple dogleg crosses an obstacle.
 const routed=gridRoute(exit,entry,blockers,nearby);
 const chosen=routed&&(!simple||routeLength(routed)<=routeLength(simple)+EPSILON)?routed:simple;
 if(chosen)return cleanRoute([start,...chosen,end]);
 // No orthogonal escape exists, e.g. a lead is enclosed by touching obstacles.
 // Preserve explicit attachments rather than inventing a detached endpoint.
 return cleanRoute([start,exit,{x:entry.x,y:exit.y},entry,end]);
}
interface CachedConnectorRoute { geometry:string;points:Point[];path?:string }
// Only callers retaining the immutable scene array keep its cache alive. Each
// live scene also has a bounded LRU, so temporary endpoint previews cannot grow
// indefinitely. Replacing an object must also replace the containing scene array.
const sceneRouteCaches=new WeakMap<SceneObject[],Map<string,CachedConnectorRoute>>();
const MAX_ROUTES_PER_SCENE=512;
function cachedConnectorRoute(o:SceneObject,all:SceneObject[]):CachedConnectorRoute {
 let scene=sceneRouteCaches.get(all);
 if(!scene){scene=new Map();sceneRouteCaches.set(all,scene);}
 const geometry=JSON.stringify([o.pageId,o.x,o.y,o.width,o.height,o.fromId,o.toId,o.fromX,o.fromY,o.toX,o.toY,o.fromAnchor,o.toAnchor,o.routing,o.strokeWidth,o.bends]);
 const previous=scene.get(o.id);
 if(previous?.geometry===geometry){scene.delete(o.id);scene.set(o.id,previous);return previous;}
 const cached:CachedConnectorRoute={geometry,points:calculateConnectorRoute(o,all)};
 scene.delete(o.id);scene.set(o.id,cached);
 if(scene.size>MAX_ROUTES_PER_SCENE)scene.delete(scene.keys().next().value!);
 return cached;
}
/** Reuses routing during local camera updates; callers must not mutate points. */
export function connectorRoutePoints(o:SceneObject,all:SceneObject[]):Point[]{return cachedConnectorRoute(o,all).points;}

/** Round orthogonal turns without consuming more than half an adjacent segment. */
function roundedRoutePath(points:Point[]):string {
 if(!points.length)return '';
 const commands=[`M ${points[0].x} ${points[0].y}`];
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],corner=points[i],b=points[i+1];
  const before=Math.hypot(corner.x-a.x,corner.y-a.y),after=Math.hypot(b.x-corner.x,b.y-corner.y);
  const cross=(corner.x-a.x)*(b.y-corner.y)-(corner.y-a.y)*(b.x-corner.x);
  if(before<EPSILON||after<EPSILON||Math.abs(cross)<EPSILON){commands.push(`L ${corner.x} ${corner.y}`);continue;}
  const radius=Math.min(12,before/2,after/2);
  const enter={x:corner.x-(corner.x-a.x)/before*radius,y:corner.y-(corner.y-a.y)/before*radius};
  const leave={x:corner.x+(b.x-corner.x)/after*radius,y:corner.y+(b.y-corner.y)/after*radius};
  commands.push(`L ${enter.x} ${enter.y}`,`Q ${corner.x} ${corner.y} ${leave.x} ${leave.y}`);
 }
 if(points.length>1){const last=points[points.length-1];commands.push(`L ${last.x} ${last.y}`);}
 return commands.join(' ');
}
/** A single adjustable bulge, like Figma/FigJam's "curved" connector style. */
export function curvedConnectorPath(a:Point,b:Point,offset:number):string {
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
 const nx=-dy/len,ny=dx/len;
 const c1={x:a.x+dx*0.25+nx*offset,y:a.y+dy*0.25+ny*offset};
 const c2={x:a.x+dx*0.75+nx*offset,y:a.y+dy*0.75+ny*offset};
 return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}
/** The apex of the bulge, i.e. where a curve's drag handle sits. */
export function curveBendPoint(a:Point,b:Point,offset:number):Point {
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
 return {x:(a.x+b.x)/2-dy/len*offset,y:(a.y+b.y)/2+dx/len*offset};
}
/** Inverse of curveBendPoint: recover the offset a dragged point implies. */
export function curveOffsetFromPoint(a:Point,b:Point,p:Point):number {
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
 const nx=-dy/len,ny=dx/len;
 return (p.x-(a.x+b.x)/2)*nx+(p.y-(a.y+b.y)/2)*ny;
}
/**
 * Move one straight run of a manually-bent elbow connector perpendicular to
 * itself - the neighbouring segments simply get longer or shorter to absorb
 * the change, exactly like dragging a segment of a FigJam connector. A
 * segment touching one of the connector's own endpoints gets a short
 * perpendicular lead inserted first, since that endpoint is anchored to a
 * shape and can never move itself.
 */
export function dragConnectorSegment(route:Point[],bends:Point[],segmentIndex:number,axis:'x'|'y',value:number):Point[] {
 const n=route.length;
 const touchesStart=segmentIndex===0,touchesEnd=segmentIndex===n-2;
 const make=(primary:number,secondary:number):Point=>axis==='x'?{x:primary,y:secondary}:{x:secondary,y:primary};
 const secondaryOf=(p:Point)=>axis==='x'?p.y:p.x;
 if(touchesStart&&touchesEnd){
  const a=route[0],b=route[1];
  return [make(value,secondaryOf(a)),make(value,secondaryOf(b))];
 }
 if(touchesStart){
  const a=route[0],target=route[1];
  return [make(value,secondaryOf(a)),make(value,secondaryOf(target)),...bends];
 }
 if(touchesEnd){
  const a=route[n-1],target=route[n-2];
  return [...bends,make(value,secondaryOf(target)),make(value,secondaryOf(a))];
 }
 const out=[...bends];
 out[segmentIndex-1]={...out[segmentIndex-1],[axis]:value};
 out[segmentIndex]={...out[segmentIndex],[axis]:value};
 return out;
}
export function routedConnectorPath(o:SceneObject,all:SceneObject[]):string {
 if(o.routing==='curve'){
  const [a,b]=connectorPoints(o,all);
  return curvedConnectorPath(a,b,Number(o.curveOffset)||0);
 }
 const cached=cachedConnectorRoute(o,all);
 cached.path??=roundedRoutePath(cached.points);
 return cached.path;
}
export function linePath(points:Point[]){if(points.length<2)return '';let d=`M ${points[0].x} ${points[0].y}`;for(let i=1;i<points.length-1;i++){const p=points[i],next=points[i+1];d+=` Q ${p.x} ${p.y} ${(p.x+next.x)/2} ${(p.y+next.y)/2}`;}const last=points[points.length-1];return d+` L ${last.x} ${last.y}`;}
/** Inspect the first logical record, ignoring quoted separators and newlines. */
function csvDelimiter(text:string):','|'\t'{
 let quoted=false,commas=0,tabs=0;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}
  else if(!quoted){if(c==='\n'||c==='\r')break;if(c===',')commas++;if(c==='\t')tabs++;}
 }
 // Comma wins an ambiguous record: tabs are legitimate content in a CSV cell.
 return commas>0||tabs===0?',':'\t';
}
export function parseCSV(text:string):string[][]{
 const delimiter=csvDelimiter(text),rows:string[][]=[];
 let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===delimiter){row.push(cell);cell='';}
  else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw new Error('CSV contains an unclosed quote.');
 if(cell||row.length){row.push(cell);rows.push(row);}
 if(rows.length>100||rows.some(r=>r.length>30))throw new Error('Tables support up to 100 rows and 30 columns.');
 const n=Math.max(1,...rows.map(r=>r.length));
 return rows.map(r=>Array.from({length:n},(_,i)=>r[i]||''));
}
export function encodeCSV(cells:string[][]){return cells.map(r=>r.map(v=>/[",\t\n\r]/.test(v)?`"${v.replaceAll('"','""')}"`:v).join(',')).join('\r\n');}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
