/** Explicit automated tests with simulated GPS. Never used by the production runtime. */
import { beforeEach, describe, expect, it } from 'vitest';
import { area, booleanWithin, circle, polygon } from '@turf/turf';
import { GameEngine, GameError } from '../server/engine.js';
import { DEFAULT_SETTINGS, type Command, type Lobby, type Profile, type Settings, type Zone } from '../shared/types.js';
import { validateZone, validateSettings } from '../server/validation.js';

let now:number,engine:GameEngine;
const profile=(n:number):Profile=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,username:`TestPlayer${n}`,avatar_url:null,friend_code:`TST${n}`,show_online:false});
const zone=():Zone=>({name:'Automatisiertes Testgebiet',confirmed:true,feature:circle([13.4,52.5],1,{units:'kilometers',steps:64}),excluded:[]});
const id=(n:number)=>profile(n).id;
const send=(l:Lobby,n:number,c:Command)=>engine.command(l.id,id(n),c);
function setup(settings:Partial<Settings>={},count=3,start=true){
 const l=engine.create(profile(1),{...DEFAULT_SETTINGS,captureMethod:'confirmation',preparationSeconds:0,headStartSeconds:0,randomRoles:false,pinIntervalSeconds:10,outsideGraceSeconds:15,...settings});
 for(let i=2;i<=count;i++)engine.join(l.code,profile(i));
 send(l,1,{type:'zone',zone:zone()});send(l,1,{type:'assign',playerId:id(1),role:'hunter',team:'A'});
 for(let i=1;i<=count;i++)send(l,i,{type:'ready',ready:true});
 if(start)send(l,1,{type:'start'});return l;
}
const gps=(l:Lobby,n:number,longitude=13.4,latitude=52.5,accuracy=5)=>send(l,n,{type:'location',location:{longitude,latitude,accuracy,timestamp:now}});
const capture=(l:Lobby,hunter:number,target:number)=>{send(l,hunter,{type:'capture',targetId:id(target)});const request=l.captures.find(c=>c.targetId===id(target))!;send(l,target,{type:'confirm_capture',captureId:request.id,accept:true});};
const codeError=(fn:()=>unknown,code:string)=>{try{fn();throw Error('Expected rejection');}catch(e){expect(e).toBeInstanceOf(GameError);expect((e as GameError).code).toBe(code);}};
beforeEach(()=>{now=1_800_000_000_000;engine=new GameEngine({now:()=>now});});

describe('private lobby and settings permissions',()=>{
 it('creates secure six-character codes and unique lobbies',()=>{const a=engine.create(profile(1)),b=engine.create(profile(2));expect(a.code).toMatch(/^[A-Z2-9]{6}$/);expect(a.code).not.toBe(b.code);expect(a.id).not.toBe(b.id);});
 it('rejects outsider views and commands',()=>{const l=setup();codeError(()=>engine.view(l.id,id(99)),'FORBIDDEN');codeError(()=>send(l,99,{type:'stop_location'}),'FORBIDDEN');});
 it('allows only host to change settings, zone, roles, and host',()=>{const l=setup({},3,false);for(const command of [{type:'settings',settings:l.settings},{type:'zone',zone:zone()},{type:'assign',playerId:id(2),role:'hunter',team:'A'},{type:'transfer',playerId:id(2)}] as Command[])codeError(()=>send(l,2,command),'HOST_ONLY');});
 it('requires ready players and a confirmed safe zone',()=>{const l=engine.create(profile(1));engine.join(l.code,profile(2));codeError(()=>send(l,1,{type:'start'}),'NOT_READY');send(l,1,{type:'ready',ready:true});send(l,2,{type:'ready',ready:true});codeError(()=>send(l,1,{type:'start'}),'ZONE_REQUIRED');});
 it('clears ready states when rules change',()=>{const l=setup({},3,false);send(l,1,{type:'settings',settings:{...l.settings,durationSeconds:600}});expect(l.players.every(p=>!p.ready)).toBe(true);});
 it('prevents multiple simultaneous memberships',()=>{const l=setup();codeError(()=>engine.create(profile(2)),'ALREADY_IN_LOBBY');const b=engine.create(profile(9));codeError(()=>engine.join(b.code,profile(2)),'ALREADY_IN_LOBBY');expect(engine.join(l.code,profile(2)).players).toHaveLength(3);});
 it('enforces player limits and post-start joining',()=>{const l=setup({maxPlayers:3});codeError(()=>engine.join(l.code,profile(4)),'LOBBY_FULL');const b=engine.create(profile(9));engine.join(b.code,profile(10));send(b,9,{type:'zone',zone:zone()});send(b,9,{type:'ready',ready:true});send(b,10,{type:'ready',ready:true});send(b,9,{type:'start'});codeError(()=>engine.join(b.code,profile(11)),'MATCH_STARTED');});
 it('rejects invalid settings, replay-shaped input, and unsafe polygons',()=>{expect(()=>validateSettings({...DEFAULT_SETTINGS,captureMethod:'confirmation',pinIntervalSeconds:0})).toThrow();expect(()=>validateSettings({...DEFAULT_SETTINGS,captureMethod:'confirmation',phases:[{afterSeconds:0,scale:1},{afterSeconds:10,scale:1}]})).toThrow();expect(()=>validateZone({...zone(),feature:polygon([[[13,52],[13.01,52.01],[13,52.01],[13.01,52],[13,52]]])})).toThrow();const l=setup();codeError(()=>send(l,1,{type:'pause',hostId:id(2)} as unknown as Command),'INVALID_INPUT');});
 it('permits connected host transfer and closes on last departure',()=>{const l=setup({},3,false);send(l,1,{type:'transfer',playerId:id(2)});expect(l.hostId).toBe(id(2));send(l,1,{type:'leave'});send(l,3,{type:'leave'});send(l,2,{type:'leave'});expect(l.status).toBe('closed');});
 it('lets a player leave an active match and create another without leaking their GPS',()=>{const l=setup();gps(l,2);send(l,2,{type:'leave'});expect(engine.lobbyFor(id(2))).toBeUndefined();expect(l.players.find(p=>p.id===id(2))?.location).toBeUndefined();codeError(()=>engine.view(l.id,id(2)),'FORBIDDEN');expect(engine.create(profile(2)).hostId).toBe(id(2));});
});

describe('server-owned roles, timers and capture authorization',()=>{
 it('assigns exact random hunter count and leaves hiders',()=>{const l=setup({randomRoles:true,hunterCount:2},6);expect(l.players.filter(p=>p.role==='hunter')).toHaveLength(2);expect(l.players.filter(p=>p.role==='hider')).toHaveLength(4);});
 it('enforces preparation and hider head start',()=>{const l=setup({preparationSeconds:10,headStartSeconds:20});expect(l.status).toBe('preparing');codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'NOT_ACTIVE');now+=10_000;engine.tick();expect(l.status).toBe('active');codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'HEAD_START');now+=20_000;send(l,1,{type:'capture',targetId:id(2)});expect(l.captures).toHaveLength(1);});
 it('requires target confirmation and prevents duplicate captures',()=>{const l=setup();send(l,1,{type:'capture',targetId:id(2)});expect(l.players[1].eliminated).toBe(false);codeError(()=>send(l,3,{type:'confirm_capture',captureId:l.captures[0].id,accept:true}),'FORBIDDEN');codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'CAPTURE_PENDING');send(l,2,{type:'confirm_capture',captureId:l.captures[0].id,accept:true});expect(l.players[1].eliminated).toBe(true);codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'INVALID_TARGET');});
 it('supports explicit rejection and expiration of capture requests',()=>{const l=setup();send(l,1,{type:'capture',targetId:id(2)});send(l,2,{type:'confirm_capture',captureId:l.captures[0].id,accept:false});expect(l.players[1].eliminated).toBe(false);expect(l.captures).toHaveLength(0);send(l,1,{type:'capture',targetId:id(2)});const request=l.captures[0].id;now+=31_000;engine.tick();codeError(()=>send(l,2,{type:'confirm_capture',captureId:request,accept:true}),'CAPTURE_NOT_FOUND');});
 it('restricts captures to active hunters and enemy hiders',()=>{const l=setup();codeError(()=>send(l,2,{type:'capture',targetId:id(3)}),'INVALID_ROLE');codeError(()=>send(l,1,{type:'capture',targetId:id(1)}),'INVALID_TARGET');});
 it('validates target-only secret codes and rate-limits guessing',()=>{const l=setup({captureMethod:'code'});expect(engine.view(l.id,id(1)).players[1]).not.toHaveProperty('captureCode');const target=engine.view(l.id,id(2)).self;expect(target.captureCode).toMatch(/^\d{6}$/);const wrong=target.captureCode==='000000'?'111111':'000000';for(let i=0;i<6;i++)codeError(()=>send(l,1,{type:'capture',targetId:id(2),code:wrong}),'INVALID_CAPTURE_CODE');codeError(()=>send(l,1,{type:'capture',targetId:id(2),code:target.captureCode}),'RATE_LIMIT');now+=60_001;send(l,1,{type:'capture',targetId:id(2),code:target.captureCode});expect(l.players[1].eliminated).toBe(true);});
 it('requires reliable recent GPS and uncertainty-aware distance for proximity captures',()=>{const l=setup({captureMethod:'proximity',captureRadiusMeters:30});codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'GPS_REQUIRED');gps(l,1,13.4,52.5,20);gps(l,2,13.4,52.5,20);codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'TOO_FAR');now+=1000;gps(l,1,13.4,52.5,5);gps(l,2,13.4,52.5,5);send(l,1,{type:'capture',targetId:id(2)});expect(l.players[1].eliminated).toBe(true);});
 it('ends normal matches on the last capture and purges GPS',()=>{const l=setup();gps(l,2);capture(l,1,2);capture(l,1,3);expect(l.status).toBe('finished');expect(l.result?.winner).toBe('hunters');expect(l.players.every(p=>!p.location&&!p.captureCode)).toBe(true);expect(l.pins).toEqual([]);});
 it('awards hider survival at the authoritative time limit',()=>{const l=setup({durationSeconds:60});now+=59_999;engine.tick();expect(l.status).toBe('active');now++;engine.tick();expect(l.result?.winner).toBe('hiders');});
});

describe('GPS privacy, validation and pins',()=>{
 it('never exposes private live locations, codes, deadlines, or engine state to another player',()=>{const l=setup({headStartSeconds:10});gps(l,2);const hunter=engine.view(l.id,id(1));expect(hunter.players[1]).not.toHaveProperty('location');expect(hunter.players[1]).not.toHaveProperty('captureCode');expect(hunter.players[1]).not.toHaveProperty('outsideSince');expect(hunter).not.toHaveProperty('_engine');expect(hunter.pins).toEqual([]);expect(engine.view(l.id,id(2)).self.location).toBeDefined();});
 it('publishes on interval, expires pins, and hides them from other hiders',()=>{const l=setup({pinLifetimeSeconds:20,headStartSeconds:10,fallbackPins:false});gps(l,2);expect(l.pins).toHaveLength(0);now+=10_000;gps(l,2);expect(engine.view(l.id,id(1)).pins).toHaveLength(1);expect(engine.view(l.id,id(3)).pins).toHaveLength(0);now+=21_000;engine.tick();expect(engine.view(l.id,id(1)).pins).toHaveLength(0);});
 it('discards prior pins when old pins are disabled',()=>{const l=setup({showOldPins:false});now+=10_000;gps(l,2);now+=10_000;gps(l,2);expect(l.pins).toHaveLength(1);});
 it('rejects stale, repeated, inaccurate and implausibly jumping locations',()=>{const l=setup();gps(l,2);codeError(()=>gps(l,2),'REPLAYED_LOCATION');now+=1000;codeError(()=>gps(l,2,13.6),'GPS_JUMP');codeError(()=>gps(l,2,13.4,52.5,500),'GPS_UNCERTAIN');codeError(()=>send(l,2,{type:'location',location:{longitude:13.4,latitude:52.5,accuracy:5,timestamp:now-31_000}}),'STALE_LOCATION');expect(l.players[1].location?.longitude).toBe(13.4);});
 it('never sends hidden coordinates to spectators or eliminated players',()=>{const l=setup({spectatorsAllowed:true});engine.join(l.code,profile(4));now+=10_000;gps(l,2);expect(engine.view(l.id,id(4)).self.role).toBe('spectator');expect(engine.view(l.id,id(4)).pins).toHaveLength(0);capture(l,1,3);expect(engine.view(l.id,id(3)).pins).toHaveLength(0);});
 it('warns overdue GPS without eliminating a player',()=>{const l=setup({gpsToleranceSeconds:10});now+=21_000;engine.tick();expect(l.events.some(e=>e.type==='gps_due')).toBe(true);expect(l.players[1].eliminated).toBe(false);});
});

describe('zombie and extended modes',()=>{
 it('registers zombie infection before swipe, delays new captures and then permits them',()=>{const l=setup({mode:'zombie',infectionDelaySeconds:10},4);capture(l,1,2);expect(l.players[1].role).toBe('zombie');expect(l.players[1].infectedAt).toBe(now);send(l,2,{type:'infection_ack'});codeError(()=>send(l,2,{type:'capture',targetId:id(3)}),'INFECTION_DELAY');now+=10_000;capture(l,2,3);expect(l.players[2].role).toBe('zombie');capture(l,1,4);expect(l.result?.winner).toBe('infected');});
 it('supports optional host-authorized healing without uninfected fake acknowledgments',()=>{const l=setup({mode:'zombie',allowHealing:true},4);codeError(()=>send(l,2,{type:'infection_ack'}),'NOT_INFECTED');capture(l,1,2);codeError(()=>send(l,3,{type:'heal',playerId:id(2)}),'HOST_ONLY');send(l,1,{type:'heal',playerId:id(2)});expect(l.players[1].role).toBe('hider');expect(l.players[1].infectedAt).toBeUndefined();});
 it('sets faster interval and infection delay for Infection Rush',()=>{const l=setup({mode:'infection_rush',pinIntervalSeconds:300,infectionDelaySeconds:60},4);expect(l.settings.pinIntervalSeconds).toBe(60);expect(l.settings.infectionDelaySeconds).toBe(5);capture(l,1,2);expect(l.players[1].role).toBe('zombie');});
 it('limits Hide & Seek sightings to configured windows',()=>{const l=setup({mode:'hide_seek',pinVisibilitySeconds:5});now+=10_000;gps(l,2);expect(engine.view(l.id,id(1)).pins).toHaveLength(1);now+=5001;expect(engine.view(l.id,id(1)).pins).toHaveLength(0);});
 it('awards Last Survivor to the remaining individual',()=>{const l=setup({mode:'last_survivor'});capture(l,1,2);expect(l.result?.winner).toBe(id(3));});
 it('implements true opposing-team capture restrictions and winner',()=>{const l=setup({mode:'team_hunt',hunterCount:2},4,false);send(l,1,{type:'assign',playerId:id(2),role:'hunter',team:'B'});send(l,1,{type:'assign',playerId:id(3),role:'hider',team:'A'});send(l,1,{type:'assign',playerId:id(4),role:'hider',team:'B'});for(let n=1;n<=4;n++)send(l,n,{type:'ready',ready:true});send(l,1,{type:'start'});codeError(()=>send(l,1,{type:'capture',targetId:id(3)}),'SAME_TEAM');capture(l,1,4);expect(l.result?.winner).toBe('team_A');});
 it('randomizes balanced Team Hunt roles with one hider and hunter per team',()=>{const l=setup({mode:'team_hunt',hunterCount:2,randomRoles:true},6);for(const team of ['A','B']){expect(l.players.filter(p=>p.team===team)).toHaveLength(3);expect(l.players.some(p=>p.team===team&&p.role==='hider')).toBe(true);expect(l.players.some(p=>p.team===team&&p.role==='hunter')).toBe(true);}});
 it('combines custom infection rules',()=>{const l=setup({mode:'custom',winCondition:'infection'});capture(l,1,2);expect(l.players[1].role).toBe('zombie');capture(l,1,3);expect(l.result?.winner).toBe('infected');});
});

describe('zone safety and apocalypse',()=>{
 it('requires a current outside sample to eliminate and never a blind timer',()=>{const l=setup({outsideGraceSeconds:60});gps(l,2,13.425);now+=60_000;engine.tick();expect(l.players[1].eliminated).toBe(false);expect(l.players[1].outsideActive).toBe(true);expect(l.players[1].outsideElapsed).toBe(15000);gps(l,2,13.425);for(let n=0;n<4;n++){now+=10000;gps(l,2,13.425);}expect(l.players[1].eliminated).toBe(false);now+=5000;gps(l,2,13.425);expect(l.players[1].eliminated).toBe(true);});
 it('does not penalize uncertain boundary readings',()=>{const l=setup();const edge=l.zone!.feature.geometry.coordinates[0][0];gps(l,2,edge[0],edge[1],20);now+=60_000;engine.tick();expect(l.players[1].eliminated).toBe(false);expect(l.players[1].outsideSince).toBeUndefined();});
 it('invalidates outside evidence when GPS becomes unreliable',()=>{const l=setup();gps(l,2,13.425);now+=10_000;gps(l,2,13.425);now+=1000;codeError(()=>gps(l,2,13.425,52.5,500),'GPS_UNCERTAIN');now+=10_000;gps(l,2,13.425);expect(l.players[1].eliminated).toBe(false);});
 it('resets outside time after safe reentry by default',()=>{const l=setup();gps(l,2,13.425);now+=10_000;gps(l,2,13.425);now+=100_000;gps(l,2);now+=2000;gps(l,2);expect(l.players[1].outsideSince).toBeUndefined();expect(l.players[1].outsideElapsed).toBe(0);});
 it('preserves confirmed outside time across safe reentry when reset is disabled',()=>{const l=setup({outsideReset:false,outsideGraceSeconds:60});gps(l,2,13.425);now+=10000;gps(l,2,13.425);now+=100000;gps(l,2);now+=2000;gps(l,2);expect(l.players[1].outsideElapsed).toBe(25000);expect(l.players[1].outsideActive).toBe(false);now+=100000;gps(l,2,13.425);now+=10000;gps(l,2,13.425);expect(l.players[1].outsideElapsed).toBe(35000);expect(l.players[1].eliminated).toBe(false);});
 it('recognizes excluded unsafe areas',()=>{const l=setup({},3,false);const z=zone();z.excluded=[circle([13.4,52.5],.1,{units:'kilometers'})];send(l,1,{type:'zone',zone:z});for(let n=1;n<=3;n++)send(l,n,{type:'ready',ready:true});send(l,1,{type:'start'});gps(l,2);expect(l.players[1].outsideSince).toBe(now);});
 it('shrinks apocalypse zones on schedule and keeps the result inside the safe original',()=>{const l=setup({mode:'apocalypse',phases:[{afterSeconds:0,scale:1},{afterSeconds:10,scale:.5}]});const initial=area(l.activeZone!);now+=10_000;engine.tick();expect(area(l.activeZone!)).toBeLessThan(initial*.3);expect(booleanWithin(l.activeZone!,l.zone!.feature)).toBe(true);expect(l.events.some(e=>e.type==='zone_shrunk')).toBe(true);});
 it('clips concave shrinking zones to the safe original instead of extending beyond it',()=>{const l=setup({mode:'apocalypse',phases:[{afterSeconds:0,scale:1},{afterSeconds:10,scale:.5}]},3,false);const concave=polygon([[[13.39,52.49],[13.41,52.49],[13.41,52.50],[13.40,52.50],[13.40,52.51],[13.39,52.51],[13.39,52.49]]]);send(l,1,{type:'zone',zone:{...zone(),feature:concave}});for(let n=1;n<=3;n++)send(l,n,{type:'ready',ready:true});send(l,1,{type:'start'});now+=10_000;engine.tick();expect(booleanWithin(l.activeZone!,concave)).toBe(true);});
});

describe('pause, disconnect, reconnect and restore',()=>{
 it('LOBBY-09 host pause survives restoration and shifts deadlines exactly once',()=>{const l=setup(),end=l.endsAt!;codeError(()=>send(l,2,{type:'pause'}),'HOST_ONLY');send(l,1,{type:'pause'});now+=10000;engine.restore(engine.snapshot());expect(engine.lobbies.get(l.id)?.status).toBe('paused');send(engine.lobbies.get(l.id)!,1,{type:'resume'});expect(engine.lobbies.get(l.id)?.endsAt).toBe(end+10000);});
 it('resumes legacy paused checkpoints once without losing time, players or roles',()=>{const l=setup();gps(l,2);l.status='paused';l.previousStatus='active';l.pausedAt=now;const original=engine.snapshot()[0];original.settings.disconnectBehavior='pause' as Settings['disconnectBehavior'];original.players[1].connected=false;const end=l.endsAt!,pinAt=l.players[1].nextPinAt!;now+=100000;engine.restore([original]);const resumed=engine.lobbies.get(l.id)!;expect(resumed.status).toBe('active');expect(resumed.id).toBe(l.id);expect(resumed.endsAt).toBe(end+100000);expect(resumed.players[1].nextPinAt).toBe(pinAt+100000);expect(resumed.players.map(p=>[p.id,p.role,p.eliminated])).toEqual(original.players.map(p=>[p.id,p.role,p.eliminated]));expect(resumed.players[1].connected).toBe(false);expect(resumed.settings.disconnectBehavior).toBe('continue');expect(resumed.result).toBeUndefined();expect(engine.view(l.id,id(1)).visibleLocations).toEqual([]);const snapshot=engine.snapshot();now+=1000;engine.restore(snapshot);expect(engine.snapshot()).toEqual(snapshot);engine.tick();expect(engine.lobbies.get(l.id)?.status).toBe('active');});
 it('preserves preparation, head start and infection delays across legacy recovery',()=>{const l=setup({preparationSeconds:30,headStartSeconds:60});l.status='paused';l.previousStatus='preparing';l.pausedAt=now;l.players[2].infectedAt=now;const saved=engine.snapshot();now+=90000;engine.restore(saved);const restored=engine.lobbies.get(l.id)!;expect(restored.status).toBe('preparing');expect(restored.startedAt!-now).toBe(30000);expect(restored.players[2].infectedAt).toBe(now);expect((restored as any)._engine.hunterReleaseAt-now).toBe(90000);});
 it('continues after disconnect grace without eliminating or resetting time',()=>{const l=setup({disconnectGraceSeconds:15}),end=l.endsAt;engine.setConnected(id(2),false);now+=15000;engine.tick();expect(l.status).toBe('active');expect(l.players[1].eliminated).toBe(false);expect(l.endsAt).toBe(end);engine.setConnected(id(2),true);expect(l.status).toBe('active');});
 it('applies configured disconnect elimination',()=>{const l=setup({disconnectGraceSeconds:15,disconnectBehavior:'eliminate'});engine.setConnected(id(2),false);now+=15_000;engine.tick();expect(l.players[1].eliminated).toBe(true);expect(l.status).toBe('active');});
 it('restores private checkpoint state while preserving filtered views and codes',()=>{const l=setup({captureMethod:'code'});gps(l,2);const saved=engine.snapshot();const code=engine.view(l.id,id(2)).self.captureCode;const restored=new GameEngine({now:()=>now,initial:saved});expect(restored.view(l.id,id(2)).self.captureCode).toBe(code);expect(restored.view(l.id,id(1)).players[1]).not.toHaveProperty('location');expect(restored.lobbyFor(id(2))?.id).toBe(l.id);saved[0].code='BROKEN';expect(restored.view(l.id,id(1)).code).not.toBe('BROKEN');});
 it('does not mutate snapshot through a user view',()=>{const l=setup();const view=engine.view(l.id,id(1));view.settings.hunterCount=100;view.players[1].role='hunter';expect(l.settings.hunterCount).toBe(1);expect(l.players[1].role).toBe('hider');});
});

describe('rejected-command persistence and deadline regressions',()=>{
 it('tags rejected code guesses with the mutated lobby so transaction rollback cannot erase anti-cheat evidence',()=>{
  const l=setup({captureMethod:'code'}),revision=l.revision;
  const code=engine.view(l.id,id(2)).self.captureCode==='000000'?'111111':'000000';
  try{send(l,1,{type:'capture',targetId:id(2),code});throw Error('Expected rejection');}
  catch(error){expect(error).toMatchObject({code:'INVALID_CAPTURE_CODE',stateChanged:true,lobbyId:l.id});}
  expect(l.revision).toBe(revision+1);
 });
 it('tags GPS uncertainty rejection with durable cleared boundary evidence',()=>{
  const l=setup();gps(l,2,13.425);now+=10_000;gps(l,2,13.425);now+=1000;
  try{gps(l,2,13.425,52.5,500);throw Error('Expected rejection');}
  catch(error){expect(error).toMatchObject({code:'GPS_UNCERTAIN',stateChanged:true,lobbyId:l.id});}
  expect(engine.view(l.id,id(2)).self.outsideSince).toBeUndefined();
 });
 it('prevents proximity captures using a previously good GPS sample after an unreliable reading',()=>{
  const l=setup({captureMethod:'proximity'});gps(l,1);gps(l,2);now+=1000;
  codeError(()=>gps(l,2,13.4,52.5,500),'GPS_UNCERTAIN');
  codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'GPS_REQUIRED');
  now+=1000;gps(l,2);send(l,1,{type:'capture',targetId:id(2)});expect(l.players[1].eliminated).toBe(true);
 });
 it('finishes the match before processing a capture packet at the deadline, even without a tick',()=>{
  const l=setup({durationSeconds:60,captureMethod:'code'}),code=engine.view(l.id,id(2)).self.captureCode;
  now=l.endsAt!;
  try{send(l,1,{type:'capture',targetId:id(2),code});throw Error('Expected rejection');}
  catch(error){expect(error).toMatchObject({code:'MATCH_FINISHED',stateChanged:true,lobbyId:l.id});}
  expect(l.result?.winner).toBe('hiders');expect(l.status).toBe('finished');expect(l.players[1].eliminated).toBe(false);
 });
 it('uses server receipt intervals for GPS jump detection despite manipulated timestamps',()=>{
  const l=setup();send(l,2,{type:'location',location:{longitude:13.4,latitude:52.5,accuracy:5,timestamp:now-29_000}});
  now+=1000;
  codeError(()=>send(l,2,{type:'location',location:{longitude:13.41,latitude:52.5,accuracy:5,timestamp:now+29_000}}),'GPS_JUMP');
 });
 it('requires recently received proximity samples even when client clocks run ahead',()=>{
  const l=setup({captureMethod:'proximity'});
  for(const n of [1,2])send(l,n,{type:'location',location:{longitude:13.4,latitude:52.5,accuracy:5,timestamp:now+25_000}});
  now+=16_000;codeError(()=>send(l,1,{type:'capture',targetId:id(2)}),'GPS_REQUIRED');
 });
 it('combines custom shrinking zones with infection victory rules',()=>{
  const l=setup({mode:'custom',winCondition:'infection',phases:[{afterSeconds:0,scale:1},{afterSeconds:10,scale:.5}]});
  const original=area(l.activeZone!);now+=10_000;engine.tick();expect(area(l.activeZone!)).toBeLessThan(original*.3);
  capture(l,1,2);expect(l.players[1].role).toBe('zombie');capture(l,1,3);expect(l.result?.winner).toBe('infected');
 });
});

describe('private in-memory state retention',()=>{
 it('scrubs an abandoned finished match and eventually releases its checkpoint from memory',()=>{
  const l=setup();gps(l,2);now+=24*60*60*1000+1;engine.tick();
  expect(l.status).toBe('finished');expect(l.players.every(p=>!p.location&&!p.captureCode)).toBe(true);
  now+=24*60*60*1000+1;engine.tick();expect(engine.lobbies.has(l.id)).toBe(false);
 });
});


describe('live hunters, fallback pins and stable safety countdown',()=>{
 it('publishes a first hider pin after head start, even without a new GPS callback',()=>{const l=setup({headStartSeconds:10});gps(l,2);expect(engine.view(l.id,id(1)).pins).toHaveLength(0);now+=10000;engine.tick();expect(engine.view(l.id,id(1)).pins).toHaveLength(1);});
 it('uses the old observation timestamp for a fallback pin and bounds retention',()=>{const l=setup({pinIntervalSeconds:30,fallbackPinMaxAgeSeconds:60,showOldPins:false});gps(l,2);const stamp=now;now+=30000;engine.tick();const pin=engine.view(l.id,id(1)).pins[0];expect(pin.observedAt).toBe(stamp);expect(pin.createdAt).toBe(now);expect(pin.stale).toBe(true);now+=61000;engine.tick();expect(l.pins[0].createdAt).toBe(stamp+30000);});
 it('does not publish stale fallback pins when disabled',()=>{const l=setup({pinIntervalSeconds:30,fallbackPins:false});gps(l,2);now+=31000;engine.tick();expect(l.pins).toHaveLength(1);expect(l.pins[0].createdAt).toBe(now-31000);});
 it('MAP-01 MAP-03 exposes consenting teammates and hides enemy live coordinates',()=>{const l=setup({pinIntervalSeconds:60});gps(l,1);gps(l,2);expect(engine.view(l.id,id(3)).visibleLocations?.map(p=>p.playerId)).toEqual([id(2)]);expect(engine.view(l.id,id(1)).visibleLocations).toEqual([]);now+=3000;gps(l,2,13.4001);expect(engine.view(l.id,id(3)).visibleLocations?.[0].longitude).toBe(13.4001);});
 it('honors hidden hunter rules and denies spectator live tracking outside pauses',()=>{const l=setup({hunterVisible:false,spectatorsAllowed:true});gps(l,1);engine.join(l.code,profile(4));expect(engine.view(l.id,id(2)).visibleLocations).toEqual([]);expect(engine.view(l.id,id(4)).visibleLocations).toEqual([]);});
 it('never reveals hidden live positions when restoring a legacy pause',()=>{const l=setup();gps(l,1);gps(l,2);gps(l,3);l.status='paused';l.pausedAt=now;engine.restore(engine.snapshot());expect(engine.view(l.id,id(1)).visibleLocations).toEqual([]);expect(engine.view(l.id,id(2)).visibleLocations?.map(p=>p.playerId)).toEqual([id(3)]);});
 it('does not reset the outside countdown on uncertain GPS or a single inside outlier',()=>{const l=setup({outsideGraceSeconds:60});gps(l,2,13.425);now+=10000;gps(l,2,13.425);now+=3000;codeError(()=>gps(l,2,13.425,52.5,500),'GPS_UNCERTAIN');const elapsed=l.players[1].outsideElapsed!;expect(elapsed).toBe(13000);now+=1000;gps(l,2,13.425);expect(l.players[1].outsideElapsed).toBe(elapsed);now+=3000;gps(l,2,13.425);expect(l.players[1].outsideElapsed).toBe(16000);});
 it('allows return acknowledgement only after two reliable inside fixes',()=>{const l=setup({outsideGraceSeconds:60});gps(l,2,13.425);codeError(()=>send(l,2,{type:'zone_return_ack'}),'RETURN_UNCONFIRMED');now+=100000;gps(l,2);expect(l.players[1].outsideActive).toBe(true);codeError(()=>send(l,2,{type:'zone_return_ack'}),'RETURN_UNCONFIRMED');now+=2000;gps(l,2);expect(l.players[1].returnPending).toBe(true);expect(l.players[1].outsideElapsed).toBe(0);send(l,2,{type:'zone_return_ack'});expect(l.players[1].returnPending).toBe(false);});
 it('revoking sharing removes private locations without stopping the match and prevents fallback publication',()=>{const l=setup();gps(l,2);send(l,2,{type:'stop_location'});expect(l.status).toBe('active');expect(engine.view(l.id,id(1)).visibleLocations).toEqual([]);expect(l.pins).toEqual([]);now+=11000;engine.tick();expect(l.pins).toEqual([]);});
 it('does not count a legacy pause as time outside the zone',()=>{const l=setup({outsideGraceSeconds:60});gps(l,2,13.425);now+=10000;gps(l,2,13.425);l.status='paused';l.pausedAt=now;const elapsed=l.players[1].outsideElapsed;now+=60000;engine.restore(engine.snapshot());const restored=engine.lobbies.get(l.id)!;gps(restored,2,13.425);expect(restored.players[1].outsideElapsed).toBe(elapsed);expect(restored.players[1].eliminated).toBe(false);});
 it('restores legacy settings with safe explicit visibility defaults',()=>{const l=setup();const saved=engine.snapshot();delete (saved[0].settings as any).hunterVisible;delete (saved[0].settings as any).fallbackPins;const restored=new GameEngine({initial:saved,now:()=>now});expect(restored.view(l.id,id(1)).settings.hunterVisible).toBe(true);});
});
