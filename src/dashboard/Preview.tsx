import { useEffect, useState } from 'react';
import { File, LoaderCircle } from 'lucide-react';
import * as Y from 'yjs';
import { api } from '../lib/api';
import { base64ToBytes, objectsFromDoc, pagesFromDoc } from '../lib/model';
import type { Board, SceneObject } from '../lib/types';

const palette = ['#ffdc87', '#e3d3fa', '#d0e8d8', '#f6cbd4', '#cbe1f4'];
export const templates = [
  { id: 'brainstorming', name: 'Brainstorming', tag: 'Let the ideas flow', color: '#fbf6e7' },
  { id: 'retrospective', name: 'Retrospective', tag: 'Reflect. Learn. Grow.', color: '#f3edf9' },
  { id: 'kanban', name: 'Kanban', tag: 'From to-do to done', color: '#eaf2ef' },
  { id: 'flowchart', name: 'Flowchart', tag: 'Connect the dots', color: '#eef1fb' },
  { id: 'mindmap', name: 'Mind map', tag: 'Follow your thinking', color: '#fcf0ec' },
  { id: 'journey', name: 'Customer journey', tag: 'See their perspective', color: '#f9f1e9' },
  { id: 'team', name: 'Team canvas', tag: 'Get on the same page', color: '#eef3f1' },
];
export function TemplatePreview({ type }: { type: string }) {
  return <svg viewBox="0 0 240 128" aria-hidden="true" className="d-template-drawing">
    {type === 'brainstorming' ? <><text x="76" y="22" fill="#837249" fontSize="8" fontWeight="600">A big, bright idea</text><path d="M115 34L61 58M124 34L169 58M119 34L115 88" stroke="#bba977" fill="none" />{[[40, 49, -7], [142, 49, 6], [94, 76, -3]].map(([x,y,r],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${r} 22 19)`}><rect width="45" height="39" rx="1" fill={palette[i]} /><path d="M10 13H31M10 20H26" stroke="#87744a" strokeWidth="1.3" opacity=".4" /></g>)}</> :
    type === 'retrospective' || type === 'kanban' ? <>{['What worked', 'What to improve', 'What’s next'].map((label,i)=><g key={label} transform={`translate(${17+i*72} 16)`}><rect width="64" height="97" rx="3" fill="#fff" opacity=".55"/><rect x="5" y="5" width="54" height="13" rx="2" fill={palette[i]}/><text x="32" y="14" textAnchor="middle" fill="#666" fontSize="5">{type==='kanban'?['To do','In progress','Done'][i]:label}</text>{[0,1,2].slice(0,i===1?2:3).map(j=><g key={j}><rect x="10" y={25+j*23} width="45" height="18" rx="1" fill={palette[i]}/><path d={`M17 ${31+j*23}h24M17 ${36+j*23}h17`} stroke="#655958" opacity=".2" /></g>)}</g>)}</> :
    type === 'flowchart' ? <><path d="M42 64H91M139 64H188M116 42V20H188V44M116 86V109" stroke="#a79ccd" fill="none" strokeWidth="1.3"/><rect x="15" y="49" width="50" height="29" rx="14" fill="#d8d0f1" stroke="#b1a1da"/><path d="M91 64l25-23 25 23-25 23Z" fill="#fce4a7" stroke="#cfb979"/><rect x="172" y="48" width="50" height="31" rx="4" fill="#cfdfed" stroke="#9ebbd1"/><text x="40" y="66" textAnchor="middle" fontSize="7" fill="#716185">Start</text><text x="116" y="66" textAnchor="middle" fontSize="6" fill="#8e7548">Decision?</text><text x="197" y="67" textAnchor="middle" fontSize="7" fill="#667c8e">Next step</text></> :
    type === 'mindmap' ? <><path d="M104 62C76 62 78 33 49 33M104 62C73 62 74 96 48 96M132 62C159 62 164 33 191 33M132 62C164 62 164 94 194 94" stroke="#c19b8b" fill="none" strokeWidth="1.5"/>{[[19,21,'#f8d5c5'],[18,85,'#dfd0ec'],[170,21,'#fae1a6'],[173,82,'#cee3d1'],[88,49,'#ead9d0']].map(([x,y,c],i)=><g key={i}><rect x={x} y={y} width="53" height="26" rx="6" fill={String(c)}/><text x={Number(x)+26} y={Number(y)+16} textAnchor="middle" fontSize="6" fill="#8b7067">{i===4?'Big idea':'Explore'}</text></g>)}</> :
    type === 'journey' ? <>{[0,1,2,3,4].map(i=><g key={i} transform={`translate(${10+i*45} 12)`}><rect width="42" height="103" rx="2" fill="#fff" opacity=".65"/><rect y="5" x="4" width="34" height="12" rx="2" fill={palette[i]}/>{[0,1].map(j=><rect key={j} x="8" y={25+j*24} width="27" height="19" fill={palette[(i+j)%5]} />)}</g>)}<path d="M20 98Q50 85 75 93T123 89T170 89T220 77" stroke="#be997d" strokeWidth="1.5" fill="none"/></> : <>{[[12,12,64,45],[84,12,64,45],[156,12,70,45],[12,65,100,51],[120,65,106,51]].map(([x,y,w,h],i)=><g key={i}><rect x={x} y={y} width={w} height={h} rx="2" fill="#fff" opacity=".8"/><text x={x+6} y={y+10} fontSize="5" fill="#7a8e84">{['Purpose','People','Outcomes','Ways of working','Deliverables'][i]}</text>{[0,1].map(j=><rect key={j} x={x+8+j*26} y={y+17} width="21" height="21" fill={palette[(i+j)%5]}/>)}</g>)}</>}
  </svg>;
}

export function BoardPreview({ board, userId }: { board: Board; userId: string }) {
  const [objects, setObjects] = useState<SceneObject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false; setLoading(true); setFailed(false);
    api<{ updates: string[] }>('scene.load', { board_id: board.id }).then(({ updates }) => {
      const doc = new Y.Doc();
      try { updates.forEach(update => Y.applyUpdate(doc, base64ToBytes(update))); const page = pagesFromDoc(doc)[0]; const data = objectsFromDoc(doc).filter(object => !page || object.pageId === page.id); if (!cancelled) setObjects(data); }
      finally { doc.destroy(); }
    }).catch(() => { if (!cancelled) { setObjects(null); setFailed(true); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [board.id, board.updated_at, userId]);
  if (loading && !objects) return <div className="d-preview-empty"><LoaderCircle size={17} className="d-spin" /><span>Loading preview</span></div>;
  if (!objects?.length) return <div className="d-preview-empty"><span className="d-preview-page"><File size={22} strokeWidth={1.15} /></span><span>{failed ? 'Preview unavailable' : 'A blank canvas. Endless possibilities.'}</span></div>;
  const visual = objects.filter(o => Number.isFinite(o.x) && Number.isFinite(o.y));
  const minX = Math.min(...visual.map(o=>o.x), 0), minY = Math.min(...visual.map(o=>o.y), 0);
  const maxX = Math.max(...visual.map(o=>o.x+(o.width||100)), 400), maxY = Math.max(...visual.map(o=>o.y+(o.height||100)), 250);
  const pad = Math.max(maxX-minX,maxY-minY)*.075;
  return <svg className="d-board-drawing" viewBox={`${minX-pad} ${minY-pad} ${maxX-minX+pad*2} ${maxY-minY+pad*2}`} role="img" aria-label={`Preview of ${board.name}`}><g>{visual.sort((a,b)=>(a.order||0)-(b.order||0)).slice(0,1000).map(o=> {
    if(o.type === 'connector') { const from=visual.find(x=>x.id===o.fromId),to=visual.find(x=>x.id===o.toId);return <path key={o.id} d={`M${from?from.x+from.width/2:o.x} ${from?from.y+from.height/2:o.y}L${to?to.x+to.width/2:o.x+o.width} ${to?to.y+to.height/2:o.y+o.height}`} stroke={o.stroke||'#999'} strokeWidth={o.strokeWidth||2} fill="none"/>; }
    if(o.type === 'pen') return <polyline key={o.id} points={(o.points||[]).map(p=>`${o.x+p.x},${o.y+p.y}`).join(' ')} fill="none" stroke={o.stroke||'#777'} strokeWidth={o.strokeWidth||2}/>;
    return <g key={o.id} opacity={o.opacity ?? 1} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation||0} ${o.width/2} ${o.height/2})`}>
      {o.type !== 'text' && (o.type==='ellipse'?<ellipse cx={o.width/2} cy={o.height/2} rx={o.width/2} ry={o.height/2} fill={o.fill} stroke={o.stroke}/>:o.type==='diamond'?<path d={`M${o.width/2} 0L${o.width} ${o.height/2}L${o.width/2} ${o.height}L0 ${o.height/2}Z`} fill={o.fill} stroke={o.stroke}/>:<rect width={o.width} height={o.height} rx={o.type==='rounded'?12:2} fill={o.fill||'#e9e5f0'} stroke={o.type==='sticky'?'none':o.stroke} strokeWidth={o.strokeWidth||1}/>)}
      {o.text && <text x={o.align==='center'?o.width/2:9} y={Math.max(15, o.fontSize||16)+6} fontSize={o.fontSize||16} fill="#4b4557" textAnchor={o.align==='center'?'middle':'start'} fontWeight={o.bold?700:400}>{o.text.split('\n').slice(0,Math.max(1,Math.floor(o.height/((o.fontSize||16)*1.3)))).map((line,i)=><tspan key={i} x={o.align==='center'?o.width/2:9} dy={i?(o.fontSize||16)*1.3:0}>{line.slice(0,Math.max(8,Math.floor(o.width/(o.fontSize||16)*1.7)))}</tspan>)}</text>}
    </g>;
  })}</g></svg>;
}
