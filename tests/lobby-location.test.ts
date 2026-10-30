/** Isolated tests with simulated GPS; no live users or device coordinates. */
import {beforeEach,expect,it} from 'vitest';
import {circle} from '@turf/turf';
import {GameEngine,GameError} from '../server/engine';
import type {Command,Lobby} from '../shared/types';
let now:number,e:GameEngine,l:Lobby;
const profile=(id:string)=>({id,username:`Fixture_${id}`,avatar_url:null,friend_code:`TEST${id}`,show_online:false});
const send=(id:string,command:Command)=>e.command(l.id,id,command);
const sample=(extra={})=>({longitude:13.401234,latitude:52.501234,accuracy:5,timestamp:now,...extra});
const fix=(id:string,extra={})=>send(id,{type:'location_check',location:sample(extra)});
const rejected=(action:()=>unknown,code:string)=>{try{action();expect.fail('Expected rejection');}catch(error){expect(error).toBeInstanceOf(GameError);expect((error as GameError).code).toBe(code);}};
beforeEach(()=>{now=1800000000000;e=new GameEngine({now:()=>now});l=e.create(profile('host'),{randomRoles:false,preparationSeconds:0,headStartSeconds:0,spectatorsAllowed:true});e.join(l.code,profile('guest'));send('host',{type:'zone',zone:{feature:circle([13.4,52.5],1),excluded:[],confirmed:true,name:'ISOLATED PREFLIGHT'}});send('host',{type:'assign',playerId:'host',role:'hunter',team:'A'});});
it('LOBBY-GPS-01: ready and direct start require a fresh location for every active participant',()=>{
 rejected(()=>send('guest',{type:'ready',ready:true}),'GPS_REQUIRED');fix('host');send('host',{type:'ready',ready:true});rejected(()=>send('host',{type:'start'}),'GPS_REQUIRED');fix('guest');send('guest',{type:'ready',ready:true});send('host',{type:'start'});expect(l.status).toBe('active');
});
it('LOBBY-GPS-02: coordinates never enter lobby state, public views, pins or persisted checkpoints',()=>{
 fix('guest');expect(e.view(l.id,'host').players.find(p=>p.id==='guest')?.locationReady).toBe(true);
 for(const value of [e.view(l.id,'guest'),e.view(l.id,'host'),e.snapshot()]){const text=JSON.stringify(value);expect(text).not.toContain('13.401234');expect(text).not.toContain('52.501234');}
 expect(e.view(l.id,'host').pins).toEqual([]);expect(e.view(l.id,'guest').self.location).toBeUndefined();
});
it.each([{accuracy:500},{timestamp:1800000000000-30001},{timestamp:1800000000000+5002}])('LOBBY-GPS-03: unreliable preflight %j revokes readiness durably',bad=>{
 fix('guest');send('guest',{type:'ready',ready:true});now++;rejected(()=>fix('guest',bad),'GPS_REQUIRED');e.restore(e.snapshot());expect(e.view(l.id,'guest').self).toMatchObject({ready:false,locationReady:false});
});
it('LOBBY-GPS-04: expired GPS cannot start, replay cannot renew it, tick resets ready',()=>{
 for(const id of ['host','guest']){fix(id);send(id,{type:'ready',ready:true});}
 now+=20000;rejected(()=>fix('guest',{timestamp:now-20000}),'STALE_LOCATION');now+=10001;
 rejected(()=>send('host',{type:'start'}),'GPS_REQUIRED');e.tick();expect(e.view(l.id,'guest').self).toMatchObject({ready:false,locationReady:false});
});
it('LOBBY-GPS-05: revocation and disconnect clear readiness; reconnect alone cannot restore permission',()=>{
 fix('guest');send('guest',{type:'ready',ready:true});send('guest',{type:'stop_location'});expect(e.view(l.id,'guest').self).toMatchObject({ready:false,locationReady:false});now++;fix('guest');send('guest',{type:'ready',ready:true});e.setConnected('guest',false);e.setConnected('guest',true);expect(e.view(l.id,'guest').self).toMatchObject({ready:false,locationReady:false});rejected(()=>send('guest',{type:'ready',ready:true}),'GPS_REQUIRED');
});
it('LOBBY-GPS-06: spectators do not need GPS, cannot submit fixes, becoming active removes exemption',()=>{
 e.join(l.code,profile('viewer'));send('host',{type:'assign',playerId:'viewer',role:'spectator',team:'A'});rejected(()=>fix('viewer'),'LOCATION_DISABLED');for(const id of ['host','guest']){fix(id);send(id,{type:'ready',ready:true});}
 send('host',{type:'assign',playerId:'viewer',role:'hider',team:'A'});rejected(()=>send('host',{type:'start'}),'GPS_REQUIRED');send('host',{type:'assign',playerId:'viewer',role:'spectator',team:'A'});send('host',{type:'start'});expect(l.status).toBe('active');
});
it('LOBBY-GPS-07: forged fields and outsiders cannot grant another player readiness',()=>{
 rejected(()=>send('guest',{type:'location_check',location:sample(),playerId:'host'} as unknown as Command),'INVALID_INPUT');rejected(()=>send('stranger',{type:'location_check',location:sample()}),'FORBIDDEN');fix('guest');expect(e.view(l.id,'host').self.locationReady).toBe(false);
});
it('LOBBY-GPS-08: preflight is unavailable after start and existing active matches survive recovery',()=>{
 for(const id of ['host','guest']){fix(id);send(id,{type:'ready',ready:true});}send('host',{type:'start'});const end=l.endsAt;
 rejected(()=>fix('guest'),'MATCH_STARTED');now+=31000;e.restore(e.snapshot());e.tick();expect(e.view(l.id,'guest').status).toBe('active');expect(e.view(l.id,'guest').endsAt).toBe(end);
});
