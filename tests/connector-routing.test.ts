import { describe, it, expect } from 'vitest';
import type { SceneObject } from '../src/lib/model';
import { boundary, connectorPoints, connectorRoutePoints, rotate, routedConnectorPath, shapeAnchorPoint } from '../src/editor/geometry';
import type { Bounds, Point } from '../src/editor/geometry';
const object=(id:string,values:Partial<SceneObject>={}):SceneObject=>({id,pageId:'page',type:'rectangle',x:0,y:0,width:100,height:100,rotation:0,fill:'#eee',stroke:'#555',strokeWidth:2,text:'',fontSize:20,bold:false,italic:false,align:'center',locked:false,opacity:1,order:0,...values});
const edge=(values:Partial<SceneObject>={})=>object('edge',{type:'connector',fromId:'a',toId:'b',routing:'elbow',...values});
function expectOrthogonal(points:Point[]){for(let i=1;i<points.length;i++)expect(Math.abs(points[i].x-points[i-1].x)<1e-6||Math.abs(points[i].y-points[i-1].y)<1e-6).toBe(true);}
function crosses(points:Point[],box:Bounds){return points.some((b,i)=>{if(!i)return false;const a=points[i-1];return Math.abs(a.x-b.x)<1e-6?a.x>box.x&&a.x<box.x+box.width&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.height:Math.abs(a.y-b.y)<1e-6&&a.y>box.y&&a.y<box.y+box.height&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.width;});}
describe('bound connector routing',()=>{
 it('keeps explicit side anchors stable when the other object moves',()=>{
  const a=object('a',{x:20,y:30,width:200,height:100}),b=object('b',{x:500,y:200});
  const connector=edge({fromAnchor:'right',toAnchor:'left'});
  expect(connectorPoints(connector,[a,b])).toEqual([{x:220,y:80},{x:500,y:250}]);
  expect(connectorPoints(connector,[a,{...b,x:-300,y:700}])[0]).toEqual({x:220,y:80});
  expect(connectorPoints(connector,[{...a,width:320},b])[0]).toEqual({x:340,y:80});
 });
 it('rotates named anchors in object space',()=>{
  const a=object('a',{x:20,y:30,width:200,height:100,rotation:90});
  const p=shapeAnchorPoint(a,'right');
  expect(p.x).toBeCloseTo(120);expect(p.y).toBeCloseTo(180);
  expect(shapeAnchorPoint(a,'top').x).toBeCloseTo(170);
 });
 it('binds a triangle to its actual sloped edge, including rotation',()=>{
  const triangle=object('triangle',{type:'triangle',width:200,height:100});
  expect(boundary(triangle,{x:1000,y:50})).toEqual({x:150,y:50});
  expect(shapeAnchorPoint(triangle,'left')).toEqual({x:50,y:50});
  expect(shapeAnchorPoint(triangle,'top')).toEqual({x:100,y:0});
  const rotated={...triangle,rotation:40};const toward=rotate({x:1000,y:50},40,{x:100,y:50});
  const p=boundary(rotated,toward),expected=rotate({x:150,y:50},40,{x:100,y:50});
  expect(p.x).toBeCloseTo(expected.x);expect(p.y).toBeCloseTo(expected.y);
 });
 it('detours around a third-party shape with clearance',()=>{
  const a=object('a'),b=object('b',{x:600}),obstacle=object('obstacle',{x:240,y:-70,width:160,height:240});
  const connector=edge({fromAnchor:'right',toAnchor:'left'}),points=connectorRoutePoints(connector,[a,b,obstacle]);
  expectOrthogonal(points);expect(points[0]).toEqual({x:100,y:50});expect(points.at(-1)).toEqual({x:600,y:50});
  expect(crosses(points,{x:obstacle.x-15,y:obstacle.y-15,width:obstacle.width+30,height:obstacle.height+30})).toBe(false);
  expect(points.some(p=>p.y<obstacle.y||p.y>obstacle.y+obstacle.height)).toBe(true);
 });
 it('avoids both endpoint shapes when explicit anchors face away from each other',()=>{
  const a=object('a'),b=object('b',{x:400});
  const points=connectorRoutePoints(edge({fromAnchor:'left',toAnchor:'right'}),[a,b]);
  expectOrthogonal(points);expect(points[0]).toEqual({x:0,y:50});expect(points[1].x).toBeLessThan(0);
  expect(points.at(-1)).toEqual({x:500,y:50});expect(points.at(-2)!.x).toBeGreaterThan(500);
  expect(crosses(points,a)).toBe(false);expect(crosses(points,b)).toBe(false);
 });
 it('finds a multi-bend path between staggered barriers',()=>{
  const a=object('a'),b=object('b',{x:700});
  const barriers=[object('upper',{x:220,y:-180,width:90,height:280}),object('lower',{x:400,y:0,width:90,height:280})];
  const connector=edge({fromAnchor:'right',toAnchor:'left'}),points=connectorRoutePoints(connector,[a,b,...barriers]);
  expectOrthogonal(points);barriers.forEach(o=>expect(crosses(points,o)).toBe(false));
  expect(points.length).toBeGreaterThan(3);
 });
 it('routes deterministically regardless of scene object ordering',()=>{
  const a=object('a'),b=object('b',{x:600}),c=object('c',{x:220,y:-60,width:200,height:220});
  const connector=edge({fromAnchor:'right',toAnchor:'left'});
  expect(routedConnectorPath(connector,[a,b,c])).toBe(routedConnectorPath(connector,[c,b,a]));
 });
 it('ignores sections and objects on other pages as obstacles',()=>{
  const a=object('a'),b=object('b',{x:400});
  const other=object('other',{pageId:'another',x:150,width:200,height:400}),section=object('section',{type:'section',x:150,width:200,height:400});
  const points=connectorRoutePoints(edge(),[a,b,other,section]);
  expect(points).toEqual([{x:100,y:50},{x:400,y:50}]);
 });
 it('preserves free endpoints and leaves straight lines straight',()=>{
  const connector=edge({fromId:undefined,toId:undefined,fromX:-50,fromY:30,toX:360,toY:190,routing:'straight'});
  expect(connectorRoutePoints(connector,[])).toEqual([{x:-50,y:30},{x:360,y:190}]);
  expect(routedConnectorPath(connector,[])).toBe('M -50 30 L 360 190');
 });
 it('returns finite points for coincident centers and zero-sized shapes',()=>{
  const a=object('a',{width:0,height:0}),b=object('b',{width:0,height:0});
  const points=connectorRoutePoints(edge(),[a,b]);
  expect(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
 });
});

describe('connector routing cache and rounded corners',()=>{
 it('reuses points for an unchanged scene during viewport updates',()=>{
  const a=object('a'),b=object('b',{x:500,y:250}),connector=edge();
  const scene=[a,b,connector];
  const first=connectorRoutePoints(connector,scene);
  expect(connectorRoutePoints(connector,scene)).toBe(first);
  expect(connectorRoutePoints({...connector,stroke:'#ff0000'},scene)).toBe(first);
  expect(routedConnectorPath(connector,scene)).toBe(routedConnectorPath(connector,scene));
 });
 it('invalidates when a bound shape moves and the scene array is replaced',()=>{
  const a=object('a'),b=object('b',{x:500}),connector=edge({fromAnchor:'right',toAnchor:'left'});
  const original=[a,b,connector],first=connectorRoutePoints(connector,original);
  const updated=[a,{...b,x:700,y:100},connector],second=connectorRoutePoints(connector,updated);
  expect(second).not.toBe(first);expect(second.at(-1)).toEqual({x:700,y:150});
  expect(first.at(-1)).toEqual({x:500,y:50});
 });
 it('invalidates when an obstacle enters the route in a new scene',()=>{
  const a=object('a'),b=object('b',{x:500}),block=object('block',{x:220,y:300,width:130}),connector=edge();
  const first=connectorRoutePoints(connector,[a,b,block]);
  const moved={...block,y:0},second=connectorRoutePoints(connector,[a,b,moved]);
  expect(second).not.toEqual(first);expect(crosses(second,moved)).toBe(false);
 });
 it('invalidates geometry edits on a connector even if scene identity is unchanged',()=>{
  const connector=edge({fromId:undefined,toId:undefined,fromX:0,fromY:0,toX:100,toY:100});
  const scene=[connector],first=connectorRoutePoints(connector,scene);
  connector.toX=200;connector.toAnchor='top';
  const second=connectorRoutePoints(connector,scene);
  expect(second).not.toBe(first);expect(second.at(-1)).toEqual({x:200,y:100});
 });
 it('bounds the cache for a live scene with many temporary connectors',()=>{
  const scene:SceneObject[]=[],firstConnector=edge({fromId:undefined,toId:undefined}),first=connectorRoutePoints(firstConnector,scene);
  for(let i=0;i<600;i++)connectorRoutePoints({...firstConnector,id:`temporary-${i}`},scene);
  // An old entry gets evicted rather than retaining every preview indefinitely.
  expect(connectorRoutePoints(firstConnector,scene)).not.toBe(first);
 });
 it('rounds long turns with 12px quadratic bends and preserves attachments',()=>{
  const connector=edge({fromId:undefined,toId:undefined,fromX:0,fromY:0,toX:200,toY:100}),scene:SceneObject[]=[];
  expect(connectorRoutePoints(connector,scene)).toEqual([{x:0,y:0},{x:200,y:0},{x:200,y:100}]);
  expect(routedConnectorPath(connector,scene)).toBe('M 0 0 L 188 0 Q 200 0 200 12 L 200 100');
 });
 it('limits rounded corners to half of very short segments',()=>{
  const connector=edge({fromId:undefined,toId:undefined,fromX:0,fromY:0,toX:8,toY:6});
  expect(routedConnectorPath(connector,[])).toBe('M 0 0 L 5 0 Q 8 0 8 3 L 8 6');
 });
});
