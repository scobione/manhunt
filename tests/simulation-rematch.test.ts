/** Virtual matches only: test counters/positions never leave the isolated simulation store. */
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {SimulationService} from '../server/simulations';
import {TestSimulationStore} from './simulation-fixtures';
import type {SimulationView} from '../shared/simulation';
it('SIM-REMATCH: retains new round identity, resets GPS/offers, and awards virtual milestones once per eligible round',async()=>{
 const owner={id:randomUUID(),expiresAt:Date.now()+3600000},store=new TestSimulationStore(),service=new SimulationService(store);
 let view=await service.handle(owner,'/admin/simulations','POST',{},new URLSearchParams()) as SimulationView;
 const cmd=async(command:unknown)=>view=await service.handle(owner,`/admin/simulations/${view.id}/command`,'POST',{generation:view.generation,playerId:view.view.hostId,command},new URLSearchParams()) as SimulationView;
 await cmd({type:'settings',settings:{...view.view.settings,durationSeconds:300,preparationSeconds:0,headStartSeconds:0,rules:{zombie:false,apocalypse:false,xpHunt:false}}});
 await cmd({type:'zone',zone:{name:'ISOLATED REMATCH SIMULATION',confirmed:true,excluded:[],feature:circle([13.405,52.52],.4)}});await cmd({type:'start'});
 view=await service.handle(owner,`/admin/simulations/${view.id}/events`,'POST',{generation:view.generation,events:[{type:'timeout'}]},new URLSearchParams()) as SimulationView;
 const old=view.view.id,hider=view.roster.find(p=>p.role==='hider')!.id,state=(await store.get(owner.id,view.id))!.state;
 expect(state.counters[hider].wins).toBe(1);expect(state.counters[hider].survivals).toBe(1);expect(state.badges[hider].badges.find(b=>b.id==='winner')?.level).toBe(1);
 await service.handle(owner,`/admin/simulations/${view.id}`,'GET',{},new URLSearchParams());expect((await store.get(owner.id,view.id))!.state.counters[hider].wins).toBe(1);
 await cmd({type:'rematch',matchId:old});expect(view.view.id).not.toBe(old);expect(view.view.previousMatchId).toBe(old);expect(view.view.round).toBe(2);expect(view.view.status).toBe('waiting');
 const next=(await store.get(owner.id,view.id))!.state;expect(next.lobby.id).toBe(view.view.id);expect(next.positions).toEqual({});expect(next.offers).toEqual({});expect(next.counters[hider].wins).toBe(1);expect(view.roster.every(p=>!p.ready&&!p.location)).toBe(true);
 await cmd({type:'start'});expect(view.view.status).toBe('active');expect(view.view.round).toBe(2);
 const reset=await service.handle(owner,`/admin/simulations/${view.id}/reset`,'POST',{generation:view.generation},new URLSearchParams()) as SimulationView;expect(reset.badges.badges.every(b=>b.level===0)).toBe(true);expect((await store.get(owner.id,view.id))!.state.awardedMatches).toBeUndefined();
});
