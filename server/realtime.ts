import {createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

export type RelayMessage = {type:string; [key:string]:unknown};
const key = process.env.CANVASLAB_REALTIME_KEY;
const instance = crypto.randomUUID();
const url = process.env.CANVASLAB_REALTIME_URL || 'https://txsyyhcrtasrqodtvpvn.supabase.co';
const client = key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}) : null;
export const distributedRealtime = !!client;
const topic=(boardId:string)=>`canvaslab:${createHmac('sha256',key||'').update(boardId).digest('hex')}`;

export async function invalidateRelay(boardId:string){
 if(!client)return;
 const channel=client.channel(topic(boardId),{config:{private:true}});
 try{const result=await channel.send({type:'broadcast',event:'relay',payload:{instance,message:{type:'invalidate'}}});if(result!=='ok')throw new Error('Realtime notification failed')}finally{await client.removeChannel(channel)}
}

// This module is imported exclusively by the Node gateway. No server key or
// private broker channel is exposed to the browser. Every browser peer still
// passes the application's session and board authorization checks.
export function openRelay(boardId:string,receive:(message:RelayMessage)=>Promise<void>,resync:()=>Promise<void>,unavailable:()=>void) {
 let closed=false,subscribed=false;
 let resolveReady:()=>void,rejectReady:(error:Error)=>void;
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
 if(!client){resolveReady!();return {ready,publish:async(_message:RelayMessage)=>{},close:()=>{}}}
 const timer=setTimeout(()=>rejectReady(new Error('Realtime broker connection timed out')),15000);
 const fail=()=>{if(closed)return;subscribed=false;unavailable()};
 const channel=client.channel(topic(boardId),{config:{private:true,broadcast:{self:false,ack:true}}});
 channel.on('broadcast',{event:'relay'},({payload})=>{
  if(closed||payload?.instance===instance||!payload?.message)return;
  void receive(payload.message).catch(fail);
 });
 channel.subscribe(status=>{
  if(closed)return;
  if(status==='SUBSCRIBED'){
   const first=!subscribed;subscribed=true;clearTimeout(timer);
   // Reload persisted state after broker subscription, including reconnects,
   // so a missed broadcast can never permanently fork a board.
   if(first)void resync().then(resolveReady).catch(error=>{rejectReady(error);fail()});
  }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
   clearTimeout(timer);rejectReady(new Error('Realtime broker unavailable'));fail();
  }
 });
 return {
  ready,
  async publish(message:RelayMessage){
   if(closed||!channel)return;
   // Relay notifications for durable scene changes, never large document bytes.
   // Each receiver reloads authorized canonical state from the database.
   const safe=message.type==='update'?{type:'invalidate'}:message;
   if(!subscribed){fail();return}
   try{
    const status=await channel.send({type:'broadcast',event:'relay',payload:{instance,message:safe}});
    if(status!=='ok')fail();
   }catch{fail()}
  },
  close(){closed=true;clearTimeout(timer);if(channel)void client.removeChannel(channel)},
 };
}
