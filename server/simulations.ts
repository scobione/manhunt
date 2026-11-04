import {randomUUID,randomInt} from 'node:crypto';
import {bbox,booleanPointInPolygon,distance,point,pointOnFeature,destination,lineString,pointToLineDistance} from '@turf/turf';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {GameEngine} from './engine';
import {HttpError,type Identity} from './auth';
import {validateCommand,validateSettings,validateZone,locationSchema} from './validation';
import type {Lobby,LocationSample,Command,Profile} from '../shared/types';
import {DEFAULT_SETTINGS} from '../shared/types';
import {activeExclusions,rules} from '../shared/rules';
import {DEFAULT_BADGES,advanceBadges,emptyCounters,equippedBadge,type AchievementCounters,type BadgeOverview} from '../shared/achievements';
import {DEFAULT_QUESTIONS,questionsFor,validateFeedback,type FeedbackOffer} from '../shared/feedback';
import type {FeatureStore} from './feature-store';
import type {SimulationEvent,SimulationLog,SimulationView} from '../shared/simulation';
import {safeXpPosition,type PathCandidate} from './xp-paths';
export interface SimulationState {catalog?:{definitions:Awaited<ReturnType<FeatureStore['definitions']>>;feedback:Awaited<ReturnType<FeatureStore['settings']>>};lobby:Lobby;clock:number;wall:number;generation:number;positions:Record<string,LocationSample>;log:SimulationLog[];counters:Record<string,AchievementCounters>;badges:Record<string,BadgeOverview>;offers:Record<string,FeedbackOffer>;presets:{id:string;name:string;settings:unknown}[];}
export interface SimulationRecord {id:string;owner:string;revision:number;state:SimulationState;}
export interface SimulationStore {get(owner:string,id?:string):Promise<SimulationRecord|null>;create(owner:string,state:SimulationState):Promise<SimulationRecord>;save(record:SimulationRecord):Promise<boolean>;remove(owner:string,id:string):Promise<void>;}
export class SupabaseSimulationStore implements SimulationStore{
 constructor(private db:SupabaseClient){}
 private check(error:unknown){if(error)throw new HttpError(503,'Die Simulation konnte nicht gespeichert werden.');}
 async get(owner:string,id?:string){const expired=await this.db.from('admin_simulations').delete().lte('expires_at',new Date().toISOString());this.check(expired.error);let q=this.db.from('admin_simulations').select('id,owner:owner_id,revision,state').eq('owner_id',owner).gt('expires_at',new Date().toISOString());if(id)q=q.eq('id',id);const r=await q.order('updated_at',{ascending:false}).limit(1).maybeSingle();this.check(r.error);return r.data as SimulationRecord|null;}
 async create(owner:string,state:SimulationState){const r=await this.db.from('admin_simulations').insert({id:randomUUID(),owner_id:owner,state}).select('id,owner:owner_id,revision,state').single();if(r.error?.code==='23505'){const existing=await this.get(owner);if(existing)return existing;}this.check(r.error);return r.data as SimulationRecord;}
 async save(record:SimulationRecord){const r=await this.db.from('admin_simulations').update({state:record.state,revision:record.revision+1,updated_at:new Date().toISOString()}).eq('id',record.id).eq('owner_id',record.owner).eq('revision',record.revision).gt('expires_at',new Date().toISOString()).select('id');this.check(r.error);return !!r.data?.length;}
 async remove(owner:string,id:string){const r=await this.db.from('admin_simulations').delete().eq('id',id).eq('owner_id',owner);this.check(r.error);}
}
const uuid=z.string().uuid(),eventSchema=z.enum(['outside','inside','move','pin','capture','revive','heal','advance','next_phase','timeout','xp_collect','feedback','badge','disconnect','reconnect']);
function fresh(clock:number,generation=1):SimulationState{const engine=new GameEngine({now:()=>clock}),profile:Profile={id:randomUUID(),username:'Testspieler_01',avatar_url:null,friend_code:'SIMULATION',show_online:false};const lobby=engine.create(profile,{...DEFAULT_SETTINGS,maxPlayers:12});return{lobby:engine.snapshot()[0],clock,wall:Date.now(),generation,positions:{},log:[],counters:{},badges:{},offers:{},presets:[]};}
function spot(lobby:Lobby,active=true):LocationSample{const zone=active?lobby.activeZone??lobby.zone?.feature:lobby.zone?.feature;if(!zone||!lobby.zone)throw new HttpError(400,'Lege zuerst die Spielzone fest.');const bounds=bbox(zone);for(let i=0;i<1500;i++){const longitude=bounds[0]+randomInt(1_000_000)/1_000_000*(bounds[2]-bounds[0]),latitude=bounds[1]+randomInt(1_000_000)/1_000_000*(bounds[3]-bounds[1]);if(booleanPointInPolygon([longitude,latitude],zone)&&!activeExclusions(lobby.zone).some(p=>booleanPointInPolygon([longitude,latitude],p))&&![zone,...activeExclusions(lobby.zone)].some(poly=>poly.geometry.coordinates.some(ring=>pointToLineDistance([longitude,latitude],lineString(ring),{units:'meters'})<=9)))return{longitude,latitude,accuracy:3,timestamp:1};}throw new HttpError(400,'Keine freie Testposition gefunden. Vergrößere die Zone oder ändere Sperrzonen.');}
function overview(s:SimulationState,id:string):BadgeOverview{return s.badges[id]??={registered:true,badges:advanceBadges(s.catalog?.definitions??DEFAULT_BADGES,s.counters[id]??emptyCounters(),[],s.clock),selected:null,notices:[]};}
function award(s:SimulationState,id:string,metric:keyof AchievementCounters,amount=1){const old=overview(s,id);const counters=s.counters[id]??=emptyCounters();counters[metric]+=amount;const badges=advanceBadges(s.catalog?.definitions??DEFAULT_BADGES,counters,old.badges,s.clock);s.badges[id]={...old,badges,selected:old.selected?equippedBadge(badges.find(b=>b.id===old.selected!.id)!):null,notices:[...old.notices,...badges.filter(b=>b.level>(old.badges.find(o=>o.id===b.id)?.level??0)).map(b=>({id:randomUUID(),badgeId:b.id,name:b.name,level:b.level,at:new Date(s.clock).toISOString()}))]};}
function offer(s:SimulationState,id:string){if(!s.offers[id])s.offers[id]={id:randomUUID(),matchId:s.lobby.id,version:`simulation-${s.catalog?.feedback.version??'1'}`,questions:questionsFor(s.lobby.settings,s.catalog?.feedback.questions??DEFAULT_QUESTIONS),status:'offered',offeredAt:new Date(s.clock).toISOString(),modes:[s.lobby.settings.mode]};return s.offers[id];}
/** No Repository, push service or real achievement store is reachable here.
 * All actors are virtual UUIDs, all commands use the production game engine. */
export class SimulationService{
 constructor(private store:SimulationStore,private now=Date.now,private catalog?:Pick<FeatureStore,'definitions'|'settings'>){}
 private async fresh(generation=1){const state=fresh(this.now(),generation);if(this.catalog){const [definitions,feedback]=await Promise.all([this.catalog.definitions(),this.catalog.settings()]);state.catalog={definitions,feedback};}return state;}
 private view(r:SimulationRecord,player?:string):SimulationView{const s=r.state,e=new GameEngine({initial:[s.lobby],now:()=>s.clock}),id=player??s.lobby.hostId,roster=s.lobby.players.filter(p=>!(s.lobby as Lobby&{_engine:{leftIds:string[]}})._engine.leftIds.includes(p.id));if(!roster.some(p=>p.id===id))throw new HttpError(404,'Testspieler nicht gefunden.');return{id:r.id,revision:r.revision,generation:s.generation,view:e.view(s.lobby.id,id),roster,events:this.events(s,id),available:Object.fromEntries(roster.map(p=>[p.id,this.events(s,p.id)])),log:s.log,position:s.positions[id]??null,badges:overview(s,id),simulation:true};}
 private events(s:SimulationState,id:string):SimulationEvent[]{const l=s.lobby,p=l.players.find(p=>p.id===id)!;if(l.status==='finished')return['feedback','badge'];const result:SimulationEvent[]=['badge'];if(['preparing','active','paused'].includes(l.status))result.push('advance','disconnect','reconnect');if(l.status==='active'){result.push('timeout');if(rules(l.settings).apocalypse)result.push('next_phase');if(!p.eliminated&&p.role!=='spectator'){result.push('outside','inside','move','pin');if(p.role==='hider'){result.push('capture');if(rules(l.settings).xpHunt)result.push('xp_collect');}if(p.infectionPending)result.push('revive');if(p.role==='zombie'&&l.settings.allowHealing)result.push('heal');}}return result;}
 async handle(identity:Identity,path:string,method:string,body:unknown,query:URLSearchParams){
  const parts=path.match(/^\/admin\/simulations(?:\/([^/]+)(?:\/(command|events|reset|features))?)?$/);if(!parts)throw new HttpError(404,'Simulation nicht gefunden.');const id=parts[1]?uuid.parse(parts[1]):undefined,action=parts[2];
  if(!id&&method==='POST'){z.object({}).strict().parse(body);const existing=await this.store.get(identity.id);return this.view(existing??await this.store.create(identity.id,await this.fresh()));}
  const record=await this.store.get(identity.id,id);if(!record){if(!id&&method==='GET')return{simulation:null};throw new HttpError(404,'Die Simulation ist abgelaufen oder nicht verfügbar.');}
  if(method==='DELETE'&&id&&!action){await this.store.remove(identity.id,id);return{ok:true};}
  if(!id&&method==='GET')return{simulation:this.view(record)};
  let s=record.state,clock=s.clock;const engine=new GameEngine({initial:[s.lobby],now:()=>clock});let lobby=engine.lobbies.get(s.lobby.id)!;
  const sync=()=>{s.clock=clock;s.lobby=engine.snapshot()[0];lobby=engine.lobbies.get(lobby.id)!;if(lobby.status==='finished'&&lobby.result?.winner!=='aborted')for(const p of lobby.players)offer(s,p.id);};
  const locate=(pid:string,publish=false,force=false)=>{const p=lobby.players.find(p=>p.id===pid)!;if(p.eliminated||p.role==='spectator'||!p.connected||p.locationSharing===false&&!force||!s.positions[pid])return;const pos={...s.positions[pid],timestamp:clock};s.positions[pid]=pos;engine.command(lobby.id,pid,{type:lobby.status==='waiting'?'location_check':'location',location:pos,...(lobby.status!=='waiting'?{publish}:{})} as Command);};
  const advance=(milliseconds:number,skip?:string)=>{const end=clock+milliseconds;let steps=0;while(clock<end&&steps++<1500){clock=Math.min(end,clock+10_000);engine.tick();if(['active','preparing'].includes(lobby.status))for(const p of lobby.players)if(p.id!==skip)locate(p.id);}if(clock<end){clock=end;engine.tick();}sync();};
  const move=(pid:string,pos:LocationSample)=>{const old=s.positions[pid];if(old){const meters=distance([old.longitude,old.latitude],[pos.longitude,pos.latitude],{units:'meters'});if(meters>50)advance(Math.min(61_000,Math.ceil(meters/12)*1000+2000),pid);}clock+=10;s.positions[pid]={...pos,timestamp:clock};locate(pid,false,true);clock+=2000;locate(pid,false,true);sync();};
  advance(Math.min(60_000,Math.max(0,this.now()-s.wall)));s.wall=this.now();
  let player=query.get('player')??lobby.hostId;let result:unknown;
  if(method==='POST'){
   const input=z.object({generation:z.number().int().positive(),playerId:uuid.optional(),command:z.unknown().optional(),events:z.array(z.object({type:eventSchema,targets:z.array(uuid).min(1).max(40).optional(),seconds:z.number().int().min(1).max(14400).optional(),location:locationSchema.optional()}).strict()).min(1).max(10).optional(),path:z.string().max(200).optional(),method:z.enum(['GET','POST','PATCH']).optional(),body:z.unknown().optional(),players:z.number().int().min(2).max(40).optional()}).strict().parse(body);
   if(input.generation!==s.generation)throw new HttpError(409,'Die Simulation wurde zurückgesetzt. Lade den neuen Zustand.');player=input.playerId??player;if(!lobby.players.some(p=>p.id===player))throw new HttpError(404,'Testspieler nicht gefunden.');
   if(action==='reset'){const reset=await this.fresh(s.generation+1);reset.lobby.settings=structuredClone(lobby.settings);reset.lobby.zone=structuredClone(lobby.zone);record.state=reset;record.revision++;if(!await this.store.save({...record,revision:record.revision-1}))throw new HttpError(409,'Simulation wurde gleichzeitig geändert.');return this.view(record);}
   if(action==='command'){
    const cmd=validateCommand(input.command);
    const remaining=lobby.players.filter(p=>p.id!==player&&!(lobby as Lobby&{_engine:{leftIds:string[]}})._engine.leftIds.includes(p.id));
    if(cmd.type==='leave'&&!remaining.length)throw new HttpError(400,'Beende die Simulation über „Simulation beenden“.');
    if(cmd.type==='zone')validateZone(cmd.zone);if(cmd.type==='settings')validateSettings(cmd.settings);
    if(cmd.type==='start'){
     if(player!==lobby.hostId)throw new HttpError(403,'Nur der Test-Host startet.');if(!lobby.zone?.confirmed)throw new HttpError(400,'Bestätige zuerst die Spielzone.');
     const count=Math.min(lobby.settings.maxPlayers,Math.max(input.players??6,lobby.settings.hunterCount+1,lobby.settings.mode==='team_hunt'?4:2));
     while(lobby.players.length<count){const n=lobby.players.length+1;engine.join(lobby.code,{id:randomUUID(),username:`Testspieler_${String(n).padStart(2,'0')}`,avatar_url:null,friend_code:'SIMULATION',show_online:false});}
     if(lobby.settings.randomRoles||!lobby.players.some(p=>p.role==='hunter'))engine.command(lobby.id,player,{type:'draw_teams'});
     for(const p of lobby.players){s.positions[p.id]=spot(lobby,false);locate(p.id);engine.command(lobby.id,p.id,{type:'ready',ready:true});}
     const candidates:PathCandidate[]=[];if(rules(lobby.settings).xpHunt)for(let i=0;i<100;i++){const p=spot(lobby,false);if(safeXpPosition({...p,pathId:`SIMULATION-${i}`,label:'SIMULATION'},lobby.zone,lobby.zone.feature,lobby.settings))candidates.push({...p,pathId:`SIMULATION-${i}`,label:'SIMULATION · virtueller Fußweg'});}engine.prepareXp(lobby.id,candidates);
    }
    if(cmd.type==='location'){clock++;s.positions[player]={...cmd.location,timestamp:clock};cmd.location=s.positions[player];}
    engine.command(lobby.id,player,cmd);if(cmd.type==='leave')player=remaining.find(p=>p.id===lobby.hostId)?.id??remaining[0].id;if(cmd.type==='start'){clock++;for(const p of lobby.players)locate(p.id,false,true);}
    s.log.push({at:clock,playerId:player,message:`Aktion: ${cmd.type}`});
   }else if(action==='events'){
    if(!input.events)throw new HttpError(400,'Wähle ein Test-Event.');
    for(const event of input.events){const targets=[...new Set(event.targets??[player])];for(const target of targets){sync();if(!lobby.players.some(p=>p.id===target)||!this.events(s,target).includes(event.type))throw new HttpError(400,'Dieses Event passt nicht zum aktuellen Spielerzustand.');}
     if(['advance','timeout','next_phase'].includes(event.type)){let delta=(event.seconds??30)*1000;if(event.type==='timeout')delta=Math.max(1,(lobby.endsAt??clock)-clock+1);if(event.type==='next_phase'){const next=lobby.settings.phases.find(p=>(lobby.startedAt??0)+p.afterSeconds*1000>clock);if(!next)throw new HttpError(400,'Die letzte Zonenphase ist bereits erreicht.');delta=(lobby.startedAt??0)+next.afterSeconds*1000-clock;}advance(delta);}
     else for(const target of targets){const p=lobby.players.find(p=>p.id===target)!;
      if(event.type==='outside'){const zone=lobby.activeZone??lobby.zone!.feature,b=bbox(zone),center=pointOnFeature(zone).geometry.coordinates;const out=destination(center,distance([b[0],b[1]],[b[2],b[3]],{units:'meters'})+100,90,{units:'meters'}).geometry.coordinates;move(target,{longitude:out[0],latitude:out[1],accuracy:3,timestamp:clock});}
      if(event.type==='inside')move(target,spot(lobby));
      if(event.type==='move'){if(!event.location)throw new HttpError(400,'Position fehlt.');move(target,event.location);}
      if(event.type==='pin'){const due=p.role==='hider'||p.role==='zombie'&&lobby.settings.zombieGps?p.nextPinAt:undefined;if(due!==undefined&&due>clock)advance(due-clock);if(lobby.status==='active'){clock+=1000;locate(target,true);}}
      if(event.type==='capture'){
       const hunter=lobby.players.find(h=>!h.eliminated&&!h.infectionPending&&(h.role==='hunter'||h.role==='zombie')&&(lobby.settings.mode!=='team_hunt'||h.team!==p.team));if(!hunter)throw new HttpError(400,'Kein fangberechtigter Hunter verfügbar.');
       move(hunter.id,s.positions[target]);const view=engine.view(lobby.id,target);engine.command(lobby.id,hunter.id,{type:'capture',targetId:target,...(lobby.settings.captureMethod==='qr'?{qrToken:view.self.captureQr?.token}:lobby.settings.captureMethod==='code'?{code:view.self.captureCode}:{})});
       const pending=lobby.captures.find(c=>c.targetId===target);if(pending)engine.command(lobby.id,target,{type:'confirm_capture',captureId:pending.id,accept:true});
      }
      if(event.type==='revive')engine.command(lobby.id,target,{type:'infection_ack'});
      if(event.type==='heal')engine.command(lobby.id,lobby.hostId,{type:'heal',playerId:target});
      if(event.type==='disconnect'||event.type==='reconnect')engine.setConnected(target,event.type==='reconnect');
      if(event.type==='xp_collect'){const xp=lobby.xpHunt?.point;if(!xp)throw new HttpError(400,'Kein gültiger XP-Punkt verfügbar.');move(target,{longitude:xp.longitude,latitude:xp.latitude,accuracy:3,timestamp:clock});engine.command(lobby.id,target,{type:'xp_collect',pointId:xp.id});}
      if(event.type==='feedback')offer(s,target);
      if(event.type==='badge')award(s,target,'captures',20);
     }
     s.log.push({at:clock,message:`Test-Event: ${event.type}`,playerId:targets.join(',')});
    }
   }else if(action==='features'){
    sync();const path=input.path??'',data=input.body as any;
    if(path==='/badges')result=overview(s,player);
    else if(path==='/badges/seen'){const ids=z.array(uuid).max(100).parse(data?.ids);overview(s,player).notices=overview(s,player).notices.filter(n=>!ids.includes(n.id));result={ok:true};}
    else if(path==='/badges/selected'){const id=z.string().nullable().parse(data?.badgeId),b=overview(s,player).badges.find(b=>b.id===id&&b.level>0);if(id&&!b)throw new HttpError(400,'Badge noch gesperrt.');overview(s,player).selected=b?equippedBadge(b):null;lobby.players.find(p=>p.id===player)!.badge=overview(s,player).selected;result=overview(s,player);}
    else if(path.startsWith('/feedback?'))result={offer:s.offers[player]??null};
    else if(/^\/feedback\/[^/]+\/(submit|skip)$/.test(path)){const o=s.offers[player];if(!o||!path.includes(o.id))throw new HttpError(404,'Abfrage nicht gefunden.');const skip=path.endsWith('/skip');if(o.status==='offered'){if(!skip){if(data?.version!==o.version)throw new HttpError(409,'Fragebogenversion stimmt nicht.');validateFeedback(o.questions,data.answers);award(s,player,'feedback');}o.status=skip?'skipped':'completed';}result={ok:true,badges:overview(s,player)};}
    else if(path==='/presets'){if(input.method==='POST'){const v=z.object({name:z.string().trim().min(1).max(60),settings:z.unknown()}).strict().parse(data);if(s.presets.length>=20)throw new HttpError(400,'Maximal 20 Simulations-Presets.');const preset={id:randomUUID(),name:v.name,settings:validateSettings(v.settings)};s.presets.push(preset);result=preset;}else result=s.presets;}
    else throw new HttpError(400,'Diese Funktion ist in der Simulation nicht verfügbar.');
   }else throw new HttpError(405,'Ungültige Simulationsaktion.');
  }else if(method!=='GET')throw new HttpError(405,'Methode nicht verfügbar.');
  sync();s.log=s.log.slice(-100);record.state=s;
  if(!await this.store.save(record))throw new HttpError(409,'Simulation wurde gleichzeitig geändert. Bitte erneut versuchen.');record.revision++;return result===undefined?this.view(record,player):{result,simulation:this.view(record,player)};
 }
}
