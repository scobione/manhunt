import {rules,teamChannel,activeExclusions,DEFAULT_XP} from '../shared/rules.js';
import {safeXpPosition,type PathCandidate} from './xp-paths.js';
import type {ChatMessage} from '../shared/types.js';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { area, booleanPointInPolygon, distance, featureCollection, intersect, lineString, point, pointToLineDistance, polygon, transformScale } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { DEFAULT_SETTINGS, type CaptureRequest, type Command, type GameEvent, type Lobby, type LobbyView, type LocationSample, type Pin, type Player, type Profile, type Settings } from '../shared/types.js';
import {shrinkPlan} from '../shared/zones.js';
import { validateCommand, validateSettings, validateZone } from './validation.js';

export class GameError extends Error {
  constructor(public code:string,message:string,public stateChanged=false,public lobbyId?:string){super(message);this.name='GameError';}
}
interface PlayerState {
  captureSecret?:string;
  lobbyGps?:{checkedAt:number;timestamp:number;accuracy:number};
  outsideAccumulatedMs:number; insideFixes?:number; insideFirstAt?:number; lastOutsideAt?:number; outsideFixes:number; lastReliableOutside:boolean;
  captureAttempts:number[]; missedPin:boolean; infectionAcknowledged:boolean; unreliableLocation?:boolean; lastLocationAt?:number;
}
interface PrivateState { manualPause?:boolean; chat?:ChatMessage[]; chatRate?:Record<string,number[]>; xpCandidates?:PathCandidate[]; xpPrevious?:PathCandidate; stats?:Record<string,{captures:number;points:number}>; zonePhases?:Feature<Polygon>[]; players:Record<string,PlayerState>; phase:number; hunterReleaseAt?:number; lastTick:number; leftIds:string[];}
type EngineLobby=Lobby & {_engine:PrivateState};
const clone=<T>(x:T):T=>structuredClone(x);
const playing=(p:Player)=>!p.eliminated&&p.role!=='spectator';
const hunting=(p:Player)=>!p.eliminated&&(p.role==='hunter'||p.role==='zombie');
const metadata=():PlayerState=>({outsideAccumulatedMs:0,outsideFixes:0,lastReliableOutside:false,captureAttempts:[],missedPin:false,infectionAcknowledged:false});
function fail(code:string,message:string):never{throw new GameError(code,message);}
const shuffled=<T>(values:T[]):T[]=>{const out=[...values];for(let i=out.length-1;i>0;i--){const j=randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;};

/** Authoritative single-process game state. All methods must be serialized by the transport.
 * `snapshot` contains private coordinates and capture codes: store service-role-only.
 * Only `view` is safe to emit to a specific authenticated participant.
 */
export class GameEngine {
  public lobbies=new Map<string,Lobby>();
  private now:()=>number;
  constructor(options:{now?:()=>number;initial?:Lobby[]}={}){this.now=options.now??Date.now;if(options.initial)this.restore(options.initial);}
  snapshot():Lobby[]{return clone([...this.lobbies.values()]);}
  restore(lobbies:Lobby[]):void{
    this.lobbies.clear();
    for(const record of clone(lobbies)){
      const lobby=record as EngineLobby;
      lobby.settings={...clone(DEFAULT_SETTINGS),...lobby.settings};
      // Old clients/checkpoints may still request the removed pause policy.
      if((lobby.settings.disconnectBehavior as string)==='pause'){lobby.settings.disconnectBehavior='continue';lobby.revision++;}
      lobby._engine??={players:{},phase:0,lastTick:this.now(),leftIds:[]};
      lobby._engine.leftIds??=[];
      for(const p of lobby.players){lobby._engine.players[p.id]??=metadata();if(lobby.status==='paused')this.freezeOutside(lobby,p,lobby.pausedAt??this.now());}
      // Upgrade an existing pause once, preserving remaining game deadlines.
      if(lobby.status==='paused'&&!lobby._engine.manualPause){this.resumeLegacy(lobby);lobby.revision++;}
      this.lobbies.set(lobby.id,lobby);
    }
  }
  lobbyFor(userId:string):Lobby|undefined{return [...this.lobbies.values()].find(l=>l.status!=='closed'&&l.status!=='finished'&&l.players.some(p=>p.id===userId)&&!(l as EngineLobby)._engine.leftIds.includes(userId));}
  private get(id:string):EngineLobby {return this.lobbies.get(id) as EngineLobby??fail('LOBBY_NOT_FOUND','Lobby nicht gefunden.');}
  private member(lobby:Lobby,id:string):Player{return lobby.players.find(p=>p.id===id)??fail('FORBIDDEN','Du bist nicht Mitglied dieser Lobby.');}
  private host(lobby:Lobby,id:string){if(lobby.hostId!==id)fail('HOST_ONLY','Nur der Host darf diese Aktion ausführen.');}
  private lobbyGpsReady(lobby:EngineLobby,player:Player):boolean{const fix=lobby._engine.players[player.id]?.lobbyGps;return !!fix&&this.now()-Math.min(fix.checkedAt,fix.timestamp)<=30_000&&fix.accuracy<=lobby.settings.maxAccuracyMeters;}
  private waiting(lobby:Lobby){if(lobby.status!=='waiting')fail('MATCH_STARTED','Diese Einstellung ist nur im Warteraum verfügbar.');}
  private event(lobby:EngineLobby,type:string,message:string,actorId?:string,targetId?:string):void{
    lobby.events.push({id:randomUUID(),type,at:this.now(),message,actorId,targetId});
    if(lobby.events.length>200)lobby.events.splice(0,lobby.events.length-200);
  }
  private changed(lobby:EngineLobby):EngineLobby{lobby.revision++;return lobby;}
  /** Rejections may contain durable anti-cheat/safety evidence. The transport must
   * persist this lobby before returning the error, or fail closed on save failure. */
  private reject(lobby:EngineLobby,code:string,message:string):never{
    this.changed(lobby);throw new GameError(code,message,true,lobby.id);
  }
  private player(profile:Profile,lobby:EngineLobby):Player {
    lobby._engine.players[profile.id]=metadata();
    return {id:profile.id,username:profile.username,avatar_url:profile.avatar_url,ready:false,role:'hider',team:lobby.players.length%2?'B':'A',connected:true,eliminated:false,lastSeen:this.now()};
  }
  create(profile:Profile,settings:Partial<Settings>={}):Lobby{
    if(this.lobbyFor(profile.id))fail('ALREADY_IN_LOBBY','Verlasse zuerst deine aktuelle Lobby.');
    let code='';const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while([...this.lobbies.values()].some(l=>l.code===code&&l.status!=='closed'));
    const normalized=validateSettings({...clone(DEFAULT_SETTINGS),...settings});
    const lobby:EngineLobby={id:randomUUID(),code,hostId:profile.id,status:'waiting',players:[],settings:normalized,zone:null,createdAt:this.now(),pins:[],events:[],captures:[],revision:1,_engine:{players:{},phase:0,lastTick:this.now(),leftIds:[]}};
    lobby.players.push(this.player(profile,lobby));this.event(lobby,'lobby_created','Lobby erstellt.',profile.id);this.lobbies.set(lobby.id,lobby);return lobby;
  }
  join(code:string,profile:Profile):Lobby{
    if(typeof code!=='string'||!/^[A-Z2-9]{6}$/.test(code.trim().toUpperCase()))fail('INVALID_CODE','Gib einen sechsstelligen Lobbycode ein.');
    const lobby=[...this.lobbies.values()].find(l=>l.code===code.trim().toUpperCase()&&l.status!=='closed') as EngineLobby|undefined;
    if(!lobby)fail('LOBBY_NOT_FOUND','Lobby nicht gefunden.');
    if(lobby._engine.leftIds.includes(profile.id))fail('MATCH_LEFT','Du hast dieses Match verlassen. Starte ein neues Match.');
    const existing=lobby.players.find(p=>p.id===profile.id);
    if(existing){existing.connected=true;existing.lastSeen=this.now();return this.changed(lobby);}
    if(this.lobbyFor(profile.id))fail('ALREADY_IN_LOBBY','Verlasse zuerst deine aktuelle Lobby.');
    if(lobby.status==='finished')fail('MATCH_FINISHED','Dieses Match ist beendet.');
    if(lobby.players.length>=lobby.settings.maxPlayers)fail('LOBBY_FULL','Die Lobby ist voll.');
    if(lobby.status!=='waiting'&&!lobby.settings.spectatorsAllowed)fail('MATCH_STARTED','Das Match läuft bereits.');
    const player=this.player(profile,lobby);if(lobby.status!=='waiting')player.role='spectator';
    lobby.players.push(player);this.event(lobby,'player_joined',`${profile.username} ist beigetreten.`,profile.id);return this.changed(lobby);
  }
  setConnected(userId:string,connected:boolean):Lobby|undefined{
    const lobby=this.lobbyFor(userId) as EngineLobby|undefined;if(!lobby)return;
    const p=this.member(lobby,userId);if(p.connected===connected)return lobby;
    p.connected=connected;p.lastSeen=this.now();
    if(!connected){this.freezeOutside(lobby,p);if(lobby.status==='waiting'){p.ready=false;delete lobby._engine.players[p.id].lobbyGps;}}
    this.event(lobby,connected?'reconnected':'disconnected',`${p.username}: ${connected?'Verbindung wiederhergestellt':'Verbindung unterbrochen'}.`,userId);return this.changed(lobby);
  }
  view(id:string,userId:string):LobbyView{
    const l=this.get(id);if(l._engine.leftIds.includes(userId))fail('FORBIDDEN','Du hast dieses Match verlassen.');const self=this.member(l,userId);const now=this.now();
    const canSeePin=(pin:Lobby['pins'][number])=>{
      if(pin.expiresAt<=now)return false;
      if(pin.playerId===userId)return true;
      if(l.status==='finished'||l.status==='closed')return false;
      if(self.role==='spectator'||self.eliminated||self.infectionPending)return false;
      if(l.status==='preparing'||(l._engine.hunterReleaseAt??0)>now)return false;
      if(pin.role==='hider'){
        if(!hunting(self))return false;
        if(l.settings.mode==='team_hunt'&&this.member(l,pin.playerId).team===self.team)return false;
        if(l.settings.mode==='hide_seek'&&now-pin.createdAt>l.settings.pinVisibilitySeconds*1000)return false;
        return true;
      }
      return pin.role==='zombie'&&l.settings.zombieVisible;
    };
    const pins=l.pins.filter(canSeePin).map(pin=>({...pin,stale:!!pin.stale||now-(pin.observedAt??pin.createdAt)>15_000}));
    const visibleLocations:Pin[]=[];
    for(const player of l.players){
      if(player.id===userId||l._engine.leftIds.includes(player.id)||!player.location||player.locationSharing===false)continue;
      const sameTeam=teamChannel(player,l.settings)!==null&&teamChannel(player,l.settings)===teamChannel(self,l.settings);
      const live=l.status==='active'&&sameTeam&&!player.eliminated&&!self.eliminated&&self.role!=='spectator'&&(l._engine.hunterReleaseAt??0)<=now;
      if(!live)continue;
      const sample=player.location,observedAt=Math.min(sample.timestamp,l._engine.players[player.id].lastLocationAt??sample.timestamp);
      if(now-observedAt>l.settings.fallbackPinMaxAgeSeconds*1000)continue;
      visibleLocations.push({id:`live:${player.id}`,playerId:player.id,username:player.username,role:player.role,avatar_url:player.avatar_url,...sample,observedAt,createdAt:observedAt,expiresAt:observedAt+l.settings.fallbackPinMaxAgeSeconds*1000,stale:now-observedAt>15_000||!!l._engine.players[player.id].unreliableLocation,kind:'live'});
    }
    return clone({id:l.id,code:l.code,hostId:l.hostId,status:l.status,
      players:l.players.map(p=>({id:p.id,username:p.username,avatar_url:p.avatar_url,ready:p.ready,locationReady:l.status==='waiting'&&this.lobbyGpsReady(l,p),role:p.role,muted:p.muted,infectionPending:p.infectionPending,team:p.team,connected:p.connected,eliminated:p.eliminated,infectedAt:p.infectedAt,lastSeen:p.lastSeen})),
      settings:l.settings,zone:l.zone,activeZone:l.activeZone,createdAt:l.createdAt,startedAt:l.startedAt,endsAt:l.endsAt,pausedAt:l.pausedAt,previousStatus:l.previousStatus,
      xpHunt:l.xpHunt,chat:(l._engine.chat??[]).filter(m=>m.channel==='all'||m.channel===teamChannel(self,l.settings)),pins,visibleLocations,events:l.events,captures:l.captures.filter(c=>c.targetId===userId||c.hunterId===userId),result:l.result,revision:l.revision,
      self:{...self,locationReady:l.status==='waiting'&&this.lobbyGpsReady(l,self),...(self.role==='hider'&&!self.eliminated&&l.settings.captureMethod==='qr'&&l._engine.players[self.id].captureSecret?{captureQr:{token:this.qrToken(l,self,Math.floor(now/30000)),expiresAt:(Math.floor(now/30000)+2)*30000}}:{})},serverTime:now});
  }
  command(id:string,userId:string,input:Command):Lobby{
    let command:Command;try{command=validateCommand(input);}catch{fail('INVALID_INPUT','Die Eingabe entspricht nicht den Spielregeln.');}
    const l=this.get(id),p=this.member(l,userId),now=this.now();
    if(l._engine.leftIds.includes(userId))fail('FORBIDDEN','Du hast dieses Match verlassen.');
    if(l.status==='closed')fail('LOBBY_CLOSED','Diese Lobby ist geschlossen.');
    // A late socket packet must never win a race against the once-per-second tick.
    if(l.status==='active'&&now>=(l.endsAt??Infinity)){
      this.evaluate(l);this.reject(l,'MATCH_FINISHED','Das Zeitlimit ist erreicht. Das Ergebnis wurde gespeichert.');
    }
    if(l.status==='finished'&&!['leave','close'].includes(command.type))fail('MATCH_FINISHED','Dieses Match ist beendet.');
    switch(command.type){
      case 'pause':this.host(l,userId);if(!['active','preparing'].includes(l.status))fail('NOT_ACTIVE','Dieses Match kann gerade nicht pausiert werden.');l.previousStatus=l.status as 'active'|'preparing';l.pausedAt=now;l.status='paused';l._engine.manualPause=true;l.players.forEach(player=>this.freezeOutside(l,player));this.event(l,'match_paused','Der Host hat das Match pausiert.',userId);break;
      case 'resume':this.host(l,userId);if(l.status!=='paused')fail('NOT_PAUSED','Dieses Match ist nicht pausiert.');this.resumeLegacy(l);delete l._engine.manualPause;break;
      case 'end':this.host(l,userId);if(!['active','preparing','paused'].includes(l.status))fail('NOT_ACTIVE','Kein aktives Match.');this.finish(l,'aborted','Der Host hat das Match ohne Wertung beendet.');break;
      case 'draw_teams':this.host(l,userId);this.waiting(l);this.drawTeams(l);l.settings.randomRoles=false;l.players.forEach(player=>player.ready=false);this.event(l,'teams_drawn','Teams wurden auf dem Server ausgelost.',userId);break;
      case 'chat':{if(!['waiting','preparing','active','paused'].includes(l.status))fail('CHAT_DISABLED','Der Chat ist geschlossen.');if(p.muted)fail('MUTED','Du bist in dieser Lobby stummgeschaltet.');const channel=command.channel==='all'?'all':teamChannel(p,l.settings);if(!channel||command.channel==='team'&&l.status==='waiting')fail('FORBIDDEN','Teamchat ist erst nach der endgültigen Rollenverteilung verfügbar.');l._engine.chatRate??={};const recent=(l._engine.chatRate[p.id]??[]).filter(t=>now-t<10000);if(recent.length>=5)fail('RATE_LIMIT','Bitte warte kurz vor der nächsten Nachricht.');l._engine.chatRate[p.id]=[...recent,now];l._engine.chat??=[];l._engine.chat.push({id:randomUUID(),actorId:p.id,username:p.username,avatar_url:p.avatar_url,text:command.text,channel,at:now});l._engine.chat=l._engine.chat.slice(-200);break;}
      case 'mute':this.host(l,userId);this.member(l,command.playerId).muted=command.muted;break;
      case 'xp_regenerate':this.host(l,userId);if(l.status!=='active'||!rules(l.settings).xpHunt)fail('XP_DISABLED','XP-Jagd ist nicht aktiv.');this.nextXp(l);break;
      case 'xp_confirm':this.host(l,userId);if(l.status!=='active'||!l.xpHunt?.point||l.xpHunt.point.id!==command.pointId)fail('STALE_POINT','Dieser Punkt ist nicht mehr aktuell.');l.xpHunt.point.confirmed=true;l.xpHunt.message=undefined;this.event(l,'xp_point','Ein neuer XP-Punkt wurde freigegeben.',userId);break;
      case 'xp_collect':this.collectXp(l,p,command.pointId);break;
      case 'location_check':{
        this.waiting(l);if(p.role==='spectator')fail('LOCATION_DISABLED','Zuschauer benötigen keine Standortfreigabe.');
        const sample=command.location,meta=l._engine.players[p.id];
        if(sample.accuracy>l.settings.maxAccuracyMeters||sample.timestamp>now+5000||now-sample.timestamp>30_000){delete meta.lobbyGps;p.ready=false;this.reject(l,'GPS_REQUIRED','Aktiviere die Standortfreigabe und warte auf eine aktuelle, genaue Ortung.');}
        if(meta.lobbyGps&&sample.timestamp<=meta.lobbyGps.timestamp)fail('STALE_LOCATION','Fordere eine neue GPS-Messung an.');
        // Only readiness metadata is persisted. Waiting-room coordinates are never stored or broadcast.
        meta.lobbyGps={checkedAt:now,timestamp:sample.timestamp,accuracy:sample.accuracy};p.lastSeen=now;break;
      }
      case 'ready':this.waiting(l);if(command.ready&&p.role!=='spectator'&&!this.lobbyGpsReady(l,p))fail('GPS_REQUIRED','Aktiviere zuerst deinen Standort in der Lobby und warte auf eine genaue Ortung.');p.ready=command.ready;break;
      case 'settings':this.host(l,userId);this.waiting(l);if(command.settings.maxPlayers<l.players.length)fail('INVALID_SETTINGS','Das Spielerlimit ist kleiner als die aktuelle Spielerzahl.');l.settings=clone(command.settings);l.players.forEach(p=>p.ready=false);break;
      case 'zone':this.host(l,userId);this.waiting(l);try{l.zone=validateZone(command.zone);}catch(e){fail('INVALID_ZONE',e instanceof Error?e.message:'Ungültige Zone.');}l.players.forEach(p=>p.ready=false);break;
      case 'assign':{this.host(l,userId);this.waiting(l);if(command.role==='zombie')fail('INVALID_ROLE','Zombies entstehen erst durch Infektion.');if(command.role==='spectator'&&!l.settings.spectatorsAllowed)fail('INVALID_ROLE','Zuschauer sind deaktiviert.');const target=this.member(l,command.playerId);target.role=command.role;target.team=command.team;target.ready=false;break;}
      case 'kick':{this.host(l,userId);this.waiting(l);if(command.playerId===userId)fail('INVALID_TARGET','Du kannst dich nicht selbst entfernen.');const target=this.member(l,command.playerId);l.players=l.players.filter(p=>p.id!==target.id);delete l._engine.players[target.id];this.event(l,'player_removed',`${target.username} wurde entfernt.`,userId,target.id);break;}
      case 'transfer':this.host(l,userId);if(!this.member(l,command.playerId).connected)fail('DISCONNECTED','Der neue Host muss verbunden sein.');l.hostId=command.playerId;this.event(l,'host_changed','Host übertragen.',userId,command.playerId);break;
      case 'start':this.start(l,userId);break;
      case 'zone_return_ack':if(p.zoneStatus!=='inside'||!p.location||now-(l._engine.players[p.id].lastLocationAt??0)>15_000)fail('RETURN_UNCONFIRMED','Die Rückkehr muss zuerst durch aktuelle, genaue GPS-Messungen bestätigt werden.');p.returnPending=false;break;
      case 'stop_location':delete l._engine.players[p.id].lobbyGps;if(l.status==='waiting')p.ready=false;p.locationSharing=false;delete p.location;l.pins=l.pins.filter(pin=>pin.playerId!==p.id);this.freezeOutside(l,p);break;
      case 'close':this.host(l,userId);l.status='closed';this.purge(l);this.event(l,'lobby_closed','Lobby geschlossen.',userId);break;
      case 'leave':this.leave(l,p);break;
      case 'location':this.location(l,p,command.location,command.publish??false);break;
      case 'capture':this.capture(l,p,command.targetId,command.code,command.qrToken);break;
      case 'confirm_capture':this.confirmCapture(l,p,command.captureId,command.accept);break;
      case 'infection_ack':if(p.role!=='zombie'||p.infectedAt===undefined)fail('NOT_INFECTED','Du bist nicht infiziert.');l._engine.players[p.id].infectionAcknowledged=true;p.infectionPending=false;this.event(l,'infection_ack','Infektion bestätigt.',userId);break;
      case 'heal':{this.host(l,userId);if(l.status!=='active'||!l.settings.allowHealing||!this.infectionMode(l))fail('HEALING_DISABLED','Heilung ist nicht verfügbar.');const target=this.member(l,command.playerId);if(target.role!=='zombie'||target.eliminated)fail('INVALID_TARGET','Nur aktive Zombies können geheilt werden.');target.role='hider';target.infectionPending=false;delete target.infectedAt;target.captureCode=this.code();l._engine.players[target.id].captureSecret=randomBytes(32).toString('base64url');target.nextPinAt=now+l.settings.pinIntervalSeconds*1000;l.pins=l.pins.filter(pin=>pin.playerId!==target.id);this.event(l,'healed',`${target.username} wurde geheilt.`,userId,target.id);break;}
    }
    if(l.status==='active')this.evaluate(l);
    return this.changed(l);
  }

  /** Trusted transport calls this with OSM-derived data; no client command accepts candidates. */
  prepareXp(id:string,candidates:PathCandidate[]){this.get(id)._engine.xpCandidates=clone(candidates);}
  private nextXp(l:EngineLobby){
    l.xpHunt??={collected:0,byPlayer:{},generation:0};const previous=l.xpHunt.point??l._engine.xpPrevious;if(previous)l._engine.xpPrevious=previous;
    const available=(l._engine.xpCandidates??[]).filter(c=>safeXpPosition(c,l.zone!,l.activeZone!,l.settings,previous));
    delete l.xpHunt.point;l.xpHunt.generation++;
    if(!available.length){l.xpHunt.message='Kein sicherer, ausreichend entfernter Punkt auf verfügbaren Fußwegen gefunden. Der Host kann Wegdaten erneut prüfen; es wird kein ungeprüfter Ersatzpunkt erzeugt.';return;}
    const candidate=available[randomInt(available.length)];l.xpHunt.point={...candidate,id:randomUUID(),radiusMeters:({...DEFAULT_XP,...l.settings.xp}).radiusMeters,confirmed:false};l.xpHunt.message='Host-Bestätigung erforderlich: Wegzugang, Umgebung und sichere Erreichbarkeit vor Ort prüfen.';
    this.event(l,'xp_candidate','Ein XP-Punkt wartet auf die Sicherheitsbestätigung des Hosts.');
  }
  private collectXp(l:EngineLobby,p:Player,id:string){
    if(l.status!=='active'||!rules(l.settings).xpHunt)fail('XP_DISABLED','XP-Jagd ist nicht aktiv.');
    if(p.role!=='hider'||p.eliminated||!p.connected)fail('INVALID_ROLE','Nur aktive Hider dürfen Punkte sammeln.');
    const target=l.xpHunt?.point;if(!target||target.id!==id||!target.confirmed)fail('STALE_POINT','Dieser Punkt ist nicht aktiv oder noch nicht bestätigt.');
    const loc=p.location,meta=l._engine.players[p.id],now=this.now();
    if(!loc||!p.locationSharing||meta.unreliableLocation||now-loc.timestamp>10000||now-(meta.lastLocationAt??0)>10000)fail('GPS_REQUIRED','Zum Sammeln benötigst du einen aktuellen, genauen Standort.');
    if(!safeXpPosition(target,l.zone!,l.activeZone!,l.settings))fail('UNSAFE_POINT','Dieser Punkt liegt nicht mehr im sicheren Spielgebiet.');
    if(distance([loc.longitude,loc.latitude],[target.longitude,target.latitude],{units:'meters'})+loc.accuracy>target.radiusMeters)fail('TOO_FAR','Du musst mit deiner gesamten GPS-Genauigkeit innerhalb des Sammelradius stehen.');
    const xp=l.xpHunt!;xp.collected++;xp.byPlayer[p.id]=(xp.byPlayer[p.id]??0)+1;xp.lastCollector=p.username;
    l._engine.stats??={};l._engine.stats[p.id]??={captures:0,points:0};l._engine.stats[p.id].points++;
    this.event(l,'xp_collected',`${p.username} hat einen XP-Punkt eingesammelt.`,p.id);
    const config={...DEFAULT_XP,...l.settings.xp},complete=config.goal==='team'?xp.collected>=config.target:xp.byPlayer[p.id]>=config.target;
    if(complete){delete xp.point;this.finish(l,'hiders','Das XP-Ziel wurde erreicht. Die Hider gewinnen.');}else this.nextXp(l);
  }
  private drawTeams(l:EngineLobby){
    const participants=l.players.filter(p=>p.role!=='spectator');if(participants.length<=l.settings.hunterCount)fail('INVALID_ROLES','Es müssen Hunter und Hider übrig bleiben.');
    if(l.settings.mode==='team_hunt'){if(participants.length<4||l.settings.hunterCount<2||l.settings.hunterCount>participants.length-2)fail('TEAM_REQUIREMENTS','Beide Teams benötigen Hunter und Hider.');const shuffledPlayers=shuffled(participants);shuffledPlayers.forEach((p,i)=>{p.team=i%2?'B':'A';p.role='hider';});for(const team of ['A','B'])participants.find(p=>p.team===team)!.role='hunter';let remaining=l.settings.hunterCount-2;for(const p of shuffled(participants))if(remaining&&p.role==='hider'&&participants.filter(x=>x.team===p.team&&x.role==='hider').length>1){p.role='hunter';remaining--;}}
    else{const hunters=new Set(shuffled(participants).slice(0,l.settings.hunterCount).map(p=>p.id));participants.forEach(p=>p.role=hunters.has(p.id)?'hunter':'hider');}
  }
  private code():string{return String(randomInt(0,1_000_000)).padStart(6,'0');}
  private start(l:EngineLobby,userId:string):void{
    this.host(l,userId);this.waiting(l);
    const participants=l.players.filter(p=>p.role!=='spectator');
    if(participants.length<2)fail('NOT_ENOUGH_PLAYERS','Mindestens zwei aktive Spieler werden benötigt.');
    if(participants.some(p=>!this.lobbyGpsReady(l,p)))fail('GPS_REQUIRED','Alle aktiven Spieler benötigen einen aktuellen, genauen Standort. Prüft die Freigabe in der Lobby.');
    if(participants.some(p=>!p.ready||!p.connected))fail('NOT_READY','Alle aktiven Spieler müssen verbunden und bereit sein.');
    if(!l.zone?.confirmed)fail('ZONE_REQUIRED','Bestätige zuerst ein sicheres Spielgebiet.');
    if(l.settings.hunterCount>=participants.length)fail('INVALID_ROLES','Mindestens ein Hider muss übrig bleiben.');
    if(l.settings.mode==='team_hunt'){
      if(participants.length<4||l.settings.hunterCount<2)fail('TEAM_REQUIREMENTS','Team Hunt benötigt mindestens vier Spieler und zwei Hunter.');
      if(l.settings.randomRoles){
        const randomized=shuffled(participants);randomized.forEach((p,i)=>{p.team=i%2?'B':'A';p.role='hider';});
        const teams=['A','B'] as const;
        for(const team of teams){const members=shuffled(participants.filter(p=>p.team===team));members[0].role='hunter';}
        const extra=shuffled(participants.filter(p=>p.role==='hider'));let remaining=l.settings.hunterCount-2;
        for(const player of extra)if(remaining>0&&participants.filter(p=>p.team===player.team&&p.role==='hider').length>1){player.role='hunter';remaining--;}
        if(remaining)fail('INVALID_ROLES','Jedes Team benötigt mindestens einen Hider.');
      }
      for(const team of ['A','B'])if(!participants.some(p=>p.team===team&&p.role==='hider')||!participants.some(p=>p.team===team&&p.role==='hunter'))fail('TEAM_REQUIREMENTS','Jedes Team benötigt mindestens einen Hunter und einen Hider.');
    }else if(l.settings.randomRoles){
      const hunters=new Set(shuffled(participants).slice(0,l.settings.hunterCount).map(p=>p.id));participants.forEach(p=>p.role=hunters.has(p.id)?'hunter':'hider');
    }
    const hunters=participants.filter(p=>p.role==='hunter');
    if(hunters.length!==l.settings.hunterCount||!participants.some(p=>p.role==='hider'))fail('INVALID_ROLES','Die Rollenverteilung entspricht nicht der Hunter-Anzahl.');
    if((l.settings.mode==='last_survivor'||l.settings.winCondition==='last_hider')&&participants.filter(p=>p.role==='hider').length<2)fail('NOT_ENOUGH_HIDERS','Last Survivor benötigt mindestens zwei Hider.');
    if(l.settings.mode==='infection_rush'){l.settings.pinIntervalSeconds=Math.min(l.settings.pinIntervalSeconds,60);l.settings.infectionDelaySeconds=Math.min(l.settings.infectionDelaySeconds,5);}
    let zonePhases:Feature<Polygon>[]|undefined;
    if(rules(l.settings).apocalypse&&(l.zone.shrinkTarget||l.zone.randomCorners)){try{zonePhases=shrinkPlan(l.zone,l.settings.phases.map(p=>p.scale),()=>randomInt(0,0x100000000)/0x100000000);}catch(error){fail('INVALID_ZONE',error instanceof Error?error.message:'Die Schrumpfzonen sind ungültig.');}}
    const now=this.now();l.startedAt=now+l.settings.preparationSeconds*1000;l.endsAt=l.startedAt+l.settings.durationSeconds*1000;
    l._engine.hunterReleaseAt=l.startedAt+l.settings.headStartSeconds*1000;
    l.status=l.settings.preparationSeconds?'preparing':'active';l.activeZone=clone(l.zone.feature);l.pins=[];l.captures=[];l._engine.phase=0;l._engine.zonePhases=zonePhases;
    for(const p of participants){p.eliminated=false;p.captureCode=this.code();p.nextPinAt=l._engine.hunterReleaseAt;delete p.location;delete p.outsideSince;delete p.infectedAt;delete p.outsideClockAt;p.outsideActive=false;p.returnPending=false;p.outsideElapsed=0;p.locationSharing=false;p.zoneStatus='uncertain';l._engine.players[p.id]={...metadata(),captureSecret:randomBytes(32).toString('base64url')};}
    l._engine.stats=Object.fromEntries(participants.map(p=>[p.id,{captures:0,points:0}]));if(rules(l.settings).xpHunt){l.xpHunt={collected:0,byPlayer:{},generation:0};this.nextXp(l);}
    this.event(l,'match_started','Rollen verteilt. Achte auf deine Umgebung.',userId);
  }
  private resumeLegacy(l:EngineLobby):void{
    const now=this.now(),delta=Math.max(0,now-(l.pausedAt??now));
    if(l.startedAt!==undefined)l.startedAt+=delta;if(l.endsAt!==undefined)l.endsAt+=delta;if(l._engine.hunterReleaseAt!==undefined)l._engine.hunterReleaseAt+=delta;
    for(const p of l.players){if(p.nextPinAt!==undefined)p.nextPinAt+=delta;if(p.infectedAt!==undefined)p.infectedAt+=delta;this.freezeOutside(l,p);const meta=l._engine.players[p.id];meta.insideFixes=0;}
    l.pins=l.pins.filter(pin=>pin.expiresAt>now);
    l.status=l.previousStatus??'active';delete l.pausedAt;delete l.previousStatus;l.captures=[];l._engine.lastTick=now;this.event(l,'match_resumed','Das Match wird fortgesetzt.');
  }
  private leave(l:EngineLobby,p:Player):void{
    l.pins=l.pins.filter(pin=>pin.playerId!==p.id);l.captures=l.captures.filter(c=>c.targetId!==p.id&&c.hunterId!==p.id);
    if(l.status==='waiting'||l.status==='finished'){l.players=l.players.filter(x=>x.id!==p.id);delete l._engine.players[p.id];}
    else{p.eliminated=true;p.connected=false;delete p.location;delete p.captureCode;delete l._engine.players[p.id].captureSecret;delete p.outsideSince;l._engine.leftIds.push(p.id);}
    this.event(l,'player_left',`${p.username} hat die Lobby verlassen.`,p.id);
    if(l.hostId===p.id){const next=l.players.find(x=>x.id!==p.id&&x.connected&&!x.eliminated)??l.players.find(x=>x.id!==p.id&&x.connected);if(next)l.hostId=next.id;else{l.status='closed';this.purge(l);}}
    if(l.status==='paused'&&l.players.every(x=>!playing(x))) {l.status='closed';this.purge(l);}
  }
  private infectionMode(l:Lobby){return rules(l.settings).zombie;}
  private location(l:EngineLobby,p:Player,loc:LocationSample,_publish:boolean):void{
    if(!['preparing','active','paused'].includes(l.status)||!playing(p))fail('LOCATION_DISABLED','Standortfreigabe ist nur im laufenden Match möglich.');
    const now=this.now(),meta=l._engine.players[p.id],old=p.location;
    if(Math.abs(now-loc.timestamp)>30_000)fail('STALE_LOCATION','Der GPS-Zeitstempel ist veraltet. Fordere einen neuen Standort an.');
    if(old&&loc.timestamp<=old.timestamp)fail('REPLAYED_LOCATION','Dieser Standort wurde bereits verarbeitet.');
    if(loc.accuracy>l.settings.maxAccuracyMeters){meta.unreliableLocation=true;this.freezeOutside(l,p);this.reject(l,'GPS_UNCERTAIN','GPS zu ungenau. Der Zonentimer wird angehalten; der letzte genaue Standort bleibt als veraltet erkennbar.');}
    if(old&&now-old.timestamp<=60_000){const elapsed=Math.max(0,(now-(meta.lastLocationAt??old.timestamp))/1000);const meters=distance([old.longitude,old.latitude],[loc.longitude,loc.latitude],{units:'meters'});if(meters>Math.max(100,elapsed*15+old.accuracy+loc.accuracy)){this.event(l,'gps_rejected','Auffälliger GPS-Sprung wurde verworfen.',p.id);meta.unreliableLocation=true;this.freezeOutside(l,p);this.reject(l,'GPS_JUMP','Auffälliger GPS-Sprung. Bitte warte auf eine zuverlässige Ortung.');}}
    if(l.status!=='paused')this.accrueOutside(l,p,now);
    p.location={...loc};p.locationSharing=true;p.lastSeen=now;meta.unreliableLocation=false;meta.lastLocationAt=now;
    if(l.status==='active')this.observeBoundary(l,p,loc);
    if(l.status==='active')this.publishDuePin(l,p);
  }
  private publishDuePin(l:EngineLobby,p:Player):boolean{
    const now=this.now(),meta=l._engine.players[p.id],sample=p.location;
    if(!playing(p)||p.locationSharing===false||!(p.role==='hider'||p.role==='zombie'&&l.settings.zombieGps)||(p.nextPinAt??Infinity)>now||!sample)return false;
    const observedAt=Math.min(sample.timestamp,meta.lastLocationAt??sample.timestamp),age=now-observedAt;
    const stale=age>15_000||!!meta.unreliableLocation;
    if(age>l.settings.fallbackPinMaxAgeSeconds*1000||(stale&&!l.settings.fallbackPins))return false;
    if(!l.settings.showOldPins)l.pins=l.pins.filter(pin=>pin.playerId!==p.id);
    l.pins.push({id:randomUUID(),playerId:p.id,username:p.username,role:p.role,...sample,observedAt,stale,kind:'scheduled',createdAt:now,expiresAt:now+l.settings.pinLifetimeSeconds*1000});
    p.nextPinAt=now+l.settings.pinIntervalSeconds*1000;meta.missedPin=false;
    this.event(l,'pin_published',stale?`${p.username}: letzter bekannter Standort veröffentlicht (keine aktuelle Ortung).`:`${p.username} hat einen GPS-Pin gemeldet.`,p.id);
    return true;
  }
  private accrueOutside(l:EngineLobby,p:Player,now:number):void{
    const meta=l._engine.players[p.id];
    if(meta.lastReliableOutside&&meta.lastOutsideAt!==undefined){
      const until=Math.min(now,(meta.lastLocationAt??meta.lastOutsideAt)+Math.min(15,l.settings.gpsToleranceSeconds)*1000);
      meta.outsideAccumulatedMs+=Math.max(0,until-meta.lastOutsideAt);
      meta.lastOutsideAt=Math.max(meta.lastOutsideAt,until);p.outsideElapsed=meta.outsideAccumulatedMs;
    }
  }
  private freezeOutside(l:EngineLobby,p:Player,at=this.now()):void{
    this.accrueOutside(l,p,at);
    const meta=l._engine.players[p.id];meta.lastReliableOutside=false;meta.lastOutsideAt=undefined;meta.insideFixes=0;delete meta.insideFirstAt;
    delete p.outsideClockAt;p.zoneStatus='uncertain';delete p.outsideSince;
  }
  private boundary(l:EngineLobby,loc:LocationSample):'inside'|'outside'|'uncertain'{
    if(!l.activeZone)return 'uncertain';const pos=point([loc.longitude,loc.latitude]);
    const polygons=[l.activeZone,...activeExclusions(l.zone)];
    const nearBoundary=polygons.some(poly=>poly.geometry.coordinates.some(ring=>pointToLineDistance(pos,lineString(ring),{units:'meters'})<=loc.accuracy+5));
    if(nearBoundary)return 'uncertain';
    if(!booleanPointInPolygon(pos,l.activeZone)||activeExclusions(l.zone).some(zone=>booleanPointInPolygon(pos,zone)))return 'outside';
    return 'inside';
  }
  private observeBoundary(l:EngineLobby,p:Player,loc:LocationSample):void{
    const now=this.now(),meta=l._engine.players[p.id],state=this.boundary(l,loc);
    if(state==='outside'){
      meta.insideFixes=0;delete meta.insideFirstAt;meta.lastOutsideAt=now;meta.lastReliableOutside=true;meta.outsideFixes++;
      p.outsideActive=true;p.returnPending=false;p.zoneStatus='outside';p.outsideElapsed=meta.outsideAccumulatedMs;p.outsideClockAt=now;p.outsideSince=now-meta.outsideAccumulatedMs;
      if(meta.outsideFixes===1)this.event(l,'zone_warning',`${p.username}: außerhalb der Spielzone. Sicher zurückkehren.`,p.id);
      if(meta.outsideFixes>=2&&meta.outsideAccumulatedMs>=l.settings.outsideGraceSeconds*1000)this.eliminate(l,p,'zone','Toleranzzeit außerhalb der Zone überschritten.');
    }else if(state==='uncertain')this.freezeOutside(l,p);
    else{
      meta.lastReliableOutside=false;delete meta.lastOutsideAt;delete p.outsideClockAt;
      meta.insideFixes=(meta.insideFixes??0)+1;meta.insideFirstAt??=now;
      // One noisy fix must not erase an existing warning or reset its timer.
      if(p.outsideActive&&(meta.insideFixes<2||now-meta.insideFirstAt<1500)){p.zoneStatus='uncertain';return;}
      const returning=!!p.outsideActive;p.zoneStatus='inside';p.outsideActive=false;p.returnPending ||= returning;
      if(l.settings.outsideReset)meta.outsideAccumulatedMs=0;
      meta.outsideFixes=0;delete p.outsideSince;p.outsideElapsed=meta.outsideAccumulatedMs;
    }
  }
  private canHunt(l:EngineLobby,p:Player):void{
    if(l.status!=='active')fail('NOT_ACTIVE','Fangen ist nur im aktiven Match möglich.');
    if((l._engine.hunterReleaseAt??0)>this.now())fail('HEAD_START','Der Vorsprung der Hider läuft noch.');
    if(p.infectionPending)fail('INFECTION_PENDING','Bestätige zuerst deine Wiederbelebung.');
    if(!hunting(p))fail('INVALID_ROLE','Nur aktive Hunter und Zombies dürfen fangen.');
    if(!p.connected)fail('DISCONNECTED','Verbinde dich erneut, um zu fangen.');
    if(p.role==='zombie'&&(p.infectedAt??this.now())+l.settings.infectionDelaySeconds*1000>this.now())fail('INFECTION_DELAY','Die Infektionszeit läuft noch.');
  }
  private qrToken(l:EngineLobby,p:Player,slot:number):string{return createHmac('sha256',l._engine.players[p.id].captureSecret??'').update(`${l.id}:${p.id}:${slot}`).digest('base64url');}
  private capture(l:EngineLobby,actor:Player,targetId:string,code?:string,qrToken?:string):void{
    this.canHunt(l,actor);const target=this.member(l,targetId);this.validTarget(l,actor,target);
    const now=this.now(),meta=l._engine.players[actor.id];meta.captureAttempts=meta.captureAttempts.filter(t=>now-t<60_000);
    if(meta.captureAttempts.length>=6)fail('RATE_LIMIT','Zu viele Fangversuche. Warte eine Minute.');meta.captureAttempts.push(now);
    if(l.settings.captureMethod==='confirmation'){
      if(l.captures.some(c=>c.targetId===targetId&&now-c.createdAt<30_000))this.reject(l,'CAPTURE_PENDING','Für diesen Spieler steht bereits eine Fangbestätigung aus.');
      l.captures.push({id:randomUUID(),hunterId:actor.id,targetId,createdAt:now});this.event(l,'capture_requested',`${actor.username} bittet ${target.username} um Fangbestätigung.`,actor.id,targetId);return;
    }
    if(l.settings.captureMethod==='qr'){
      const slot=Math.floor(now/30000);
      if(!l._engine.players[target.id].captureSecret||!qrToken||![slot,slot-1].some(n=>timingSafeEqual(Buffer.from(this.qrToken(l,target,n)),Buffer.from(qrToken))))this.reject(l,'INVALID_CAPTURE_QR','Der Fang-QR-Code ist ungültig oder abgelaufen. Scanne den aktuellen Code des Hiders.');
    }else if(l.settings.captureMethod==='code'){
      if(!code||!target.captureCode||code.length!==target.captureCode.length||!timingSafeEqual(Buffer.from(code),Buffer.from(target.captureCode)))this.reject(l,'INVALID_CAPTURE_CODE','Der Fangcode ist falsch.');
    }else{
      const a=actor.location,b=target.location;
      if(!a||!b||now-(meta.lastLocationAt??0)>15_000||now-(l._engine.players[target.id].lastLocationAt??0)>15_000||meta.unreliableLocation||l._engine.players[target.id].unreliableLocation||now-a.timestamp>15_000||now-b.timestamp>15_000||a.accuracy>l.settings.maxAccuracyMeters||b.accuracy>l.settings.maxAccuracyMeters)this.reject(l,'GPS_REQUIRED','Beide Spieler benötigen eine aktuelle, genaue GPS-Ortung.');
      const meters=distance([a.longitude,a.latitude],[b.longitude,b.latitude],{units:'meters'});
      if(meters+a.accuracy+b.accuracy>l.settings.captureRadiusMeters)this.reject(l,'TOO_FAR','Die GPS-Nähe ist unter Berücksichtigung der Genauigkeit nicht bestätigt.');
    }
    this.finishCapture(l,actor,target);
  }
  private validTarget(l:Lobby,actor:Player,target:Player):void{
    if(target.id===actor.id||target.role!=='hider'||target.eliminated)fail('INVALID_TARGET','Dieser Spieler kann nicht gefangen werden.');
    if(l.settings.mode==='team_hunt'&&actor.team===target.team)fail('SAME_TEAM','Du kannst keine Hider aus deinem Team fangen.');
  }
  private confirmCapture(l:EngineLobby,p:Player,id:string,accept:boolean):void{
    const index=l.captures.findIndex(c=>c.id===id);if(index<0)fail('CAPTURE_NOT_FOUND','Fangbestätigung nicht gefunden.');
    const request=l.captures[index];if(request.targetId!==p.id)fail('FORBIDDEN','Nur der betroffene Hider kann den Fang bestätigen.');
    if(this.now()-request.createdAt>30_000){l.captures.splice(index,1);this.reject(l,'CAPTURE_EXPIRED','Die Fangbestätigung ist abgelaufen.');}
    if(!accept){l.captures.splice(index,1);this.event(l,'capture_rejected',`${p.username} hat den Fang abgelehnt.`,p.id);return;}
    const hunter=this.member(l,request.hunterId);this.canHunt(l,hunter);this.validTarget(l,hunter,p);l.captures.splice(index,1);this.finishCapture(l,hunter,p);
  }
  private finishCapture(l:EngineLobby,actor:Player,target:Player):void{
    l.captures=l.captures.filter(c=>c.targetId!==target.id);l.pins=l.pins.filter(pin=>pin.playerId!==target.id);delete target.captureCode;delete l._engine.players[target.id].captureSecret;
    l._engine.stats??={};l._engine.stats[actor.id]??={captures:0,points:0};l._engine.stats[actor.id].captures++;
    this.event(l,'capture',`${actor.username} hat ${target.username} gefangen.`,actor.id,target.id);
    if(this.infectionMode(l)){
      target.role='zombie';target.infectionPending=!!l.settings.rules;delete target.location;target.locationSharing=false;target.infectedAt=this.now();target.nextPinAt=this.now()+l.settings.pinIntervalSeconds*1000;delete target.outsideSince;
      l._engine.players[target.id]=metadata();this.event(l,'infection',`${target.username} wurde infiziert.`,actor.id,target.id);
    }else this.eliminate(l,target,'captured','Gefangen.',actor.id);
  }
  private eliminate(l:EngineLobby,p:Player,reason:string,message:string,actorId?:string):void{
    if(p.eliminated)return;p.eliminated=true;p.outsideActive=false;p.returnPending=false;delete p.outsideClockAt;delete p.location;delete p.captureCode;delete l._engine.players[p.id].captureSecret;delete p.outsideSince;delete p.nextPinAt;
    l.pins=l.pins.filter(pin=>pin.playerId!==p.id);l.captures=l.captures.filter(c=>c.targetId!==p.id&&c.hunterId!==p.id);this.event(l,'elimination',`${p.username}: ${message}`,actorId??p.id,p.id);
    // No coordinate or raw GPS evidence enters the public event log.
    if(reason==='zone')this.event(l,'zone_elimination','Zone serverseitig mit mehreren genauen Ortungen geprüft.',undefined,p.id);
  }
  private purge(l:EngineLobby):void{l.pins=[];l.captures=[];for(const p of l.players){p.outsideActive=false;p.returnPending=false;delete p.outsideClockAt;delete p.location;delete p.captureCode;delete l._engine.players[p.id].captureSecret;delete p.outsideSince;delete p.nextPinAt;}}
  private finish(l:EngineLobby,winner:string,reason:string):void{
    l.result={winner,reason,endedAt:this.now(),survivors:l.players.filter(p=>playing(p)&&p.role==='hider').map(p=>p.id)};l.status='finished';this.purge(l);l._engine.chat=[];this.event(l,'match_finished',reason);
  }
  private evaluate(l:EngineLobby):void{
    const hiders=l.players.filter(p=>playing(p)&&p.role==='hider'),hunters=l.players.filter(hunting),timeout=this.now()>=(l.endsAt??Infinity);
    if(l.settings.mode==='team_hunt'){
      const a=hiders.filter(p=>p.team==='A').length,b=hiders.filter(p=>p.team==='B').length;
      if(a===0&&b===0)this.finish(l,'draw','Keine Hider mehr im Spiel. Unentschieden.');
      else if(a===0)this.finish(l,'team_B','Team B hat alle gegnerischen Hider gefangen.');
      else if(b===0)this.finish(l,'team_A','Team A hat alle gegnerischen Hider gefangen.');
      else if(timeout)this.finish(l,a===b?'draw':a>b?'team_A':'team_B',a===b?'Zeitlimit: Gleichstand.':'Zeitlimit: Das Team mit mehr verbliebenen Hidern gewinnt.');
      return;
    }
    if(!hiders.length){this.finish(l,this.infectionMode(l)?'infected':'hunters',this.infectionMode(l)?'Alle Hider wurden infiziert oder sind ausgeschieden.':'Alle Hider wurden gefangen oder sind ausgeschieden.');return;}
    if((l.settings.mode==='last_survivor'||l.settings.mode==='custom'&&l.settings.winCondition==='last_hider')&&hiders.length===1){this.finish(l,hiders[0].id,'Der letzte Hider gewinnt.');return;}
    if(!hunters.length){this.finish(l,'hiders','Keine aktiven Hunter mehr. Die Hider gewinnen.');return;}
    if(timeout){const winner=rules(l.settings).xpHunt?({...DEFAULT_XP,...l.settings.xp}).timeout:'hiders';this.finish(l,winner,winner==='draw'?'Zeitlimit: XP-Ziel nicht erreicht. Unentschieden.':'Zeitlimit erreicht.');}
  }
  tick():Lobby[]{
    const changes:Lobby[]=[],now=this.now();
    for(const record of this.lobbies.values()){
      const l=record as EngineLobby;
      const lastActivity=Math.max(l.createdAt,l.events.at(-1)?.at??0,...l.players.map(p=>p.lastSeen));
      if(['closed','finished'].includes(l.status)&&now-lastActivity>24*60*60*1000){this.lobbies.delete(l.id);continue;}
      if(l.status==='paused'&&now-lastActivity>24*60*60*1000){l.status='closed';this.purge(l);this.event(l,'lobby_expired','Inaktives pausiertes Match nach 24 Stunden geschlossen.');changes.push(this.changed(l));continue;}
      if(!['waiting','preparing','active','paused'].includes(l.status))continue;let changed=false;
      if(now-l.createdAt>24*60*60*1000&&l.status==='waiting'){l.status='closed';this.purge(l);this.event(l,'lobby_expired','Inaktive Lobby nach 24 Stunden geschlossen.');changes.push(this.changed(l));continue;}
      if(l.status==='waiting')for(const p of l.players){if(l._engine.players[p.id]?.lobbyGps&&!this.lobbyGpsReady(l,p)){delete l._engine.players[p.id].lobbyGps;p.ready=false;changed=true;}}
      if(l.status==='preparing'&&now>=(l.startedAt??Infinity)){l.status='active';this.event(l,'match_active','Das Match läuft.');changed=true;}
      if(l.status==='active'||l.status==='preparing'){
        for(const p of l.players.filter(playing))if(!p.connected&&now-p.lastSeen>=l.settings.disconnectGraceSeconds*1000){
          if(l.settings.disconnectBehavior==='eliminate'){this.eliminate(l,p,'disconnect','Verbindung nach Ablauf der Wiederverbindungsfrist getrennt.');changed=true;}
        }
      }
      if(l.status==='active'){
        if(rules(l.settings).apocalypse){
          const elapsed=(now-(l.startedAt??now))/1000;let phase=0;l.settings.phases.forEach((p,i)=>{if(elapsed>=p.afterSeconds)phase=i;});
          if(phase!==l._engine.phase){
            const planned=l._engine.zonePhases?.[phase];
            const scaled=planned??transformScale(clone(l.zone!.feature),l.settings.phases[phase].scale);
            const clipped=planned?clone(planned):intersect(featureCollection([scaled,l.zone!.feature]));
            if(!clipped){l._engine.phase=phase;this.event(l,'unsafe_zone','Verkleinerung übersprungen: Die bisherige sichere Zone bleibt bestehen.');}
            else{l.activeZone=clipped.geometry.type==='Polygon'?clipped as Feature<Polygon>:clipped.geometry.coordinates.map(c=>polygon(c)).sort((a,b)=>area(b)-area(a))[0];l._engine.phase=phase;this.event(l,'zone_shrunk',`Zone verkleinert: Phase ${phase+1}.`);for(const p of l.players)this.freezeOutside(l,p);}
            if(rules(l.settings).xpHunt&&l.xpHunt?.point&&!safeXpPosition(l.xpHunt.point,l.zone!,l.activeZone!,l.settings))this.nextXp(l);
            changed=true;
          }
        }
        for(const p of l.players.filter(playing)){
          const meta=l._engine.players[p.id];
          if(meta.lastReliableOutside&&(!p.location||now-Math.min(p.location.timestamp,meta.lastLocationAt??0)>Math.min(15,l.settings.gpsToleranceSeconds)*1000)){this.freezeOutside(l,p);changed=true;}
          if(this.publishDuePin(l,p))changed=true;
          // Elimination requires a second/current accurate GPS sample in observeBoundary, never a blind timer tick.
          if(p.role==='hider'&&p.nextPinAt!==undefined&&now>p.nextPinAt+l.settings.gpsToleranceSeconds*1000&&!meta.missedPin){meta.missedPin=true;this.event(l,'gps_due',`${p.username}: GPS-Pin überfällig. App im Vordergrund öffnen.`,p.id);changed=true;}
        }
        const pins=l.pins.filter(pin=>pin.expiresAt>now),captures=l.captures.filter(c=>now-c.createdAt<30_000);if(pins.length!==l.pins.length||captures.length!==l.captures.length){l.pins=pins;l.captures=captures;changed=true;}
        const before=l.status;this.evaluate(l);if(l.status!==before)changed=true;
      }
      if(l.status==='paused')for(const p of l.players)this.freezeOutside(l,p,l.pausedAt??now);
      l._engine.lastTick=now;if(changed)changes.push(this.changed(l));
    }
    return changes;
  }
}
