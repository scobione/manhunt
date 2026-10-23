import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { circle } from '@turf/turf';
import { createEdgeHandler } from '../server/edge-runtime';
import { MemoryRepository } from '../server/repository';
import { HttpError } from '../server/auth';
import { DEFAULT_SETTINGS } from '../shared/types';
import { TestEdgeStore } from './edge-fixtures';

// Synthetic authenticated identities, never used by the deployed entrypoint.
const host:string=randomUUID(),guest:string=randomUUID(),stranger:string=randomUUID();
let store:TestEdgeStore,repo:MemoryRepository,handler:ReturnType<typeof createEdgeHandler>;
beforeEach(()=>{store=new TestEdgeStore();repo=new MemoryRepository();repo.checkpoints=store.lobbies;handler=createEdgeHandler({store,repository:repo,origins:['https://manhunt.test'],verify:async token=>{if(![host,guest,stranger].includes(token))throw new HttpError(401,'Ungültige Sitzung.');return {id:token,username:`Test_${token.slice(0,5)}`,expiresAt:Date.now()+3600000};}});});
async function request(id:string,path:string,method='GET',body?:unknown){const res=await handler(new Request(`https://edge.test/functions/v1/manhunt-api/api${path}`,{method,headers:{Origin:'https://manhunt.test',...(id?{Authorization:`Bearer ${id}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:res.status,body:await res.json()};}
const event=(id:string,event:string,data:unknown={})=>request(id,'/events','POST',{event,data});
const command=(id:string,command:unknown)=>event(id,'lobby:command',{command});
async function match(mode='normal'){
 const made=await event(host,'lobby:create',{settings:{...DEFAULT_SETTINGS,mode,winCondition:mode==='zombie'?'infection':'survival',preparationSeconds:0,headStartSeconds:0,randomRoles:false,disconnectGraceSeconds:15}});
 expect(made.status).toBe(200);await event(guest,'lobby:join',{code:made.body.lobby.code});
 await command(host,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],name:'AUTOMATED TEST ZONE',confirmed:true}});
 await command(host,{type:'assign',playerId:host,role:'hunter',team:'A'});
 await command(host,{type:'ready',ready:true});await command(guest,{type:'ready',ready:true});
 expect((await command(host,{type:'start'})).status).toBe(200);
}
describe('stateless Edge multiplayer transport (isolated)',()=>{
 it('public health checks the real store and private endpoints require verified auth',async()=>{expect((await request('','/health')).body.transport).toBe('http');expect((await request('','/profile')).status).toBe(401);expect((await request('forged','/events','POST',{})).status).toBe(401);store.failed=true;expect((await request('','/health')).status).toBe(503);});
 it('rejects foreign origins and oversized bodies before any game mutation',async()=>{const res=await handler(new Request('https://edge.test/api/health',{headers:{Origin:'https://untrusted.test'}}));expect(res.status).toBe(403);expect((await request(host,'/events','POST',{data:'x'.repeat(70000)})).status).toBe(413);expect(store.lobbies.size).toBe(0);});
 it('rebuilds from durable state across handlers and rejects non-host settings',async()=>{const made=await event(host,'lobby:create');await event(guest,'lobby:join',{code:made.body.lobby.code});expect((await command(guest,{type:'settings',settings:DEFAULT_SETTINGS})).status).toBe(400);const state=await request(guest,'/sync');expect(state.body.lobby.players).toHaveLength(2);expect((await command(stranger,{type:'start'})).status).toBe(404);});
 it('retries stale snapshots and preserves simultaneous joins without overwrites',async()=>{const made=await event(host,'lobby:create');store.conflicts=2;const results=await Promise.all([guest,stranger].map(id=>event(id,'lobby:join',{code:made.body.lobby.code})));expect(results.map(r=>r.status)).toEqual([200,200]);expect((await request(host,'/sync')).body.lobby.players).toHaveLength(3);});
 it('fails closed when compare-and-swap keeps conflicting',async()=>{store.conflicts=20;expect((await event(host,'lobby:create')).status).toBe(409);expect(store.lobbies.size).toBe(0);});
 it('persists GPS anti-cheat evidence and filters private coordinates',async()=>{await match();const stamp=store.clock;await command(guest,{type:'location',location:{latitude:52.52,longitude:13.405,accuracy:5,timestamp:stamp}});const sync=await request(host,'/sync');expect(JSON.stringify(sync.body)).not.toContain('"location"');expect(sync.body.lobby.players.find((p:any)=>p.id===guest).captureCode).toBeUndefined();const bad=await command(guest,{type:'location',location:{latitude:52.6,longitude:13.5,accuracy:5,timestamp:stamp+1}});expect(bad.status).toBe(400);});
 it('normal capture requires confirmation and a duplicate cannot capture twice',async()=>{await match();const capture=await command(host,{type:'capture',targetId:guest});expect(capture.status).toBe(200);const pending=(await request(guest,'/sync')).body.lobby.captures[0];expect(pending).toBeTruthy();expect((await command(guest,{type:'confirm_capture',captureId:pending.id,accept:true})).body.lobby.status).toBe('finished');expect((await command(guest,{type:'confirm_capture',captureId:pending.id,accept:true})).status).toBe(400);});
 it('zombie infections are server registered before client acknowledgement',async()=>{await match('zombie');await command(host,{type:'capture',targetId:guest});const pending=(await request(guest,'/sync')).body.lobby.captures[0];const result=await command(guest,{type:'confirm_capture',captureId:pending.id,accept:true});expect(result.body.lobby.self.role).toBe('zombie');expect(result.body.lobby.result.winner).toBe('infected');});
 it('expired presence pauses before a returning client can continue the match',async()=>{await match();store.clock+=40000;const result=await request(host,'/sync');expect(result.body.lobby.status).toBe('paused');expect(result.body.lobby.players.find((p:any)=>p.id===guest).connected).toBe(false);await request(guest,'/sync');expect((await command(host,{type:'resume'})).body.lobby.status).toBe('active');});
 it('simultaneous returns after an outage pause instead of jumping to time-limit results',async()=>{await match();store.clock+=40*60*1000;await store.touch(host);await store.touch(guest);const result=await request(host,'/sync');expect(result.body.lobby.status).toBe('paused');expect(result.body.lobby.result).toBeUndefined();const resumed=await command(host,{type:'resume'});expect(resumed.body.lobby.status).toBe('active');expect(resumed.body.lobby.endsAt-store.clock).toBeGreaterThan(29*60*1000);});
 it('blocks strangers, friend relationships and invites use the same repository rules',async()=>{await request(host,'/profile');await request(guest,'/profile');const other=repo.profiles.get(guest)!;expect((await request(host,'/friends/request','POST',{code:other.friend_code})).status).toBe(200);const social=await request(guest,'/social');await request(guest,'/friends/respond','POST',{requestId:social.body.requests[0].id,accept:true});const made=await event(host,'lobby:create');expect((await request(host,'/invites','POST',{friendId:guest,code:made.body.lobby.code})).status).toBe(200);await request(host,`/blocks/${guest}`,'POST',{});expect((await event(guest,'lobby:join',{code:made.body.lobby.code})).status).toBe(403);});
 it('enforces per-user quotas independently of worker lifetime',async()=>{for(let i=0;i<120;i++)await request(host,'/profile');expect((await request(host,'/profile')).status).toBe(429);expect((await request(guest,'/profile')).status).toBe(200);});
});
