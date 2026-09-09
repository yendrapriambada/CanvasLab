import {useState,useEffect,useRef,useCallback} from 'react';
import * as Y from 'yjs';
import {IndexeddbPersistence} from 'y-indexeddb';
import {api} from './api';
import {objectsFromDoc,pagesFromDoc,createObject,patchObject,removeObjects,changeText,bytesToBase64,base64ToBytes} from './model';
import type {SceneObject,Page,Board,User,Role,Presence} from './types';
export function useBoard(boardId:string,user:User){
 const [doc]=useState(()=>new Y.Doc());const origin=useRef({source:'local'}).current;
 const [objects,setObjects]=useState<SceneObject[]>([]),[pages,setPages]=useState<Page[]>([]),[status,setStatus]=useState('Connecting…');
 const [role,setRole]=useState<Role>('viewer'),[board,setBoard]=useState<Board|null>(null),[presence,setPresence]=useState<Presence[]>([]);
 const wsRef=useRef<WebSocket|null>(null),undoRef=useRef<Y.UndoManager|null>(null),pending=useRef(new Set<string>()),ready=useRef(false),persistenceRef=useRef<IndexeddbPersistence|null>(null);
 const refreshMetadata=useCallback(async()=>{const result=await api('board.get',{board_id:boardId});setBoard(result.board);setRole(result.role||result.board.role);return result},[boardId]);
 useEffect(()=>{
 let disposed=false,retry:ReturnType<typeof setTimeout>,attempt=0,denied=false;let batchTimer:ReturnType<typeof setTimeout>;let batch:Uint8Array[]=[];
 const persistence=new IndexeddbPersistence(`canvaslab:${user.id}:${boardId}`,doc);persistenceRef.current=persistence;
 const um=new Y.UndoManager([doc.getMap('objects'),doc.getMap('pages')],{trackedOrigins:new Set([origin]),captureTimeout:400});undoRef.current=um;
 const reflect=()=>{setObjects(objectsFromDoc(doc));setPages(pagesFromDoc(doc))};doc.on('afterTransaction',reflect);
 const transmit=(update:Uint8Array)=>{if(!ready.current||wsRef.current?.readyState!==WebSocket.OPEN){setStatus('Offline · changes saved on this device');return}const id=crypto.randomUUID();pending.current.add(id);setStatus('Saving…');wsRef.current.send(JSON.stringify({type:'update',id,update:bytesToBase64(update)}))};
 const onUpdate=(u:Uint8Array,source:unknown)=>{if(source===origin||source===um){batch.push(u);setStatus(ready.current?'Saving…':'Offline · changes saved on this device');clearTimeout(batchTimer);batchTimer=setTimeout(()=>{if(batch.length){transmit(Y.mergeUpdates(batch));batch=[]}},100)}};doc.on('update',onUpdate);
 const connect=()=>{if(disposed||denied)return;if(!navigator.onLine){setStatus('Offline · changes saved on this device');return}ready.current=false;setStatus(attempt?'Reconnecting…':'Connecting…');const url=new URL('/sync',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('board',boardId);const ws=new WebSocket(url);wsRef.current=ws;
 ws.onmessage=e=>{if(disposed)return;const m=JSON.parse(e.data);if(m.type==='init'){attempt=0;setRole(m.role);setBoard(m.board);setPresence((m.peers||[]).map((p:Presence)=>({...p,updatedAt:Date.now()})));Y.applyUpdate(doc,base64ToBytes(m.update),'server');pending.current.clear();ready.current=true;if(m.role==='owner'||m.role==='editor'){const delta=Y.encodeStateAsUpdate(doc,base64ToBytes(m.vector));if(delta.length>2)transmit(delta);else setStatus('Saved')}else setStatus('Saved')}
 if(m.type==='update')Y.applyUpdate(doc,base64ToBytes(m.update),'server');
 if(m.type==='ack'){if(m.update)Y.applyUpdate(doc,base64ToBytes(m.update),'server');pending.current.delete(m.id);if(!pending.current.size&&!batch.length)setStatus('Saved')}
 if(m.type==='metadata'){setBoard(m.board);setRole(m.role);window.dispatchEvent(new Event('canvaslab:metadata'))}
 if(m.type==='presence'){setPresence(peers=>[...peers.filter(p=>p.id!==m.id),{...peers.find(p=>p.id===m.id),...m,updatedAt:Date.now()}])}
 if(m.type==='leave')setPresence(peers=>peers.filter(p=>p.id!==m.id));
 if(m.type==='private-voting')setPresence(peers=>peers.map(p=>({...p,x:undefined,y:undefined,selected:[],viewport:undefined,spotlight:false})));
 if(m.type==='error'){setStatus(m.message||'Failed to save');if(m.status>=500){ws.close(4000,'Retry persistence')}if([401,403,404].includes(m.status)){denied=true;setRole('viewer');void persistence.clearData()}}
 };
 ws.onclose=e=>{ready.current=false;if(disposed)return;if(e.code===4401||e.code===4403){denied=true;setRole('viewer');setStatus('Access unavailable · editing disabled');void persistence.clearData();return}setStatus('Offline · changes saved on this device');retry=setTimeout(connect,Math.min(1000*2**attempt++,10000))};ws.onerror=()=>setStatus('Reconnecting…');
 };
 const presenceExpiry=setInterval(()=>setPresence(peers=>peers.filter(p=>Date.now()-(p.updatedAt||0)<15000)),5000);
 void persistence.whenSynced.then(()=>{reflect();connect()});
 void api('board.recent',{board_id:boardId}).catch(()=>{});
 const online=()=>{if(!ready.current&&!denied){clearTimeout(retry);connect()}};window.addEventListener('online',online);const offline=()=>{ready.current=false;setStatus('Offline · changes saved on this device');wsRef.current?.close(4000,'Offline')};window.addEventListener('offline',offline);
 return()=>{disposed=true;clearInterval(presenceExpiry);clearTimeout(retry);clearTimeout(batchTimer);window.removeEventListener('online',online);window.removeEventListener('offline',offline);doc.off('afterTransaction',reflect);doc.off('update',onUpdate);wsRef.current?.close();um.destroy();void persistence.destroy()};
 },[boardId,doc,origin,user.id]);
 const mutate=useCallback((fn:()=>void)=>{if(role==='editor'||role==='owner')doc.transact(fn,origin)},[doc,origin,role]);
 const addObject=useCallback((values:Partial<SceneObject>)=>{let id='';mutate(()=>{id=createObject(doc,{...values,author:user.name})});return id},[doc,mutate,user.name]);
 const updateObject=useCallback((id:string,patch:Partial<SceneObject>)=>mutate(()=>patchObject(doc,id,patch)),[doc,mutate]);
 const deleteObjects=useCallback((ids:string[])=>mutate(()=>removeObjects(doc,ids.filter(id=>!doc.getMap<Y.Map<any>>('objects').get(id)?.get('locked')))),[doc,mutate]);
 const setText=useCallback((id:string,text:string)=>mutate(()=>changeText(doc,id,text)),[doc,mutate]);
 const sendPresence=useCallback((value:Partial<Presence>)=>{if(wsRef.current?.readyState===WebSocket.OPEN)wsRef.current.send(JSON.stringify({type:'presence',value}))},[]);
 const undo=()=>{if(role==='editor'||role==='owner')undoRef.current?.undo()},redo=()=>{if(role==='editor'||role==='owner')undoRef.current?.redo()};
 return {doc,objects,pages,status,role,board,presence,mutate,addObject,updateObject,deleteObjects,setText,undo,redo,sendPresence,refreshMetadata,localOrigin:origin,stopCapturing:()=>undoRef.current?.stopCapturing()};
}
