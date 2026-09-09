import {describe,it,expect} from 'vitest';
import {parseCSV,encodeCSV,boundary,connectorPoints,box} from '../src/editor/geometry';
import {createObject,makeTemplate,objectsFromDoc} from '../src/lib/model';
describe('geometry and portable tables',()=>{
 it('CSV preserves commas, quotes and multiline values',()=>{const cells=[['a,b','say "hi"','multi\nline'],['','trailing','x']];expect(parseCSV(encodeCSV(cells))).toEqual(cells)});
 it('rejects malformed or oversized CSV',()=>{expect(()=>parseCSV('"open')).toThrow();expect(()=>parseCSV(Array.from({length:101},()=>['x']).join('\n'))).toThrow()});
 it('connector boundaries follow move, resize and rotation',()=>{const d=makeTemplate(),a=createObject(d,{x:0,y:0,width:200,height:100}),b=createObject(d,{x:500,y:0,width:100,height:100}),c=createObject(d,{type:'connector',fromId:a,toId:b});let objects=objectsFromDoc(d);const edge=objects.find(o=>o.id===c)!;expect(connectorPoints(edge,objects)).toEqual([{x:200,y:50},{x:500,y:50}]);objects=objects.map(o=>o.id===a?{...o,rotation:90}:o);expect(connectorPoints(edge,objects)[0].x).toBeCloseTo(150);objects=objects.map(o=>o.id===b?{...o,x:700,width:200}:o);expect(connectorPoints(edge,objects)[1].x).toBeCloseTo(700)});
 it('ellipse and diamond intersection lie on shape boundary',()=>{const d=makeTemplate(),id=createObject(d,{type:'ellipse',x:0,y:0,width:200,height:100}),o=objectsFromDoc(d).find(o=>o.id===id)!;const p=boundary(o,{x:500,y:500});expect((p.x-100)**2/10000+(p.y-50)**2/2500).toBeCloseTo(1);const q=boundary({...o,type:'diamond'},{x:500,y:500});expect(Math.abs(q.x-100)/100+Math.abs(q.y-50)/50).toBeCloseTo(1)});
 it('rotated bounds include all corners',()=>{const d=makeTemplate();createObject(d,{width:200,height:100,rotation:90});const b=box(objectsFromDoc(d)[0]);expect(b.width).toBeCloseTo(100);expect(b.height).toBeCloseTo(200)});
});
