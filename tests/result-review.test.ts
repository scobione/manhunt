/** All identities, state and database rows here are isolated automated fixtures. */
import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GameEngine} from '../server/engine';
import {SupabaseFeatureStore} from '../server/feature-store';
import {FeatureService} from '../server/features';
import {TestFeatureStore} from './feature-fixtures';
import {matchReview,personalResult,resultTimeline,type ReviewLobby} from '../shared/results';
import {DEFAULT_SETTINGS,type AccountProgress} from '../shared/types';
import {DEFAULT_BADGES,advanceBadges,emptyCounters,type BadgeOverview} from '../shared/achievements';
import {DEFAULT_QUESTIONS,validateFeedback} from '../shared/feedback';

const user=randomUUID(),other=randomUUID(),outsider=randomUUID(),start=1_800_000_000_000;
function fixture():ReviewLobby{
 const engine=new GameEngine({now:()=>start}),l=engine.create({id:user,username:'ReviewHunter',avatar_url:null,friend_code:'TESTONLY',show_online:false},DEFAULT_SETTINGS);
 l.players.push({...l.players[0],id:other,username:'ReviewHider',role:'hider'});l.players[0].role='hunter';
 l.status='finished';l.startedAt=start;l.result={winner:'hunters',reason:'Alle Hider gefangen.',endedAt:start+600000,survivors:[]};
 l.events=[{id:'start',type:'match_started',at:start,message:'Rollen verteilt.'},{id:'private',type:'pin_published',at:start+1000,message:'GPS PRIVATE 52.52 13.405',actorId:other},{id:'capture',type:'capture',at:start+10000,actorId:user,targetId:other,message:'Old Name should not be retained'},{id:'infect',type:'infection',at:start+10001,actorId:user,targetId:other,message:'private raw payload'},{id:'join',type:'infection_ack',at:start+11000,actorId:other,message:'ack'},{id:'xp',type:'xp_collected',at:start+12000,actorId:user,message:'xp'},{id:'end',type:'match_finished',at:start+600000,message:'end'}];
 const raw=l as ReviewLobby;raw._engine={...raw._engine,stats:{[user]:{captures:14,points:7}}};return raw;
}
const progress:AccountProgress={total_xp:777,games:12,wins:6,losses:5,draws:1,captures:20,survivals:3,hunt_points:7};
function badges(registered=true):BadgeOverview{const counters=emptyCounters();counters.captures=20;counters.games=12;return{registered,badges:advanceBadges(DEFAULT_BADGES,counters,[],start),selected:null,notices:[]};}
const input=()=>({badges:badges(),xp:17,progress,badgeAward:{captures:14,hider_win:false,hunt_points:7,win:true,survival:false}});

describe('result review',()=>{
 it('RESULT-01: timeline uses actual milestones, current participant names and no private GPS/chat payload',()=>{
  const l=fixture(),timeline=resultTimeline(l,user),raw=JSON.stringify(timeline);
  expect(timeline.map(e=>e.kind)).toEqual(['match','capture','role','role','xp','match']);
  expect(timeline.find(e=>e.id==='capture')).toMatchObject({personal:true,message:'ReviewHunter hat ReviewHider gefangen.'});
  expect(raw).not.toContain('GPS PRIVATE');expect(raw).not.toContain('52.52');expect(raw).not.toContain('private raw payload');expect(raw).not.toContain('Old Name');
  l.events.push({...l.events[2]});expect(resultTimeline(l,user).filter(e=>e.id==='capture')).toHaveLength(1);
 });
 it('RESULT-02: exact server statistics and recorded XP differ from any estimated formula',()=>{
  const l=fixture(),review=matchReview(l,user,input());expect(review.highlights).toMatchObject({captures:14,huntPoints:7,won:true,survived:false});
  expect(review.rewards).toMatchObject({xp:17,totalXp:777,status:'awarded'});expect(review.rewards.badges.find(b=>b.badge.id==='hunter')).toMatchObject({added:14,badge:{level:2,progress:20}});
  expect(review.rewards.badges.find(b=>b.badge.id==='veteran')?.added).toBe(1);expect(review.rewards.badges.some(b=>b.badge.id==='beta-tester')).toBe(false);
 });
 it('RESULT-03: retained timeline is explicit, unknown statistics are not invented',()=>{
  const l=fixture();l.events=l.events.slice(2);delete l._engine!.stats;const review=matchReview(l,user,{...input(),xp:null,badgeAward:null});
  expect(review.timelineLimited).toBe(true);expect(review.highlights.captures).toBeNull();expect(review.highlights.huntPoints).toBeNull();expect(review.rewards.badges).toEqual([]);
 });
 it('RESULT-04: guests, spectators, short matches and daily caps have distinct truthful statuses',()=>{
  const l=fixture();expect(matchReview(l,user,{...input(),badges:badges(false),xp:null}).rewards.status).toBe('guest');
  const p=l.players[0];p.role='spectator';expect(matchReview(l,user,{...input(),xp:null}).rewards.status).toBe('spectator');p.role='hunter';
  l.result!.endedAt=start+20000;expect(matchReview(l,user,{...input(),xp:null,badgeAward:null}).rewards.reason).toContain('kürzer als fünf Minuten');
  expect(matchReview(l,user,{...input(),xp:0}).rewards.status).toBe('limited');
  l.result!.winner='aborted';expect(matchReview(l,user,{...input(),xp:null}).rewards.reason).toContain('ohne Wertung');
 });
 it('RESULT-05: simulations show isolated progress without real XP or modifying any source',()=>{
  const l=fixture(),v=input(),before=JSON.stringify({l,v});const review=matchReview(l,user,{...v,simulation:true});expect(review.simulation).toBe(true);expect(review.rewards).toMatchObject({status:'simulation',xp:null,totalXp:null});expect(JSON.stringify({l,v})).toBe(before);
 });
 it('RESULT-06: XP-Jagd plus Zombie timeout awards a Hunter-team win to zombies consistently',()=>{
  const l=fixture();l.settings={...l.settings,rules:{xpHunt:true,zombie:true,apocalypse:false},xp:{target:10,radiusMeters:30,minDistanceMeters:100,boundaryBufferMeters:25,exclusionBufferMeters:25,goal:'team',timeout:'hunters'}};l.players[0].role='zombie';
  const view={...l,self:l.players[0],serverTime:l.result!.endedAt};expect(personalResult(view)).toBe('won');expect(matchReview(l,user,input()).highlights.won).toBe(true);
 });
});

class ReadDatabase{
 calls:{table:string;filters:Record<string,unknown>}[]=[];
 constructor(readonly rows:Record<string,Record<string,unknown>[]>,readonly overview=badges()){}
 rpc(){return Promise.resolve({data:this.overview,error:null});}
 from(table:string){const filters:Record<string,unknown>={},call={table,filters};this.calls.push(call);const query={select:(_fields:string)=>query,eq:(field:string,value:unknown)=>{filters[field]=value;return query;},maybeSingle:async()=>({data:this.rows[table]?.find(row=>Object.entries(filters).every(([k,v])=>row[k]===v))??null,error:null})};return query;}
}
describe('result authorization and reward reads',()=>{
 it('RESULT-AUTH-01: strangers cannot fetch private checkpoints and unfinished states stay pending',async()=>{
  const l=fixture(),db=new ReadDatabase({game_participants:[{session_id:l.id,user_id:user}],game_checkpoints:[{id:l.id,state:l}]});const store=new SupabaseFeatureStore(db as unknown as SupabaseClient);
  await expect(store.matchReview(outsider,l.id)).rejects.toMatchObject({status:404});expect(db.calls.some(c=>c.table==='game_checkpoints')).toBe(false);
  l.status='active';await expect(store.matchReview(user,l.id)).rejects.toMatchObject({status:409});expect(db.calls.some(c=>c.table==='xp_rewards')).toBe(false);
 });
 it('RESULT-AUTH-02: only own reward and badge ledgers are used; no write API exists',async()=>{
  const l=fixture(),db=new ReadDatabase({game_participants:[{session_id:l.id,user_id:user}],game_checkpoints:[{id:l.id,state:l}],xp_rewards:[{session_id:l.id,user_id:other,amount:500},{session_id:l.id,user_id:user,amount:9}],account_progress:[{user_id:user,...progress}],badge_match_awards:[{match_id:l.id,user_id:user,captures:14,hunt_points:7,hider_win:false,win:true,survival:false}]});
  const store=new SupabaseFeatureStore(db as unknown as SupabaseClient),review=await store.matchReview(user,l.id);expect(review.rewards.xp).toBe(9);expect(review.rewards.totalXp).toBe(777);expect(db.calls.find(c=>c.table==='xp_rewards')?.filters).toEqual({session_id:l.id,user_id:user});
  const service=new FeatureService(store),identity={id:user,username:'ReviewHunter',isGuest:false,sessionId:randomUUID(),expiresAt:Date.now()+60000};await expect(service.player(identity,'/badges/match','POST',{amount:9999},new URLSearchParams({matchId:l.id}))).rejects.toMatchObject({status:404});
 });
 it('FEED-ISSUES-01: concrete issues remain optional and previous questionnaire snapshots keep their choices',async()=>{
  const store=new TestFeatureStore(),l=fixture();store.config.questions=structuredClone(DEFAULT_QUESTIONS);store.config.questions.find(q=>q.id==='improve')!.options=['Karte','Standort'];store.finish(l);const old=(await store.offer(user,l.id))!;
  await store.configure({version:'1',questions:structuredClone(DEFAULT_QUESTIONS)});const frozen=(await store.offer(user,l.id))!;expect(frozen.version).toBe(old.version);expect(frozen.questions.find(q=>q.id==='improve')?.options).toEqual(['Karte','Standort']);
  expect(validateFeedback(DEFAULT_QUESTIONS,{improve:['GPS / Standort','Fangen']})).toEqual({improve:['GPS / Standort','Fangen']});expect(validateFeedback(DEFAULT_QUESTIONS,{})).toEqual({});
  expect(()=>validateFeedback(frozen.questions,{improve:['Fangen']})).toThrow('Ungültige Auswahl');await store.respond(user,old.id,false,{});expect((await store.badges(user)).badges.find(b=>b.id==='beta-tester')?.level).toBe(1);
 });
});
