import {describe,it,expect} from 'vitest';
import {resizeObject} from '../src/editor/transforms';
import {rotate} from '../src/editor/geometry';
import type {SceneObject} from '../src/lib/model';
const shape={id:'shape',type:'rounded',x:100,y:100,width:200,height:100,rotation:45} as SceneObject;
const corner=(o:SceneObject,east:boolean,south:boolean)=>rotate({x:o.x+(east?o.width:0),y:o.y+(south?o.height:0)},o.rotation,{x:o.x+o.width/2,y:o.y+o.height/2});
describe('world-space resize anchors',()=>{
  it('keeps the opposite rotated corner fixed and follows the pointer',()=>{
    const start=corner(shape,true,true),end={x:start.x+80,y:start.y+40};const next={...shape,...resizeObject(shape,start,end,'se')};
    expect(corner(next,false,false).x).toBeCloseTo(corner(shape,false,false).x,8);expect(corner(next,false,false).y).toBeCloseTo(corner(shape,false,false).y,8);
    expect(corner(next,true,true).x).toBeCloseTo(end.x,8);expect(corner(next,true,true).y).toBeCloseTo(end.y,8);
  });
  it('supports dragging a rotated left side without changing height',()=>{
    const start=corner(shape,false,false),end=rotate({x:shape.x-60,y:shape.y},shape.rotation,{x:200,y:150});const next={...shape,...resizeObject(shape,start,end,'w')};
    expect(next.width).toBeCloseTo(260);expect(next.height).toBe(100);expect(corner(next,true,false).x).toBeCloseTo(corner(shape,true,false).x,8);
  });
  it('preserves center for Option/Alt and aspect ratio for Shift',()=>{
    const start=corner(shape,true,true),end={x:start.x+90,y:start.y+90};const next=resizeObject(shape,start,end,'se',true,true);
    expect(next.x+next.width/2).toBe(200);expect(next.y+next.height/2).toBe(150);expect(next.width/next.height).toBe(2);
  });
});
