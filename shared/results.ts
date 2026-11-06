import type {GameEvent,Lobby,LobbyView,AccountProgress} from './types';
import type {BadgeMetric,BadgeOverview,PlayerBadge} from './achievements';
export function personalResult(lobby:LobbyView):'won'|'lost'|'neutral'{
 const winner=lobby.result?.winner,self=lobby.self;
 if(!winner||['draw','aborted','deleted_player'].includes(winner)||self.role==='spectator')return'neutral';
 if(winner===self.id)return'won';
 if(['A','B','team_A','team_B'].includes(winner))return winner.replace('team_','')===self.team?'won':'lost';
 if(winner==='hiders')return self.role==='hider'&&!!lobby.result?.survivors.includes(self.id)?'won':'lost';
 if(winner==='hunters')return ['hunter','zombie'].includes(self.role)?'won':'lost';
 if(['infected','zombies'].includes(winner))return['hunter','zombie'].includes(self.role)?'won':'lost';
 return'lost';
}

export interface MatchTimelineItem {id:string;at:number;kind:'capture'|'role'|'xp'|'phase'|'match';message:string;personal:boolean;}
export interface MatchBadgeProgress {badge:PlayerBadge;added:number;}
export interface MatchReview {
 matchId:string;simulation:boolean;timeline:MatchTimelineItem[];timelineLimited:boolean;
 highlights:{captures:number|null;huntPoints:number|null;survived:boolean;won:boolean};
 rewards:{status:'awarded'|'limited'|'ineligible'|'guest'|'spectator'|'simulation';xp:number|null;totalXp:number|null;reason:string;badges:MatchBadgeProgress[]};
}
export interface RecordedBadgeAward {captures:number;hider_win:boolean;hunt_points:number;win:boolean;survival:boolean;}
export type ReviewLobby=Lobby&{_engine?:{stats?:Record<string,{captures:number;points:number}>;leftIds?:string[]}};
export function resultTimeline(lobby:Lobby,user:string):MatchTimelineItem[]{
 const name=(id?:string)=>lobby.players.find(p=>p.id===id)?.username??'Ein Spieler';
 const describe=(event:GameEvent):Pick<MatchTimelineItem,'kind'|'message'>|null=>{
  switch(event.type){
   case 'capture':case 'captured':return{kind:'capture',message:`${name(event.actorId)} hat ${name(event.targetId)} gefangen.`};
   case 'infection':case 'infected':return{kind:'role',message:`${name(event.targetId)} wurde infiziert.`};
   case 'infection_ack':return{kind:'role',message:`${name(event.actorId)} ist dem Hunter-Team beigetreten.`};
   case 'healed':return{kind:'role',message:`${name(event.targetId)} ist wieder Hider.`};
   case 'xp_collected':return{kind:'xp',message:`${name(event.actorId)} hat einen XP-Punkt eingesammelt.`};
   case 'zone_shrunk':return{kind:'phase',message:'Die Spielzone wurde verkleinert.'};
   case 'zone_elimination':return{kind:'phase',message:`${name(event.targetId)} ist nach bestätigter Zonenüberschreitung ausgeschieden.`};
   case 'match_started':return{kind:'match',message:'Die Rollen wurden verteilt.'};
   case 'match_active':return{kind:'match',message:'Das Match läuft.'};
   case 'match_finished':return{kind:'match',message:'Das Match wurde beendet.'};
   default:return null;
  }
 };
 const seen=new Set<string>();
 return lobby.events.flatMap(event=>{const item=describe(event);if(!item||seen.has(event.id)||!Number.isFinite(event.at)||event.at>(lobby.result?.endedAt??Infinity))return[];seen.add(event.id);return[{...item,id:event.id,at:event.at,personal:event.actorId===user||event.targetId===user}];}).sort((a,b)=>a.at-b.at);
}
/** Read-only presentation of trusted server state and recorded reward ledgers.
 * No estimated XP and no reward writes are performed here. */
export function matchReview(lobby:ReviewLobby,user:string,input:{badges:BadgeOverview;xp:number|null;progress:AccountProgress|null;badgeAward:RecordedBadgeAward|null;simulation?:boolean}):MatchReview{
 const self=lobby.players.find(p=>p.id===user);if(!self||lobby.status!=='finished'||!lobby.result)throw Error('Das abgeschlossene Match ist nicht verfügbar.');
 const stats=lobby._engine?.stats?.[user],registered=input.badges.registered,simulation=!!input.simulation;
 const survived=self.role==='hider'&&lobby.result.survivors.includes(user),won=personalResult({...lobby,self,serverTime:lobby.result.endedAt} as LobbyView)==='won';
 let status:MatchReview['rewards']['status'],reason:string;
 if(simulation){status='simulation';reason='Simulation: Es werden keine Account-XP oder echten Badges vergeben.';}
 else if(!registered){status='guest';reason='Gastspiel: Dauerhafter Account-Fortschritt benötigt ein registriertes Konto.';}
 else if(self.role==='spectator'){status='spectator';reason='Zuschauer erhalten für diese Runde keine Account-XP oder Spiel-Badge-Fortschritte.';}
 else if(input.xp!==null){status=input.xp>0?'awarded':'limited';reason=input.xp>0?'Account-XP wurden für diese Runde gespeichert.':'Für diese Runde wurden 0 Account-XP gebucht: Das tägliche XP- oder Matchlimit ist erreicht.';}
 else {status='ineligible';reason=lobby.result.winner==='aborted'?'Das Match wurde ohne Wertung beendet.':lobby.startedAt!==undefined&&lobby.result.endedAt-lobby.startedAt<300000?'Diese Runde war kürzer als fünf Minuten und zählt nicht für Account-XP oder Spiel-Badges.':lobby._engine?.leftIds?.includes(user)?'Vorzeitig verlassene Runden zählen nicht für Account-XP oder Spiel-Badges.':'Für diese Runde wurde keine Belohnung gebucht. Gewertet werden reguläre Runden ab fünf Minuten mit mindestens zwei registrierten Teilnehmern; tägliche Limits gelten.';}
 const award=input.badgeAward,metrics:Partial<Record<BadgeMetric,number>>=award?{captures:award.captures,hiderWins:Number(award.hider_win),games:1,huntPoints:award.hunt_points,wins:Number(award.win),survivals:Number(award.survival)}:{};
 return {matchId:lobby.id,simulation,timeline:resultTimeline(lobby,user),timelineLimited:!lobby.events.some(event=>event.type==='match_started'),highlights:{captures:stats?Math.max(0,stats.captures):null,huntPoints:stats?Math.max(0,stats.points):lobby.xpHunt?.byPlayer[user]??null,survived,won},rewards:{status,xp:simulation?null:input.xp,totalXp:simulation?null:input.progress?.total_xp??null,reason,badges:input.badges.badges.flatMap(badge=>{const added=metrics[badge.metric]??0;return added>0?[{badge,added}]:[];})}};
}
