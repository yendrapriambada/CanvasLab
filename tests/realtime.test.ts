import {afterEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({channel:vi.fn(),removeChannel:vi.fn(),create:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mock.create}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();vi.resetModules()});
async function setup(key='server-test-key'){
 vi.stubEnv('CANVASLAB_REALTIME_KEY',key);
 let receive:(value:any)=>void=()=>{};let subscribe:(status:string)=>void=()=>{};
 const channel={on:vi.fn((_event,_filter,cb)=>{receive=cb;return channel}),subscribe:vi.fn(cb=>{subscribe=cb;return channel}),send:vi.fn(async()=> 'ok')};
 mock.channel.mockReturnValue(channel);mock.removeChannel.mockResolvedValue('ok');mock.create.mockReturnValue(mock);
 const module=await import('../server/realtime');
 return {...module,channel,message:(message:any,instance='other-instance')=>receive({payload:{instance,message}}),status:(status:string)=>subscribe(status)};
}
describe('private distributed gateway relay',()=>{
 it('subscribes privately on an opaque topic and resyncs before readiness',async()=>{
  const s=await setup();const resync=vi.fn(async()=>{});const r=s.openRelay('board-id',vi.fn(),resync,vi.fn());
  expect(mock.channel).toHaveBeenCalledWith(expect.stringMatching(/^canvaslab:[a-f0-9]{64}$/),{config:{private:true,broadcast:{self:false,ack:true}}});
  s.status('SUBSCRIBED');await r.ready;expect(resync).toHaveBeenCalledOnce();r.close();expect(mock.removeChannel).toHaveBeenCalledWith(s.channel);
 });
 it('relays only an invalidation for durable scene data',async()=>{
  const s=await setup();const r=s.openRelay('board-id',vi.fn(),async()=>{},vi.fn());s.status('SUBSCRIBED');await r.ready;
  await r.publish({type:'update',update:'private-large-document'});
  expect(s.channel.send).toHaveBeenCalledWith(expect.objectContaining({payload:{instance:expect.any(String),message:{type:'invalidate'}}}));r.close();
 });
 it('passes remote events and fails closed on broker outage',async()=>{
  const s=await setup();const receive=vi.fn(async()=>{}),unavailable=vi.fn();const r=s.openRelay('board-id',receive,async()=>{},unavailable);s.status('SUBSCRIBED');await r.ready;
  s.message({type:'presence',id:'verified-user'});expect(receive).toHaveBeenCalledWith({type:'presence',id:'verified-user'});
  s.status('CHANNEL_ERROR');expect(unavailable).toHaveBeenCalledOnce();r.close();
 });
 it('publishes HTTP scene changes even when this instance has no browser room',async()=>{
  const s=await setup();await s.invalidateRelay('board-id');expect(mock.channel).toHaveBeenCalledWith(expect.any(String),{config:{private:true}});expect(s.channel.send).toHaveBeenCalledWith(expect.objectContaining({payload:{instance:expect.any(String),message:{type:'invalidate'}}}));expect(mock.removeChannel).toHaveBeenCalled();
 });
 it('keeps local single-server development working without a credential',async()=>{
  const s=await setup('');const r=s.openRelay('board-id',vi.fn(),vi.fn(),vi.fn());await r.ready;await r.publish({type:'presence'});expect(s.distributedRealtime).toBe(false);expect(mock.create).not.toHaveBeenCalled();r.close();
 });
});
