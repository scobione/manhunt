import type { Feature, Polygon } from 'geojson';
export type Mode = 'normal'|'zombie'|'apocalypse'|'hide_seek'|'last_survivor'|'team_hunt'|'infection_rush'|'custom';
export type Role = 'hunter'|'hider'|'zombie'|'spectator';
export interface AccountProgress {total_xp:number;games:number;wins:number;losses:number;draws:number;captures:number;survivals:number;hunt_points:number}
export interface Profile { progress?:AccountProgress;  id:string; username:string; avatar_url:string|null; friend_code:string; show_online:boolean; created_at?:string }
export interface Rules { zombie:boolean; apocalypse:boolean; xpHunt:boolean }
export interface XpSettings { target:number; radiusMeters:number; minDistanceMeters:number; boundaryBufferMeters:number; exclusionBufferMeters:number; goal:"team"|"individual"; timeout:"draw"|"hiders"|"hunters" }
export interface XpPoint { id:string; longitude:number; latitude:number; radiusMeters:number; pathId:string; label:string; confirmed:boolean }
export interface XpHunt { point?:XpPoint; collected:number; byPlayer:Record<string,number>; message?:string; lastCollector?:string; generation:number }
export interface ChatMessage { id:string; actorId:string; username:string; avatar_url:string|null; text:string; channel:"all"|"hunters"|"hiders"|"A"|"B"; at:number }
export interface Settings { rules?:Rules; xp?:XpSettings;  mode:Mode; durationSeconds:number; maxPlayers:number; hunterCount:number; hunterVisible:boolean; hunterUpdateSeconds:number; fallbackPins:boolean; fallbackPinMaxAgeSeconds:number; randomRoles:boolean; preparationSeconds:number; headStartSeconds:number; pinIntervalSeconds:number; pinLifetimeSeconds:number; pinVisibilitySeconds:number; showOldPins:boolean; maxAccuracyMeters:number; gpsToleranceSeconds:number; captureMethod:'qr'|'confirmation'|'code'|'proximity'; captureRadiusMeters:number; infectionDelaySeconds:number; zombieVisible:boolean; zombieGps:boolean; allowHealing:boolean; outsideGraceSeconds:number; outsideReset:boolean; spectatorsAllowed:boolean; disconnectGraceSeconds:number; disconnectBehavior:'continue'|'eliminate'; notifications:boolean; phases:{afterSeconds:number;scale:number}[]; winCondition:'survival'|'last_hider'|'infection'; }
export interface Zone { feature:Feature<Polygon>; excluded:Feature<Polygon>[]; confirmed:boolean; name:string; shrinkTarget?:[number,number]; randomCorners?:boolean; disabledExcluded?:number[] }
export interface Player { id:string; username:string; avatar_url:string|null; ready:boolean; role:Role; team:'A'|'B'; connected:boolean; eliminated:boolean; infectedAt?:number; outsideSince?:number; outsideElapsed?:number; lastSeen:number; locationReady?:boolean; locationSharing?:boolean; infectionPending?:boolean; muted?:boolean; zoneStatus?:'inside'|'outside'|'uncertain'; outsideActive?:boolean; outsideClockAt?:number; returnPending?:boolean; nextPinAt?:number; location?:LocationSample; captureCode?:string; }
export interface LocationSample { latitude:number; longitude:number; accuracy:number; timestamp:number }
export interface Pin { id:string; playerId:string; username:string; role:Role; latitude:number; longitude:number; accuracy:number; createdAt:number; expiresAt:number; observedAt?:number; stale?:boolean; avatar_url?:string|null; kind?:'scheduled'|'live' }
export interface GameEvent { id:string; type:string; at:number; actorId?:string; targetId?:string; message:string }
export interface CaptureRequest { id:string; hunterId:string; targetId:string; createdAt:number; }
export interface MatchResult { winner:string; reason:string; endedAt:number; survivors:string[] }
export interface Lobby { xpHunt?:XpHunt;  id:string; code:string; hostId:string; status:'waiting'|'preparing'|'active'|'paused'|'finished'|'closed'; players:Player[]; settings:Settings; zone:Zone|null; activeZone?:Feature<Polygon>; createdAt:number; startedAt?:number; endsAt?:number; pausedAt?:number; previousStatus?:'preparing'|'active'; pins:Pin[]; events:GameEvent[]; captures:CaptureRequest[]; result?:MatchResult; revision:number; }
export interface LobbyView extends Omit<Lobby,'players'> { players:Omit<Player,'location'|'captureCode'>[]; self:Player & {captureQr?:{token:string;expiresAt:number}}; serverTime:number; visibleLocations?:Pin[]; chat?:ChatMessage[]; }
export type Command =
 | {type:'pause'} | {type:'resume'} | {type:'end'} | {type:'draw_teams'}
 | {type:'chat';channel:'all'|'team';text:string} | {type:'mute';playerId:string;muted:boolean}
 | {type:'xp_regenerate'} | {type:'xp_confirm';pointId:string} | {type:'xp_collect';pointId:string}
 | {type:'location_check';location:LocationSample}
 | {type:'ready';ready:boolean} | {type:'settings';settings:Settings} | {type:'zone';zone:Zone}
 | {type:'assign';playerId:string;role:Role;team:'A'|'B'} | {type:'kick';playerId:string} | {type:'transfer';playerId:string}
 | {type:'stop_location'} | {type:'zone_return_ack'} | {type:'start'} | {type:'leave'} | {type:'close'}
 | {type:'location';location:LocationSample;publish?:boolean} | {type:'capture';targetId:string;code?:string;qrToken?:string}
 | {type:'confirm_capture';captureId:string;accept:boolean} | {type:'infection_ack'} | {type:'heal';playerId:string};
export const MODES:{id:Mode;name:string;description:string;tag:string}[]=[
{id:'normal',name:'NORMAL',description:'Hunter fangen Hider. Überlebt ein Hider bis zum Zeitlimit, gewinnen die Hider.',tag:'DER KLASSIKER'},
{id:'zombie',name:'ZOMBIE',description:'Jeder Fang verändert die Seiten. Die Infektion breitet sich aus.',tag:'ÜBERLEBEN'},
{id:'apocalypse',name:'APOKALYPSE',description:'Die Zone schrumpft. Der Druck steigt. Finde deinen Ausweg.',tag:'KEIN ZURÜCK'},
{id:'hide_seek',name:'HIDE & SEEK',description:'Kurze Signale. Lange Schatten. Nutze die Zeit zwischen den Pins.',tag:'TAKTIK'},
{id:'last_survivor',name:'LAST SURVIVOR',description:'Nur ein Hider bleibt übrig. Halte länger durch als alle anderen.',tag:'ALLEIN GEGEN ALLE'},
{id:'team_hunt',name:'TEAM HUNT',description:'Zwei Teams. Jedes mit Huntern und Hidern. Schütze dein Team.',tag:'ZUSAMMEN'},
{id:'infection_rush',name:'INFECTION RUSH',description:'Schnelle Pins, schnelle Infektion. Keine Zeit zum Stillstehen.',tag:'TEMPO'},
{id:'custom',name:'CUSTOM',description:'Lege Regeln und Siegbedingungen selbst fest.',tag:'FREIE REGELN'}];
export const DEFAULT_SETTINGS:Settings={mode:'normal',durationSeconds:1800,maxPlayers:12,hunterCount:1,hunterVisible:true,hunterUpdateSeconds:3,fallbackPins:true,fallbackPinMaxAgeSeconds:600,randomRoles:true,preparationSeconds:30,headStartSeconds:60,pinIntervalSeconds:300,pinLifetimeSeconds:600,pinVisibilitySeconds:30,showOldPins:true,maxAccuracyMeters:50,gpsToleranceSeconds:30,captureMethod:'qr',captureRadiusMeters:30,infectionDelaySeconds:10,zombieVisible:false,zombieGps:false,allowHealing:false,outsideGraceSeconds:60,outsideReset:true,spectatorsAllowed:false,disconnectGraceSeconds:120,disconnectBehavior:'continue',notifications:true,phases:[{afterSeconds:0,scale:1},{afterSeconds:360,scale:.75},{afterSeconds:720,scale:.5},{afterSeconds:1080,scale:.25},{afterSeconds:1440,scale:.1}],winCondition:'survival'};
