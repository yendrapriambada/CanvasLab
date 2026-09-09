import 'dotenv/config';
import express from 'express';
import {createServer} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import * as Y from 'yjs';
import {openRelay,invalidateRelay,distributedRealtime,type RelayMessage} from './realtime.js';
export const app=express();
export const server=createServer(app);
const endpoint=process.env.CANVASLAB_API_URL||'https://txsyyhcrtasrqodtvpvn.supabase.co/functions/v1/canvaslab-api';
app.disable('x-powered-by');app.set('trust proxy',process.env.TRUST_PROXY==='true'||process.env.VERCEL==='1'?1:false);
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');next()});
app.use(express.json({limit:'12mb'}));
const cookieToken=(cookie='')=>cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('canvaslab_session='))?.slice(18)||'';
let activeRequests=0;const requestQueue:Array<()=>void>=[];
async function upstream(action:string,data:Record<string,unknown>,token=''){
 if(activeRequests>=4)await new Promise<void>(resolve=>requestQueue.push(resolve));activeRequests++;
 try{
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-board-session':token},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(40000)});
  const body=await res.json().catch(()=>({error:'Database service unavailable'}));
  if(!res.ok)throw Object.assign(new Error(body.error||'Request failed'),{status:res.status,code:body.code});return body;
 }finally{activeRequests--;requestQueue.shift()?.()}
}
function validOrigin(origin:string|undefined,host:string|undefined){if(!origin)return true;try{return new URL(origin).host===host}catch{return false}}
const limits=new Map<string,{count:number,at:number}>();
app.post(['/api','/api/server'],async(req,res)=>{
 if(!validOrigin(req.headers.origin,req.headers.host))return res.status(403).json({error:'Origin is not allowed'});
 const {action,...data}=req.body||{};if(typeof action!=='string')return res.status(400).json({error:'Action is required'});
 const key=`${req.ip}:${action.startsWith('auth.')?'auth':'api'}`,now=Date.now();let rate=limits.get(key);if(!rate||now-rate.at>60000){rate={count:0,at:now};limits.set(key,rate)}if(++rate.count>(action.startsWith('auth.')?80:600))return res.status(429).json({error:'Too many requests. Please wait a minute.'});
 try{const body=await upstream(action,data,cookieToken(req.headers.cookie));if(body.token&&['auth.login','auth.register','auth.google'].includes(action)){res.cookie('canvaslab_session',body.token,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true'||process.env.VERCEL==='1',maxAge:30*86400000,path:'/'});delete body.token}if(action==='auth.logout')res.clearCookie('canvaslab_session',{path:'/'});if(action==='scene.push'&&body.update&&!rooms.has(String(data.board_id)))await invalidateRelay(String(data.board_id));if(action==='scene.push'&&body.update&&rooms.has(String(data.board_id))){const r=rooms.get(String(data.board_id))!;Y.applyUpdate(r.doc,Buffer.from(body.update,'base64'));await refreshRoomAccess(String(data.board_id));broadcast(r,{type:'update',update:body.update})}if(/^(board\.(trash|restore|update|share_set|link_revoke)|project\.(trash|restore|member_set|update)|workspace\.member_set|workshop\.)/.test(action))await refreshRoomAccess();res.json(body)}catch(error){const e=error as Error&{status?:number;code?:string};res.status(e.status||502).json({error:e.status?e.message:'The database service is temporarily unavailable. Please try again.',code:e.code})}
});
app.get(['/health','/api/server'],(_req,res)=>res.status(process.env.VERCEL==='1'&&!distributedRealtime?503:200).json({ok:process.env.VERCEL!=='1'||distributedRealtime,service:'CanvasLab',persistence:'Supabase / Khalifah Board',realtime:distributedRealtime?'distributed':'single-instance'}));
type Peer={ws:WebSocket;token:string;user:any;boardId:string;role:string;lastPresence:number;updates:number;window:number};
type Room={doc:Y.Doc;peers:Set<Peer>;chain:Promise<void>;loading?:Promise<void>;voteCheck:number;privateVoting:boolean;relay?:ReturnType<typeof openRelay>};
const rooms=new Map<string,Room>();
const send=(ws:WebSocket,value:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value))};
const broadcast=(room:Room,value:RelayMessage,except?:Peer,relay=true)=>{room.peers.forEach(p=>{if(p!==except)send(p.ws,value)});if(relay)void room.relay?.publish(value)};
const b64=(value:Uint8Array)=>Buffer.from(value).toString('base64');
const wsServer=new WebSocketServer({noServer:true,maxPayload:6*1024*1024});
server.on('upgrade',(req,socket,head)=>{if(['/sync','/api/server'].includes(new URL(req.url||'','http://app').pathname))wsServer.handleUpgrade(req,socket,head,ws=>wsServer.emit('connection',ws,req))});
wsServer.on('connection',async(ws,req)=>{
 let peer:Peer|undefined,room:Room|undefined;
 try{
 if(!validOrigin(req.headers.origin,req.headers.host)){ws.close(4403,'Origin denied');return}
 const boardId=new URL(req.url||'','http://app').searchParams.get('board');const token=cookieToken(req.headers.cookie);
 if(!boardId||!token){ws.close(4401,'Please sign in');return}
 if(process.env.VERCEL==='1'&&!distributedRealtime){send(ws,{type:'error',status:503,message:'Realtime server configuration is incomplete.'});ws.close(1013,'Realtime unavailable');return}
 const [auth,access]=await Promise.all([upstream('auth.me',{},token),upstream('board.get',{board_id:boardId},token)]);
 room=rooms.get(boardId);if(!room){room={doc:new Y.Doc(),peers:new Set(),chain:Promise.resolve(),voteCheck:0,privateVoting:false};rooms.set(boardId,room);const current=room;const reload=async()=>{const reader=current.peers.values().next().value;const data=await upstream('scene.load',{board_id:boardId},reader?.token||token);for(const u of data.updates||[])Y.applyUpdate(current.doc,Buffer.from(u,'base64'));await refreshRoomAccess(boardId);broadcast(current,{type:'update',update:b64(Y.encodeStateAsUpdate(current.doc))},undefined,false)};
 current.relay=openRelay(boardId,async message=>{
  if(message.type==='invalidate'){await reload();return}
  if(message.type==='presence'||message.type==='leave'||message.type==='private-voting'){
   if(message.type==='private-voting')current.privateVoting=true;
   if(message.type==='presence'&&current.privateVoting)return;
   broadcast(current,message,undefined,false);
  }
 },reload,()=>{for(const p of current.peers)p.ws.close(1012,'Realtime reconnecting')});
 room.loading=distributedRealtime?current.relay.ready:reload()}
 await room.loading;
 peer={ws,token,user:auth.user,boardId,role:access.role||access.board?.role,lastPresence:0,updates:0,window:Date.now()};room.peers.add(peer);
 send(ws,{type:'init',update:b64(Y.encodeStateAsUpdate(room.doc)),vector:b64(Y.encodeStateVector(room.doc)),user:auth.user,role:peer.role,board:access.board,peers:[...room.peers].filter(p=>p!==peer).map(p=>({id:p.user.id,user:p.user}))});
 broadcast(room,{type:'presence',id:auth.user.id,user:auth.user},peer);
 ws.on('message',raw=>{
 const r=room!,p=peer!;let message:any;try{message=JSON.parse(raw.toString())}catch{ws.close(4400,'Invalid message');return}
 if(Date.now()-p.window>60000){p.window=Date.now();p.updates=0}if(++p.updates>1800){ws.close(4429,'Too many updates');return}
 if(message.type==='presence'){
 if(Date.now()-p.lastPresence<45||r.privateVoting)return;p.lastPresence=Date.now();const v=message.value||{};
 const presence={type:'presence',id:p.user.id,user:p.user,x:Number.isFinite(v.x)?v.x:undefined,y:Number.isFinite(v.y)?v.y:undefined,pageId:typeof v.pageId==='string'?v.pageId.slice(0,100):undefined,selected:Array.isArray(v.selected)?v.selected.slice(0,100).filter((s:unknown)=>typeof s==='string'):[],viewport:v.viewport&&['x','y','zoom'].every(k=>Number.isFinite(v.viewport[k]))?v.viewport:undefined,preview:Array.isArray(v.preview)?v.preview.slice(0,20).flatMap((item:unknown)=>{if(!item||typeof item!=='object'||typeof (item as any).id!=='string')return [];const q=item as any;const safe:{id:string;x?:number;y?:number;width?:number;height?:number;rotation?:number}={id:q.id.slice(0,100)};for(const key of ['x','y','width','height','rotation'] as const)if(Number.isFinite(q[key]))safe[key]=q[key];return [safe]}):undefined,chat:typeof v.chat?.text==='string'?{text:v.chat.text.slice(0,100),at:Date.now()}:undefined,reaction:typeof v.reaction?.emoji==='string'?{emoji:v.reaction.emoji.slice(0,8),at:Date.now()}:undefined,spotlight:!!v.spotlight,updatedAt:Date.now()};broadcast(r,presence,p);return}
 if(message.type!=='update'||typeof message.update!=='string'||typeof message.id!=='string')return;
 r.chain=r.chain.then(async()=>{
  try{const result=await upstream('scene.push',{board_id:p.boardId,update:message.update,update_id:message.id},p.token);const canonical=result.update||message.update;Y.applyUpdate(r.doc,Buffer.from(canonical,'base64'));await refreshRoomAccess(p.boardId);broadcast(r,{type:'update',update:canonical},p);send(ws,{type:'ack',id:message.id,sequence:result.sequence,update:canonical});}
  catch(error){const e=error as Error&{status?:number};send(ws,{type:'error',message:e.message,status:e.status,id:message.id});if(e.status===401||e.status===403||e.status===404)ws.close(4403,'Access changed');}
 }).catch(()=>{});
 });
 }catch(error){if(room&&!room.peers.size){room.relay?.close();for(const [id,r]of rooms)if(r===room)rooms.delete(id);room.doc.destroy()}const status=(error as Error&{status?:number}).status;send(ws,{type:'error',status:status||503,message:status?(error as Error).message:'Realtime service temporarily unavailable.'});ws.close(status&&[401,403,404].includes(status)?4403:1013,'Board unavailable')}
 ws.on('close',()=>{if(peer&&room){room.peers.delete(peer);broadcast(room,{type:'leave',id:peer.user.id});const currentRoom=room;setTimeout(()=>{if(currentRoom.peers.size===0&&rooms.get(peer!.boardId)===currentRoom){rooms.delete(peer!.boardId);currentRoom.relay?.close();currentRoom.doc.destroy()}},60000)}});
});
async function refreshRoomAccess(onlyBoard?:string){await Promise.all([...rooms].filter(([id])=>!onlyBoard||id===onlyBoard).map(async([boardId,room])=>{await Promise.all([...room.peers].map(async p=>{try{const a=await upstream('board.get',{board_id:boardId},p.token);p.role=a.role||a.board.role;send(p.ws,{type:'metadata',board:a.board,role:p.role})}catch{room.peers.delete(p);p.ws.close(4403,'Access changed')}}));const p=room.peers.values().next().value;if(p){const w=await upstream('workshop.get',{board_id:boardId},p.token).catch(()=>({privateVoting:true}));room.privateVoting=!!w.privateVoting;if(room.privateVoting)broadcast(room,{type:'private-voting'})}}))}
const checkAccess=setInterval(()=>{for(const [boardId,room]of rooms){for(const peer of room.peers){void upstream('board.get',{board_id:boardId},peer.token).then(data=>{peer.role=data.role||data.board?.role;send(peer.ws,{type:'metadata',board:data.board,role:peer.role});broadcast(room,{type:'presence',id:peer.user.id,user:peer.user},peer)}).catch(()=>peer.ws.close(4403,'Access changed'))}const first=room.peers.values().next().value;if(first&&Date.now()-room.voteCheck>1000){room.voteCheck=Date.now();void upstream('workshop.get',{board_id:boardId},first.token).then(data=>{room.privateVoting=!!data.privateVoting;if(room.privateVoting)broadcast(room,{type:'private-voting'})}).catch(()=>{})}}},4000);
checkAccess.unref();
setInterval(()=>{const now=Date.now();for(const [key,value]of limits)if(now-value.at>120000)limits.delete(key)},120000).unref();
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error.status||500).json({error:error.status===413?'File too large (maximum 8 MB image).':'Invalid request'})});
export async function closeGateway(){clearInterval(checkAccess);await Promise.all([...rooms.values()].map(r=>r.chain));for(const r of rooms.values())r.relay?.close();wsServer.clients.forEach(ws=>ws.close(1001,'Server restarting'))}
export default server;
