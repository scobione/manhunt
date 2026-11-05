/** Actual PostgreSQL migrations, isolated synthetic users and server engine snapshots. */
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {GameEngine} from '../server/engine';
import {DEFAULT_BADGES,badgeLevel} from '../shared/achievements';
import type {Lobby} from '../shared/types';
let db:PGlite;
const ids=['10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003'];
const cutoff='20261105082755_rematch_and_achievement_metrics.sql';
async function rpc(name:string,args:unknown[]){await db.exec('set role service_role');await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");try{return(await db.query<{value:any}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0]?.value;}finally{await db.exec('reset role');}}
beforeAll(async()=>{db=new PGlite({extensions:{pgcrypto}});await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));for(const f of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<=cutoff).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));},30000);
beforeEach(async()=>{await db.exec('truncate auth.users cascade');for(const id of ids)await db.query('insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values($1,$2,now())',[id,{username:'Round_'+id.slice(0,6)}]);});
afterAll(async()=>db?.close());
function fixture(mode:'normal'|'zombie'='normal'){
 let now=Date.now()+20;const engine=new GameEngine({now:()=>now});const profiles=ids.map((id,i)=>({id,username:`Isolated${i}`,avatar_url:null,friend_code:`TEST${i}`,show_online:false}));const l=engine.create(profiles[0],{mode,durationSeconds:600,preparationSeconds:0,headStartSeconds:0,randomRoles:false,captureMethod:'code'});for(const p of profiles.slice(1))engine.join(l.code,p);engine.command(l.id,ids[0],{type:'zone',zone:{name:'ISOLATED NEW METRICS',feature:circle([13.4,52.5],.5),excluded:[],confirmed:true}});engine.command(l.id,ids[0],{type:'assign',playerId:ids[0],role:'hunter',team:'A'});for(const id of ids){engine.command(l.id,id,{type:'location_check',location:{longitude:13.4,latitude:52.5,accuracy:3,timestamp:now}});engine.command(l.id,id,{type:'ready',ready:true});}engine.command(l.id,ids[0],{type:'start'});
 const advance=(ms:number)=>{now+=ms;engine.tick();};const captures=()=>{for(const targetId of ids.slice(1)){const code=engine.view(l.id,targetId).self.captureCode!;engine.command(l.id,ids[0],{type:'capture',targetId,code});}};
 return{engine,l,advance,captures,state:()=>engine.snapshot().find(v=>v.id===l.id)!};
}
it('ACH-NEW-01 winners and surviving hiders are counted only from eligible finished server snapshots, once',async()=>{
 const t=fixture();t.advance(600000);expect(t.l.result?.winner).toBe('hiders');await rpc('save_game_checkpoint',[t.state()]);await rpc('save_game_checkpoint',[t.state()]);
 const rows=(await db.query<any>('select user_id,wins,survivals from achievement_counters order by user_id')).rows;expect(rows.map(v=>[v.user_id,Number(v.wins),Number(v.survivals)])).toEqual([[ids[0],0,0],[ids[1],1,1],[ids[2],1,1]]);
 const hider=await rpc('read_player_badges',[ids[1]]);expect(hider.badges.find((b:any)=>b.id==='winner')).toMatchObject({level:1,progress:1});expect(hider.badges.find((b:any)=>b.id==='survivor')).toMatchObject({level:1,progress:1});
 const hunter=await rpc('read_player_badges',[ids[0]]);expect(hunter.badges.find((b:any)=>b.id==='winner').level).toBe(0);
});
it('ACH-NEW-02 hunter/infected winners receive wins but caught hiders do not receive survival credit',async()=>{
 const t=fixture('zombie');t.advance(300000);t.captures();expect(t.l.result?.winner).toBe('infected');await rpc('save_game_checkpoint',[t.state()]);
 const values=(await db.query<any>('select wins,survivals from achievement_counters')).rows;expect(values).toHaveLength(3);expect(values.every(v=>Number(v.wins)===1&&Number(v.survivals)===0)).toBe(true);
});
it('ACH-NEW-03 short/aborted games, guests and historical results cannot fabricate new milestones',async()=>{
 const short=fixture();short.advance(1000);short.captures();await rpc('save_game_checkpoint',[short.state()]);expect((await db.query('select * from achievement_counters')).rows).toHaveLength(0);
 const aborted=fixture();aborted.engine.command(aborted.l.id,ids[0],{type:'end'});await rpc('save_game_checkpoint',[aborted.state()]);expect((await db.query('select * from achievement_counters')).rows).toHaveLength(0);
 const old=fixture();old.advance(600000);const state=old.state();state.result!.endedAt=Date.now()-86400000;state.startedAt=state.result!.endedAt-600000;await rpc('save_game_checkpoint',[state]);expect((await db.query('select * from achievement_counters where wins>0 or survivals>0')).rows).toHaveLength(0);
});
it('REMATCH-SQL-01 same invitation code carries into a new persisted round while immutable old history remains',async()=>{
 const t=fixture();t.advance(600000);const first=t.state();await rpc('save_game_checkpoint',[first]);const next=t.engine.command(t.l.id,ids[0],{type:'rematch'});await rpc('save_game_checkpoint',[t.engine.snapshot().find(l=>l.id===next.id)!]);
 expect((await db.query('select * from lobbies where code=$1',[first.code])).rows).toHaveLength(2);expect((await db.query('select * from game_sessions')).rows).toHaveLength(1);expect((await db.query('select * from match_results where session_id=$1',[first.id])).rows).toHaveLength(3);expect((await db.query('select state from game_checkpoints where id=$1',[first.id])).rows[0]).toBeTruthy();
 const original=await rpc('read_player_badges',[ids[1]]);await rpc('save_game_checkpoint',[{...first,revision:first.revision+1}]);expect((await rpc('read_player_badges',[ids[1]])).badges).toEqual(original.badges);
 const conflicting={...structuredClone(next),id:randomUUID()};await expect(rpc('save_game_checkpoint',[conflicting])).rejects.toThrow(/lobbies_open_code/);
});
it('ACH-NEW-04 new metrics have ten increasing tiers and locked level zero, with no retrospective account-progression reuse',()=>{for(const id of ['winner','survivor']){const def=DEFAULT_BADGES.find(d=>d.id===id)!;expect(def.thresholds).toHaveLength(10);expect(def.stageNames).toHaveLength(10);expect(badgeLevel(def,0)).toBe(0);expect(badgeLevel(def,1)).toBe(1);expect(badgeLevel(def,250)).toBe(10);}});
