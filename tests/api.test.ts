import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';
import { circle } from '@turf/turf';
import { createBackend } from '../server/app';
import { authenticate } from '../server/auth';
import { MemoryRepository } from '../server/repository';
import { DEFAULT_SETTINGS, type Command, type LobbyView } from '../shared/types';

// Synthetic identities/GPS and in-memory storage: AUTOMATED TESTS ONLY.
let backend:Awaited<ReturnType<typeof createBackend>>;
let repository:MemoryRepository;
const clients:Socket[]=[];
const alice={id:randomUUID(),name:'API_Alice'};const bob={id:randomUUID(),name:'API_Bob'};const third={id:randomUUID(),name:'API_Third'};
const token=(actor=alice)=>`test:${actor.id}:${actor.name}`;
const auth=(actor=alice)=>({Authorization:`Bearer ${token(actor)}`});
beforeEach(async()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('TEST_AUTH','true');vi.stubEnv('FRONTEND_URL','http://localhost:5173');repository=new MemoryRepository();backend=await createBackend({repository,supabase:null,timers:false});});
afterEach(async()=>{clients.splice(0).forEach(socket=>socket.disconnect());await backend?.close();vi.unstubAllEnvs();});
async function profiles(){for(const actor of [alice,bob,third])await request(backend.app).get('/api/profile').set(auth(actor)).expect(200);}
async function connect(actor=alice){
 if(!backend.httpServer.listening)await new Promise<void>(r=>backend.httpServer.listen(0,'127.0.0.1',r));
 const port=(backend.httpServer.address() as AddressInfo).port;
 const socket=io(`http://127.0.0.1:${port}`,{auth:{token:token(actor)},transports:['websocket'],reconnection:false});clients.push(socket);
 await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);});return socket;
}
async function ack<T=LobbyView>(socket:Socket,event:string,data:unknown={}):Promise<T>{return new Promise((resolve,reject)=>socket.timeout(3000).emit(event,data,(timeout:Error|null,result:{ok:boolean;data:T;error?:string})=>timeout?reject(timeout):result.ok?resolve(result.data):reject(new Error(result.error))));}
const send=(socket:Socket,command:Command)=>ack(socket,'lobby:command',{command});
async function match(){await profiles();const a=await connect(alice),b=await connect(bob);const lobby=await ack(a,'lobby:create',{settings:{...DEFAULT_SETTINGS,randomRoles:false,preparationSeconds:0,headStartSeconds:0,captureMethod:'code'}});await ack(b,'lobby:join',{code:lobby.code});await send(a,{type:'zone',zone:{feature:circle([13.4,52.5],.5),excluded:[],confirmed:true,name:'ISOLATED TEST ZONE'}});await send(a,{type:'assign',playerId:alice.id,role:'hunter',team:'A'});await send(a,{type:'ready',ready:true});await send(b,{type:'ready',ready:true});await send(a,{type:'start'});return{a,b,lobby};}

describe('authenticated API and Socket.IO transport',()=>{
 it('lets a full group on a shared network reconnect without exhausting the IP budget',async()=>{
  const group=Array.from({length:40},(_,index)=>({id:randomUUID(),name:`Shared_Network_${index}`}));
  for(const person of group)(await connect(person)).disconnect();
  for(const person of group)(await connect(person)).disconnect();
 });
 it('limits connection bursts per verified identity without blocking another player',async()=>{
  for(let i=0;i<20;i++)(await connect(alice)).disconnect();
  await expect(connect(alice)).rejects.toThrow(/Zu viele/);
  const other=await connect(bob);expect(other.connected).toBe(true);
 });
 it('rejects missing or malformed credentials before returning a profile',async()=>{
  await request(backend.app).get('/api/profile').expect(401);
  await request(backend.app).get('/api/profile').set('Authorization','Bearer test:invalid:no').expect(401);
 });
 it('keeps account changes bound to the authenticated account and rejects role/GPS fields',async()=>{
  await profiles();await request(backend.app).patch('/api/profile').set(auth()).send({id:bob.id,username:'Hacked'}).expect(400);
  await request(backend.app).patch('/api/profile').set(auth()).send({username:'<script>alert(1)</script>'}).expect(400);
  await request(backend.app).patch('/api/profile').set(auth()).send({username:'API_New',show_online:true}).expect(200);
  expect((await request(backend.app).get('/api/profile').set(auth(bob))).body.username).toBe(bob.name);
  await request(backend.app).patch('/api/profile').set(auth(bob)).send({username:'api_new'}).expect(409);
 });
 it('rejects unrelated avatar hosts, foreign object paths and fake storage uploads',async()=>{
  await request(backend.app).patch('/api/profile').set(auth()).send({avatar_url:'https://evil.example/avatar.svg'}).expect(400);
  await request(backend.app).post('/api/profile/avatar').set(auth()).send({path:`${bob.id}/image.webp`}).expect(400);
  await request(backend.app).post('/api/profile/avatar').set(auth()).send({path:`${alice.id}/../image.webp`}).expect(400);
  await request(backend.app).post('/api/profile/avatar').set(auth()).send({path:`${alice.id}/image.webp`}).expect(503);
 });
 it('enforces recipient-only friend acceptance and blocking on both sides',async()=>{
  await profiles();const code=repository.profiles.get(bob.id)!.friend_code;
  await request(backend.app).post('/api/friends/request').set(auth()).send({code}).expect(200);
  const incoming=(await request(backend.app).get('/api/social').set(auth(bob))).body.requests[0];
  await request(backend.app).post('/api/friends/respond').set(auth(third)).send({requestId:incoming.id,accept:true}).expect(404);
  await request(backend.app).post('/api/friends/respond').set(auth(bob)).send({requestId:incoming.id,accept:true}).expect(200);
  await request(backend.app).post(`/api/blocks/${alice.id}`).set(auth(bob)).send({}).expect(200);
  expect((await request(backend.app).get('/api/social').set(auth())).body.friends).toEqual([]);
  await request(backend.app).post('/api/friends/request').set(auth()).send({code}).expect(400);
 });
 it('isolates presets and cannot delete another account’s preset',async()=>{
  const preset=(await request(backend.app).post('/api/presets').set(auth()).send({name:'My rules',settings:DEFAULT_SETTINGS}).expect(200)).body;
  await request(backend.app).delete(`/api/presets/${preset.id}`).set(auth(bob)).expect(200);
  expect((await request(backend.app).get('/api/presets').set(auth())).body).toHaveLength(1);
  expect((await request(backend.app).get('/api/presets').set(auth(bob))).body).toHaveLength(0);
 });
 it('preserves privacy-default presence and blocks forbidden origin sockets',async()=>{
  const profile=(await request(backend.app).get('/api/profile').set(auth()).expect(200)).body;expect(profile.show_online).toBe(false);
  await connect();const port=(backend.httpServer.address() as AddressInfo).port;
  const bad=io(`http://127.0.0.1:${port}`,{auth:{token:token(bob)},extraHeaders:{Origin:'https://evil.example'},transports:['websocket'],reconnection:false});clients.push(bad);
  await expect(new Promise<void>((resolve,reject)=>{bad.once('connect',()=>resolve());bad.once('connect_error',reject);})).rejects.toThrow();
 });
 it('validates host permission and never sends a stranger live coordinates or capture codes',async()=>{
  const{a,b}=await match();await expect(send(b,{type:'kick',playerId:alice.id})).rejects.toThrow();
  await send(b,{type:'location',location:{latitude:52.5,longitude:13.4,accuracy:5,timestamp:Date.now()}});
  const state=await ack(a,'lobby:sync');expect(state.players.find(p=>p.id===bob.id)).not.toHaveProperty('location');expect(state.players.find(p=>p.id===bob.id)).not.toHaveProperty('captureCode');expect(state).not.toHaveProperty('_engine');
 });
 it('persists safety changes even when the GPS action is rejected',async()=>{
  const{b,lobby}=await match();await send(b,{type:'location',location:{latitude:52.51,longitude:13.4,accuracy:5,timestamp:Date.now()}});
  expect((await ack(b,'lobby:sync')).self.outsideSince).toBeDefined();
  await expect(send(b,{type:'location',location:{latitude:52.51,longitude:13.4,accuracy:500,timestamp:Date.now()+1}})).rejects.toThrow();
  expect((await ack(b,'lobby:sync')).self.outsideSince).toBeUndefined();
  expect(repository.checkpoints.get(lobby.id)!.players.find(p=>p.id===bob.id)!.outsideSince).toBeUndefined();
 });
 it('keeps failed capture attempts authoritative across transport rollback',async()=>{
  const{a,b}=await match();const code=(await ack(b,'lobby:sync')).self.captureCode;const wrong=code==='000000'?'111111':'000000';
  for(let i=0;i<6;i++)await expect(send(a,{type:'capture',targetId:bob.id,code:wrong})).rejects.toThrow(/Fangcode/);
  await expect(send(a,{type:'capture',targetId:bob.id,code})).rejects.toThrow(/Fangversuche/);
  expect((await ack(b,'lobby:sync')).self.eliminated).toBe(false);
 });
 it('restores results after reconnect and lets players leave a finished match',async()=>{
  const{a,b}=await match();const code=(await ack(b,'lobby:sync')).self.captureCode;
  await send(a,{type:'capture',targetId:bob.id,code});
  expect((await ack(a,'lobby:sync')).status).toBe('finished');
  const result=(await request(backend.app).get('/api/history').set(auth())).body;expect(result).toHaveLength(1);expect(result[0].won).toBe(true);
  await send(b,{type:'leave'});expect(await ack(b,'lobby:sync')).toBeNull();
  expect((await ack(a,'lobby:sync')).status).toBe('finished');
 });
 it('does not acknowledge a mutation when durable storage fails',async()=>{
  await profiles();const a=await connect();vi.spyOn(repository,'save').mockRejectedValueOnce(new Error('database unavailable'));
  await expect(ack(a,'lobby:create',{})).rejects.toThrow(/gespeichert/);
  expect(backend.engine.lobbyFor(alice.id)).toBeUndefined();
  await request(backend.app).get('/api/health').expect(503);
 });
 it('reloads scrubbed completed matches without discarding other players history',async()=>{
  const {a,b,lobby}=await match();const code=(await ack(b,'lobby:sync')).self.captureCode;
  await send(a,{type:'capture',targetId:bob.id,code});
  const stored=backend.engine.lobbies.get(lobby.id)!;
  // A synthetic legacy personal-winner result exercises transport erasure.
  stored.result={winner:bob.id,reason:'API_Bob ist der letzte Hider.',survivors:[bob.id],endedAt:Date.now()};
  await repository.save(stored);
  await request(backend.app).delete('/api/profile').set(auth(bob)).expect(200);
  const remaining=await ack(a,'lobby:sync');expect(remaining.result?.winner).toBe('deleted_player');expect(remaining.players).toHaveLength(1);
  expect(JSON.stringify(backend.engine.snapshot())).not.toContain(bob.id);
  const history=(await request(backend.app).get('/api/history').set(auth())).body;
  expect(history).toHaveLength(1);expect(JSON.stringify(history)).not.toContain('API_Bob');expect(JSON.stringify(history)).not.toContain(bob.id);
 });
 it('removes the account’s in-memory records and disconnects its sockets on deletion',async()=>{
  await profiles();const a=await connect();await ack(a,'lobby:create',{});
  await request(backend.app).delete('/api/profile').set(auth()).expect(200);
  expect(repository.profiles.has(alice.id)).toBe(false);
  expect(backend.engine.lobbyFor(alice.id)).toBeUndefined();
 });
});

describe('production authentication guards',()=>{
 it('never accepts test tokens when either independent test guard is absent',async()=>{
  vi.stubEnv('NODE_ENV','production');await expect(authenticate(token(),null)).rejects.toThrow(/nicht eingerichtet/);
  vi.stubEnv('NODE_ENV','test');vi.stubEnv('TEST_AUTH','false');await expect(authenticate(token(),null)).rejects.toThrow(/nicht eingerichtet/);
 });
 it('refuses to start production with TEST_AUTH enabled',async()=>{
  vi.stubEnv('NODE_ENV','production');await expect(createBackend()).rejects.toThrow(/cannot be enabled/);
 });
 it('requires a verified Supabase user and rejects expired access tokens',async()=>{
  vi.stubEnv('TEST_AUTH','false');
  const bad={auth:{getUser:async()=>({data:{user:null},error:{message:'invalid'}})}} as unknown as SupabaseClient;
  await expect(authenticate('invalid.token',bad)).rejects.toThrow(/abgelaufen/);
  const expired=`test.${Buffer.from(JSON.stringify({exp:1})).toString('base64url')}.signature`;
  const verified={auth:{getUser:async()=>({data:{user:{id:alice.id,is_anonymous:false}},error:null})}} as unknown as SupabaseClient;
  await expect(authenticate(expired,verified)).rejects.toThrow(/abgelaufen/);
 });
 it('serves explicit setup state when real services are not configured',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('TEST_AUTH','false');
  const unconfigured=await createBackend({supabase:null,timers:false});
  try{expect((await request(unconfigured.app).get('/api/config')).body.configured).toBe(false);await request(unconfigured.app).get('/api/profile').set(auth()).expect(503);}finally{await unconfigured.close();}
 });
});
