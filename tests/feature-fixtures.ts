/** Isolated automated-test store; the SQL migration is tested separately against PostgreSQL. */
import {randomUUID} from 'node:crypto';
import type {FeatureStore,FeedbackFilters} from '../server/feature-store';
import {DEFAULT_BADGES,advanceBadges,emptyCounters,equippedBadge,type BadgeDefinition,type BadgeOverview,type AchievementCounters} from '../shared/achievements';
import {DEFAULT_QUESTIONS,questionsFor,type FeedbackOffer,type FeedbackSettings,type FeedbackAnswer} from '../shared/feedback';
import type {FriendProfile} from '../shared/profiles';
import type {MemoryRepository} from '../server/repository';
import type {Lobby,LobbyView} from '../shared/types';
import {personalResult,matchReview,type RecordedBadgeAward} from '../shared/results';
import {HttpError} from '../server/auth';
export class TestFeatureStore implements FeatureStore{
 repository?:MemoryRepository;
 matchStates=new Map<string,Lobby>();
 recordedXp=new Map<string,number>();
 recordedBadgeAwards=new Map<string,RecordedBadgeAward>();
 awarded=new Set<string>();
 hidden=new Map<string,Set<string>>();
 defs=structuredClone(DEFAULT_BADGES);config:FeedbackSettings={version:'1',questions:structuredClone(DEFAULT_QUESTIONS)};values=new Map<string,BadgeOverview>();counters=new Map<string,AchievementCounters>();offers=new Map<string,FeedbackOffer&{user:string}>();answers=new Map<string,Record<string,FeedbackAnswer>>();guests=new Set<string>();
 finish(l:Lobby){this.matchStates.set(l.id,structuredClone(l));this.awards(l);if(l.status!=='finished'||l.result?.winner==='aborted')return;for(const p of l.players)if(p.role!=='spectator'&&![...this.offers.values()].some(o=>o.user===p.id&&o.matchId===l.id)){const o={id:randomUUID(),user:p.id,matchId:l.id,version:this.config.version,questions:questionsFor(l.settings,this.config.questions),modes:[l.settings.mode],status:'offered' as const,offeredAt:new Date().toISOString()};this.offers.set(o.id,o);}}
 private awards(l:Lobby){
  if(this.awarded.has(l.id)||l.status!=='finished'||!l.result||l.result.winner==='aborted')return;
  this.awarded.add(l.id);const state=l as Lobby&{_engine?:{leftIds?:string[];stats?:Record<string,{captures:number;points:number}>}};
  if(!Number.isFinite(l.startedAt)||!Number.isFinite(l.result.endedAt)||l.result.endedAt-l.startedAt!<300000||!Array.isArray(l.result.survivors)||l.players.filter(p=>p.role!=='spectator'&&!this.guests.has(p.id)).length<2)return;
  for(const p of l.players){if(this.guests.has(p.id)||p.role==='spectator'||state._engine?.leftIds?.includes(p.id))continue;const counters=this.counters.get(p.id)??emptyCounters(),previous=this.values.get(p.id)?.badges??[],stats=state._engine?.stats?.[p.id];counters.games++;counters.captures+=Math.min(40,stats?.captures??0);counters.huntPoints+=Math.min(100,stats?.points??0);const won=personalResult({...l,self:p} as LobbyView)==='won';if(won)counters.wins++;const survived=p.role==='hider'&&l.result.survivors.includes(p.id);if(survived){counters.survivals++;if(won)counters.hiderWins++;}
   const captures=Math.min(40,stats?.captures??0),points=Math.min(100,stats?.points??0),key=`${l.id}:${p.id}`;
   this.recordedBadgeAwards.set(key,{captures,hider_win:survived&&won,hunt_points:points,win:won,survival:survived});
   // Explicitly isolated counterparts of the production ledgers. The browser
   // still reads recorded rows through the same permission-checked API.
   const previousXp=[...this.recordedXp].filter(([k])=>k.endsWith(':'+p.id));
   const reward=previousXp.length>=5?0:Math.min(Math.max(0,500-previousXp.reduce((sum,[,amount])=>sum+amount,0)),20+(won?30:0)+Math.min(100,captures*10)+Math.min(100,points*5)+(survived?20:0));
   this.recordedXp.set(key,reward);
   const profile=this.repository?.profiles.get(p.id);if(profile){const before=profile.progress??{total_xp:0,games:0,wins:0,losses:0,draws:0,captures:0,survivals:0,hunt_points:0};profile.progress={total_xp:before.total_xp+reward,games:before.games+1,wins:before.wins+Number(won),losses:before.losses+Number(!won&&l.result.winner!=='draw'),draws:before.draws+Number(l.result.winner==='draw'),captures:before.captures+captures,survivals:before.survivals+Number(survived),hunt_points:before.hunt_points+points};}
   this.counters.set(p.id,counters);const v=this.values.get(p.id)??{registered:true,badges:[],selected:null,notices:[]};v.badges=advanceBadges(this.defs,counters,previous,Date.now());this.values.set(p.id,v);}
 }

 async badges(user:string){const v=structuredClone(this.values.get(user)??{registered:!this.guests.has(user),badges:advanceBadges(this.defs,emptyCounters(),[],Date.now()),selected:null,notices:[]});v.visibleBadgeIds=v.badges.filter(b=>b.level>0&&!this.hidden.get(user)?.has(b.id)).map(b=>b.id);if(v.selected&&!v.visibleBadgeIds.includes(v.selected.id))v.selected=null;return v;}
 async matchReview(user:string,id:string){const lobby=this.repository?.checkpoints.get(id)??this.matchStates.get(id);if(!lobby||!lobby.players.some(p=>p.id===user))throw new HttpError(404,'Dieses Match ist nicht verfügbar.');if(lobby.status!=='finished'||!lobby.result)throw new HttpError(409,'Das Ergebnis wird noch gespeichert.');return matchReview(lobby,user,{badges:await this.badges(user),xp:this.recordedXp.get(`${id}:${user}`)??null,progress:this.repository?.profiles.get(user)?.progress??null,badgeAward:this.recordedBadgeAwards.get(`${id}:${user}`)??null});}
 async visibility(user:string,id:string,visible:boolean){const v=await this.badges(user);if(this.guests.has(user)||!v.badges.some(b=>b.id===id&&b.level>0))throw new HttpError(409,'Badge gesperrt.');const hidden=this.hidden.get(user)??new Set<string>();if(visible)hidden.delete(id);else hidden.add(id);this.hidden.set(user,hidden);if(!visible&&v.selected?.id===id)v.selected=null;this.values.set(user,v);if(this.repository?.profiles.get(user))this.repository.profiles.get(user)!.badge=v.selected;return this.badges(user);}
 async profile(viewer:string,target:string):Promise<FriendProfile>{const repo=this.repository,profile=repo?.profiles.get(target);if(!repo||!profile||await repo.hasBlock(viewer,target)||viewer!==target&&!repo.friendships.has([viewer,target].sort().join(':')))throw new HttpError(404,'Dieses Profil ist nicht verfügbar.');const data=await this.badges(target);return{id:profile.id,username:profile.username,avatar_url:profile.avatar_url,created_at:profile.created_at,progress:profile.progress??null,badges:data.badges.filter(b=>b.level>0&&data.visibleBadgeIds?.includes(b.id)).map(b=>({...equippedBadge(b)!,description:b.description,unlockedAt:b.unlockedAt!,upgradedAt:b.upgradedAt??undefined}))};}
 async equip(user:string,id:string|null){const v=await this.badges(user),b=v.badges.find(b=>b.id===id&&b.level>0);if(id&&!b)throw new HttpError(409,'Badge gesperrt.');v.selected=b?equippedBadge(b):null;if(id)this.hidden.get(user)?.delete(id);this.values.set(user,v);if(this.repository?.profiles.get(user))this.repository.profiles.get(user)!.badge=v.selected;return this.badges(user);}
 async seen(user:string,ids:string[]){const v=await this.badges(user);v.notices=v.notices.filter(n=>!ids.includes(n.id));this.values.set(user,v);}
 async offer(user:string,match:string){return structuredClone([...this.offers.values()].find(o=>o.user===user&&o.matchId===match)??null);}
 async offerById(user:string,id:string){const o=this.offers.get(id);return o?.user===user?structuredClone(o):null;}
 async respond(user:string,id:string,skip:boolean,answers:Record<string,FeedbackAnswer>){const o=this.offers.get(id);if(!o||o.user!==user)throw new HttpError(404,'Abfrage nicht gefunden.');const status=skip?'skipped':'completed';if(o.status===status)return this.badges(user);if(o.status!=='offered')throw new HttpError(409,'Bereits abgeschlossen.');o.status=status;if(!skip){this.answers.set(id,structuredClone(answers));if(!this.guests.has(user)){const old=await this.badges(user),c=this.counters.get(user)??emptyCounters();c.feedback++;this.counters.set(user,c);const badges=advanceBadges(this.defs,c,old.badges,Date.now());this.values.set(user,{...old,badges,notices:[...old.notices,...badges.filter(b=>b.level>(old.badges.find(v=>v.id===b.id)?.level??0)).map(b=>({id:randomUUID(),badgeId:b.id,name:b.name,level:b.level,at:new Date().toISOString()}))]});}}return this.badges(user);}
 async settings(){return structuredClone(this.config);}
 async configure(s:FeedbackSettings){if(s.version!==this.config.version)throw new HttpError(409,'Version geändert.');this.config={version:String(Number(s.version)+1),questions:structuredClone(s.questions)};return{version:this.config.version};}
 async feedbackReport(f:FeedbackFilters){const rows=[...this.offers.values()].filter(o=>(!f.mode||o.modes.includes(f.mode))).map(o=>({...o,userId:o.user,username:'Automated Test Player',answers:this.answers.get(o.id)??null,rating:(this.answers.get(o.id)?.overall as any)?.rating??null,recommendation:this.answers.get(o.id)?.recommend??null})).filter(o=>!f.rating||o.rating===f.rating);const complete=rows.filter(o=>o.status==='completed');return{total:rows.length,offered:rows.length,completed:complete.length,skipped:rows.filter(o=>o.status==='skipped').length,average:complete.length?complete.reduce((sum,o)=>sum+o.rating,0)/complete.length:null,ratings:{},recommendations:{},rows:rows.slice(f.page*30,(f.page+1)*30)};}
 async definitions(){return structuredClone(this.defs);}
 async updateDefinition(def:BadgeDefinition){const index=this.defs.findIndex(d=>d.id===def.id);if(index<0||this.defs[index].metric!==def.metric)throw new HttpError(400,'Ungültige Definition.');this.defs[index]=structuredClone(def);}
 async badgeHolders(badge:string|null,page:number){const players=[...this.values].flatMap(([userId,v])=>v.badges.filter(b=>b.level>0&&(!badge||badge===b.id)).map(b=>({userId,username:'Automated Test Player',badgeId:b.id,level:b.level,unlockedAt:b.unlockedAt,upgradedAt:b.upgradedAt})));return{definitions:this.defs.map(d=>({...d,unlockedPlayers:players.filter(p=>p.badgeId===d.id).length})),players:players.slice(page*30,(page+1)*30),total:players.length};}
}
