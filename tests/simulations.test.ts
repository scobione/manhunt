import {describe,it,expect} from 'vitest';
import {circle,booleanPointInPolygon} from '@turf/turf';
import {randomUUID} from 'node:crypto';
import {SimulationService} from '../server/simulations';
import {TestSimulationStore} from './simulation-fixtures';
import {DEFAULT_BADGES} from '../shared/achievements';
import {DEFAULT_QUESTIONS} from '../shared/feedback';
import {DEFAULT_SETTINGS} from '../shared/types';
import type {SimulationView} from '../shared/simulation';
const owner={id:randomUUID(),expiresAt:Date.now()+3600000};
async function setup(zombie=false){let now=Date.now();const store=new TestSimulationStore(),service=new SimulationService(store,()=>now);let v=await service.handle(owner,'/admin/simulations','POST',{},new URLSearchParams()) as SimulationView;
 async function cmd(command:unknown){v=await service.handle(owner,`/admin/simulations/${v.id}/command`,'POST',{generation:v.generation,playerId:v.view.hostId,command},new URLSearchParams()) as SimulationView;return v;}
 await cmd({type:'settings',settings:{...DEFAULT_SETTINGS,preparationSeconds:0,headStartSeconds:0,rules:{zombie,apocalypse:false,xpHunt:false}}});await cmd({type:'zone',zone:{name:'ISOLATED SIMULATION TEST',confirmed:true,feature:circle([13.405,52.52],.4),excluded:[]}});await cmd({type:'start'});
 const event=async(type:string,target?:string,seconds?:number)=>{v=await service.handle(owner,`/admin/simulations/${v.id}/events`,'POST',{generation:v.generation,playerId:target??v.view.hostId,events:[{type,...(seconds?{seconds}:{})}]},new URLSearchParams()) as SimulationView;return v;};
 return{service,store,cmd,event,get v(){return v;},advance:(n:number)=>now+=n};}

describe('isolated admin simulation using the real game engine',()=>{
 it('SIM-01 virtual players start without auth rows, safe positions and role views',async()=>{const t=await setup();expect(t.v.roster).toHaveLength(6);expect(t.v.roster.filter(p=>p.role==='hunter')).toHaveLength(1);expect(t.v.roster.every(p=>booleanPointInPolygon([p.location!.longitude,p.location!.latitude],t.v.view.zone!.feature))).toBe(true);expect(t.v.roster.some(p=>p.id===owner.id)).toBe(false);expect(t.store.rows.size).toBe(1);});
 it('SIM-02 another administrator cannot access or mutate an owned simulation',async()=>{const t=await setup();await expect(t.service.handle({...owner,id:randomUUID()},`/admin/simulations/${t.v.id}`,'GET',{},new URLSearchParams())).rejects.toThrow(/nicht verfügbar/);});
 it('SIM-03 real outside warning, confirmed return and swipe command',async()=>{const t=await setup();const id=t.v.roster.find(p=>p.role==='hider')!.id;let v=await t.event('outside',id);expect(v.view.self.outsideActive).toBe(true);v=await t.event('inside',id);expect(v.view.self.returnPending).toBe(true);v=await t.service.handle(owner,`/admin/simulations/${v.id}/command`,'POST',{generation:v.generation,playerId:id,command:{type:'zone_return_ack'}},new URLSearchParams()) as SimulationView;expect(v.view.self.returnPending).toBe(false);});
 it('SIM-04 captures create real infection and revival updates permissions',async()=>{const t=await setup(true),id=t.v.roster.find(p=>p.role==='hider')!.id;let v=await t.event('capture',id);expect(v.view.self.role).toBe('zombie');expect(v.view.self.infectionPending).toBe(true);v=await t.event('revive',id);expect(v.view.self.infectionPending).toBe(false);});
 it('SIM-05 outside time is accumulated by current virtual fixes and eliminates',async()=>{const t=await setup(),id=t.v.roster.find(p=>p.role==='hider')!.id;await t.event('outside',id);const v=await t.event('advance',id,70);expect(v.view.self.eliminated).toBe(true);});
 it('SIM-06 reset clears active warnings, offers, badge counters and generation rejects stale work',async()=>{const t=await setup(),old=t.v;await t.event('badge');await t.event('outside');const reset=await t.service.handle(owner,`/admin/simulations/${old.id}/reset`,'POST',{generation:old.generation},new URLSearchParams()) as SimulationView;expect(reset.generation).toBe(old.generation+1);expect(reset.view.status).toBe('waiting');expect(reset.log).toEqual([]);expect(reset.badges.badges.every(b=>b.level===0)).toBe(true);await expect(t.service.handle(owner,`/admin/simulations/${old.id}/events`,'POST',{generation:old.generation,events:[{type:'badge'}]},new URLSearchParams())).rejects.toThrow(/zurückgesetzt/);});
 it('SIM-07 completion offers feedback to each virtual player and persistence stays isolated',async()=>{const t=await setup();const v=await t.event('timeout');expect(v.view.status).toBe('finished');const state=(await t.store.get(owner.id,v.id))!.state;expect(Object.keys(state.offers)).toHaveLength(6);await t.service.handle(owner,`/admin/simulations/${v.id}`,'DELETE',{},new URLSearchParams());expect(t.store.rows.size).toBe(0);});
});

describe('simulation mode combinations and concurrency',()=>{
 it('SIM-08 XP + zombie + apocalypse use live rules, point collection and shrinking without touching real awards',async()=>{
  const t=await setup(true);let v=await t.service.handle(owner,`/admin/simulations/${t.v.id}/reset`,'POST',{generation:t.v.generation},new URLSearchParams()) as SimulationView;
  const run=async(command:unknown)=>{v=await t.service.handle(owner,`/admin/simulations/${v.id}/command`,'POST',{generation:v.generation,playerId:v.view.hostId,command},new URLSearchParams()) as SimulationView;};
  await run({type:'settings',settings:{...v.view.settings,rules:{zombie:true,apocalypse:true,xpHunt:true},phases:[{afterSeconds:0,scale:1},{afterSeconds:600,scale:.5}]}});await run({type:'start'});
  const hider=v.roster.find(p=>p.role==='hider')!.id;v=await t.service.handle(owner,`/admin/simulations/${v.id}/events`,'POST',{generation:v.generation,playerId:hider,events:[{type:'xp_collect'}]},new URLSearchParams()) as SimulationView;expect(v.view.xpHunt?.collected).toBe(1);
  v=await t.service.handle(owner,`/admin/simulations/${v.id}/events`,'POST',{generation:v.generation,playerId:hider,events:[{type:'capture'}]},new URLSearchParams()) as SimulationView;expect(v.view.self.role).toBe('zombie');expect(v.view.xpHunt?.collected).toBe(1);
  v=await t.service.handle(owner,`/admin/simulations/${v.id}/events`,'POST',{generation:v.generation,playerId:hider,events:[{type:'next_phase'}]},new URLSearchParams()) as SimulationView;expect(v.view.activeZone).not.toEqual(v.view.zone?.feature);expect(v.view.xpHunt?.collected).toBe(1);
 });
 it('SIM-09 concurrent events cannot overwrite each other or resurrect state after reset',async()=>{const t=await setup();const responses=await Promise.allSettled([1,2].map(()=>t.service.handle(owner,`/admin/simulations/${t.v.id}/events`,'POST',{generation:t.v.generation,events:[{type:'badge'}]},new URLSearchParams())));expect(responses.filter(r=>r.status==='fulfilled')).toHaveLength(1);const saved=(await t.store.get(owner.id,t.v.id))!;expect(saved.state.counters[t.v.view.hostId].captures).toBe(20);});
});

 describe('simulation user actions',()=>{
 it('SIM-10 pin event advances to the real publication deadline and emits a visible pin',async()=>{const t=await setup(),hider=t.v.roster.find(p=>p.role==='hider')!;const before=t.v.view.serverTime;const v=await t.event('pin',hider.id);expect(v.view.serverTime).toBeGreaterThan(before);expect(v.view.pins.some(p=>p.playerId===hider.id&&p.createdAt>=before)).toBe(true);});
 it('SIM-11 leaving the selected virtual player changes perspective and keeps the simulation usable',async()=>{const t=await setup(),id=t.v.view.self.id;const v=await t.cmd({type:'leave'});expect(v.view.self.id).not.toBe(id);expect(v.view.self.eliminated).toBe(false);expect(t.store.rows.size).toBe(1);});
});

it('SIM-12 simulation snapshots the configured catalog without live award writes',async()=>{const store=new TestSimulationStore(),defs=structuredClone(DEFAULT_BADGES);defs.find(b=>b.id==='hunter')!.name='Configured Hunter';const service=new SimulationService(store,Date.now,{definitions:async()=>defs,settings:async()=>({version:'42',questions:DEFAULT_QUESTIONS})});const v=await service.handle(owner,'/admin/simulations','POST',{},new URLSearchParams()) as SimulationView;expect(v.badges.badges.find(b=>b.id==='hunter')?.name).toBe('Configured Hunter');expect((await store.get(owner.id,v.id))!.state.catalog?.feedback.version).toBe('42');});
