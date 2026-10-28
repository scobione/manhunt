import {emptyBuckets} from '../shared/traffic';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {circle} from '@turf/turf';
import {GameEngine} from '../server/engine';
import {shrinkPlan} from '../shared/zones';
import { DEFAULT_SETTINGS, type Lobby } from '../shared/types';

// All IDs, profiles and GPS coordinates below are isolated automated TEST fixtures.
const a='10000000-0000-4000-8000-000000000001';
const b='20000000-0000-4000-8000-000000000002';
const c='30000000-0000-4000-8000-000000000003';
let db:PGlite;
async function userRole(id:string, sql:string, params:unknown[]=[]){
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,session_id:id})]);
 try{return await db.query(sql,params);}finally{await db.exec('reset role');}
}
async function rpc(name:string,args:unknown[]){
 await db.exec('set role service_role');
 try{return await db.query<{value:unknown}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);}finally{await db.exec('reset role');}
}
async function friendCode(id:string){return (await db.query<{friend_code:string}>('select friend_code from profiles where id=$1',[id])).rows[0].friend_code;}
async function befriend(){const request=await rpc('request_friend',[a,await friendCode(b)]);const id=(request.rows[0].value as {id:string}).id;await rpc('respond_friend',[b,id,true]);return id;}
function state():Lobby{
 const now=Date.now();
 return {id:randomUUID(),code:'ABC123',hostId:a,status:'active',players:[a,b].map((id,i)=>({id,username:i?'TestHider':'TestHunter',avatar_url:null,ready:true,role:i?'hider':'hunter',team:'A',connected:true,eliminated:false,lastSeen:now,captureCode:'123456',location:{latitude:52.52,longitude:13.405,accuracy:5,timestamp:now}})),settings:{...DEFAULT_SETTINGS},zone:null,createdAt:now,startedAt:now,endsAt:now+1800000,pins:[{id:randomUUID(),playerId:b,username:'TestHider',role:'hider',latitude:52.52,longitude:13.405,accuracy:5,createdAt:now,expiresAt:now+60000}],events:[],captures:[],revision:1};
}

function lastSurvivor():Lobby{
 const engine=new GameEngine();
 const profiles=[a,b,c].map((id,i)=>({id,username:`PrivacyTest${i}`,avatar_url:null,friend_code:`TESTCODE000${i}`,show_online:false}));
 const l=engine.create(profiles[0],{mode:'last_survivor',captureMethod:'confirmation',randomRoles:false,preparationSeconds:0,headStartSeconds:0});
 profiles.slice(1).forEach(p=>engine.join(l.code,p));
 engine.command(l.id,a,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],name:'ISOLATED ERASURE TEST',confirmed:true}});
 engine.command(l.id,a,{type:'assign',playerId:a,role:'hunter',team:'A'});
 [a,b,c].forEach(id=>engine.command(l.id,id,{type:'ready',ready:true}));engine.command(l.id,a,{type:'start'});
 engine.command(l.id,a,{type:'capture',targetId:b});engine.command(l.id,b,{type:'confirm_capture',captureId:l.captures[0].id,accept:true});
 expect(l.result?.winner).toBe(c);return l;
}

beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto}});
 await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
 for (const file of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 }
},30000);
beforeEach(async()=>{
 await db.exec('truncate auth.users cascade');
 for(const id of [a,b,c])await db.query('insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values($1,$2,now())',[id,{username:'Player_'+id.slice(0,8)}]);
 for(const id of [a,b,c])await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);
});
afterAll(async()=>{await db?.close();});

describe('actual PostgreSQL migration and RLS (isolated WASM database)',()=>{
 it('TRAFFIC-DB-01 cumulative reports are idempotent, isolated by player and survive reloads',async()=>{
  const lobby=state();await rpc('save_game_checkpoint',[lobby]);const client=randomUUID(),buckets=emptyBuckets();buckets.wifi.down=1024;buckets.wifi.requests=2;
  await rpc('record_match_traffic',[a,a,lobby.id,client,1,buckets]);await rpc('record_match_traffic',[a,a,lobby.id,client,1,buckets]);
  buckets.wifi.down=2048;await rpc('record_match_traffic',[a,a,lobby.id,client,2,buckets]);buckets.wifi.down=8000;await rpc('record_match_traffic',[a,a,lobby.id,client,1,buckets]);
  buckets.wifi.down=512;await rpc('record_match_traffic',[a,a,lobby.id,client,3,buckets]);await rpc('record_match_traffic',[b,b,lobby.id,randomUUID(),1,buckets]);
  const r=(await rpc('read_match_traffic',[a,a,false,lobby.id,0])).rows[0].value as any;expect(r.match.bytes).toBe(2560);expect(r.match.reporters).toBe(2);expect(r.players).toHaveLength(2);expect(r.rows.find((r:any)=>r.userId===a&&r.network==='wifi').down).toBe(2048);
  await rpc('record_match_traffic',[a,a,lobby.id,randomUUID(),1,buckets]);expect(((await rpc('read_match_traffic',[a,a,false,lobby.id,0])).rows[0].value as any).match.bytes).toBe(3072);
 });
 it('TRAFFIC-DB-02 foreign matches, stale sessions, normal-user admin reads and direct SQL are denied',async()=>{
  const lobby=state();await rpc('save_game_checkpoint',[lobby]);const buckets=emptyBuckets();
  await expect(rpc('record_match_traffic',[c,c,lobby.id,randomUUID(),1,buckets])).rejects.toThrow(/traffic_forbidden/);
  await expect(rpc('read_match_traffic',[c,c,false,lobby.id,0])).rejects.toThrow(/traffic_forbidden/);
  await expect(rpc('read_match_traffic',[a,a,true,null,0])).rejects.toThrow(/traffic_forbidden/);
  await expect(userRole(a,'select * from match_traffic')).rejects.toThrow(/permission denied/);
  await expect(userRole(a,'select read_match_traffic($1,$1,true,null,0)',[a])).rejects.toThrow(/permission denied/);
  await db.query('update account_controls set is_admin=true where user_id=$1',[c]);expect(((await rpc('read_match_traffic',[c,c,true,null,0])).rows[0].value as any).matches).toHaveLength(1);
  await db.query('delete from auth.sessions where id=$1',[c]);await expect(rpc('read_match_traffic',[c,c,true,null,0])).rejects.toThrow(/traffic_forbidden/);
 });
 it('TRAFFIC-DB-03 no retroactive values, bounded writes and expired diagnostics are removed',async()=>{
  const lobby=state();await rpc('save_game_checkpoint',[lobby]);const empty=(await rpc('read_match_traffic',[a,a,false,lobby.id,0])).rows[0].value as any;expect(empty.match.reporters).toBe(0);expect(empty.rows).toEqual([]);expect(empty.players.every((p:any)=>p.updatedAt===null)).toBe(true);
  const client=randomUUID(),buckets=emptyBuckets();buckets.cellular.up=500;
  await expect(rpc('record_match_traffic',[a,a,lobby.id,client,0,buckets])).rejects.toThrow(/traffic_invalid/);
  await expect(rpc('record_match_traffic',[a,a,lobby.id,client,1,{...buckets,ssid:'private'}])).rejects.toThrow(/traffic_invalid/);
  await rpc('record_match_traffic',[a,a,lobby.id,client,1,buckets]);await db.query("update match_traffic set updated_at=now()-interval '31 days'");expect(((await rpc('read_match_traffic',[a,a,false,lobby.id,0])).rows[0].value as any).rows).toEqual([]);
  await rpc('record_match_traffic',[a,a,lobby.id,randomUUID(),1,emptyBuckets()]);expect((await db.query('select * from match_traffic where client_id=$1',[client])).rows).toHaveLength(0);
  await db.query("update game_sessions set ended_at=now()-interval '7 hours' where id=$1",[lobby.id]);await expect(rpc('record_match_traffic',[a,a,lobby.id,randomUUID(),1,buckets])).rejects.toThrow(/traffic_forbidden/);
 });

 it('MRESET-DB-01 only a live admin may start a reset; browser RPCs cannot bypass it',async()=>{
  const lock=randomUUID(),hash='pbkdf2$'+'a'.repeat(48)+'$'+'b'.repeat(64);
  await expect(rpc('admin_begin_password_reset',[a,a,b,lock,hash])).rejects.toThrow(/admin_required/);
  await db.query('update account_controls set is_admin=true where user_id=$1',[a]);
  await expect(userRole(a,'select admin_begin_password_reset($1,$1,$2,$3,$4)',[a,b,lock,hash])).rejects.toThrow(/permission denied/);
  await expect(userRole(b,'select account_finish_password($1,$2,true)',[b,lock])).rejects.toThrow(/permission denied/);
  await expect(rpc('admin_begin_password_reset',[a,a,a,lock,hash])).rejects.toThrow(/reset_target_not_allowed/);
  await db.query('delete from auth.sessions where id=$1',[a]);await expect(rpc('admin_begin_password_reset',[a,a,b,lock,hash])).rejects.toThrow(/admin_required/);
 });
 it('MRESET-DB-02 revokes target sessions only and preserves profile and email verification',async()=>{
  const lock=randomUUID(),hash='pbkdf2$'+'a'.repeat(48)+'$'+'b'.repeat(64);await db.query('update account_controls set is_admin=true where user_id=$1',[a]);
  await db.query('insert into auth.refresh_tokens(user_id,session_id) values($1,$2)',[b,b]);const before=(await db.query('select * from profiles where id=$1',[b])).rows[0];
  await rpc('admin_begin_password_reset',[a,a,b,lock,hash]);
  expect((await db.query<any>('select setup_stage,password_return_stage,password_reset_pending,email_verified_at from account_controls where user_id=$1',[b])).rows[0]).toMatchObject({setup_stage:0,password_return_stage:3,password_reset_pending:true});
  expect((await db.query('select * from auth.sessions where user_id=$1',[b])).rows).toHaveLength(0);expect((await db.query('select * from auth.refresh_tokens where user_id=$1',[b])).rows).toHaveLength(0);expect((await db.query('select * from auth.sessions')).rows).toHaveLength(2);
  expect((await db.query('select * from profiles where id=$1',[b])).rows[0]).toEqual(before);
  await expect(rpc('admin_begin_password_reset',[a,a,b,randomUUID(),hash])).rejects.toThrow(/password_operation_busy/);
  await expect(rpc('account_finish_password',[b,lock,true])).rejects.toThrow(/password_operation_busy/);
  await rpc('admin_finish_password_reset',[a,a,b,lock,true]);
  const userLock=randomUUID();await db.query('update account_controls set setup_lock=$2 where user_id=$1',[b,userLock]);await rpc('account_finish_password',[b,userLock,true]);
  expect((await db.query<any>('select setup_stage,temporary_password_hash from account_controls where user_id=$1',[b])).rows[0]).toEqual({setup_stage:3,temporary_password_hash:null});
 });
 it('MRESET-DB-03 an interrupted reset stays blocked and a retry preserves unfinished setup',async()=>{
  const hash='pbkdf2$'+'a'.repeat(48)+'$'+'b'.repeat(64),first=randomUUID(),second=randomUUID();await db.query('update account_controls set is_admin=true where user_id=$1',[a]);await db.query('update account_controls set setup_stage=2,disabled=true,email_verified_at=null where user_id=$1',[b]);
  await rpc('admin_begin_password_reset',[a,a,b,first,hash]);await rpc('admin_finish_password_reset',[a,a,b,first,false]);expect((await db.query<any>('select password_reset_pending from account_controls where user_id=$1',[b])).rows[0].password_reset_pending).toBe(true);
  await rpc('admin_begin_password_reset',[a,a,b,second,hash]);await expect(rpc('admin_finish_password_reset',[a,a,b,first,true])).rejects.toThrow(/password_operation_busy/);await rpc('admin_finish_password_reset',[a,a,b,second,true]);
  const c=(await db.query<any>('select * from account_controls where user_id=$1',[b])).rows[0];expect(c).toMatchObject({password_return_stage:2,setup_stage:0,disabled:true,email_verified_at:null,password_reset_pending:false});
 });
 it('ADMIN-DB-01 keeps roles, access-code hashes and admin sessions inaccessible to player SQL',async()=>{
  for(const table of ['account_controls','admin_security','admin_sessions'])for(const action of ['select * from','delete from'])await expect(userRole(a,`${action} ${table}`)).rejects.toThrow(/permission denied/);
  await expect(userRole(a,"select admin_change_code(null,null)")).rejects.toThrow(/permission denied/);
  await expect(userRole(a,"select account_setup_step($1,2,null)",[a])).rejects.toThrow(/permission denied/);
 });
 it('ADMIN-DB-02 fresh role and live Auth session are both required for the account directory',async()=>{
  const session=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,a]);
  await expect(rpc('admin_account_directory',[a,session,'','',0,null])).rejects.toThrow(/admin_required/);
  await db.query('update account_controls set is_admin=true where user_id=$1',[a]);
  const directory=(await rpc('admin_account_directory',[a,session,'','',0,null])).rows[0].value as any;expect(directory.counts.total).toBe(3);
  await db.query('delete from auth.sessions where id=$1',[session]);await expect(rpc('admin_account_directory',[a,session,'','',0,null])).rejects.toThrow(/admin_required/);
 });
 it('ADMIN-DB-03 disabling a user revokes direct RLS reads without deleting accounts or friendships',async()=>{
  await befriend();await db.query('update account_controls set disabled=true where user_id=$1',[a]);
  expect((await userRole(a,'select * from profiles')).rows).toHaveLength(0);expect((await userRole(a,'select * from friendships')).rows).toHaveLength(0);
  expect((await db.query('select * from profiles')).rows).toHaveLength(3);
  await db.query('update account_controls set disabled=false where user_id=$1',[a]);expect((await userRole(a,'select * from profiles')).rows).toHaveLength(2);
 });
 it('ADMIN-DB-SESSION revoked access tokens cannot read protected game data',async()=>{
  expect((await userRole(a,'select * from profiles')).rows.length).toBeGreaterThan(0);
  await db.query('delete from auth.sessions where id=$1',[a]);
  expect((await userRole(a,'select * from profiles')).rows).toHaveLength(0);
 });
 it('ADMIN-DB-04 manual provisioning records approval separately from mailbox verification',async()=>{
  const id=randomUUID();await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,'manual@example.invalid',now(),$2)",[id,{manhunt_provisioning:'admin',manhunt_temporary_password_hash:'hash-fixture'}]);
  const c=(await db.query<any>('select * from account_controls where user_id=$1',[id])).rows[0];expect(c).toMatchObject({is_admin:false,setup_stage:0,source:'admin',email_verified_at:null});expect(c.admin_approved_at).toBeTruthy();
  await expect(rpc('account_setup_step',[id,2,null])).rejects.toThrow(/invalid_setup_step/);expect((await userRole(id,'select * from profiles')).rows).toHaveLength(0);
 });
 it('ADMIN-DB-05 user metadata cannot grant admin or mark setup complete',async()=>{
  const id=randomUUID();await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,{is_admin:true,setup_stage:3,manhunt_provisioning:'admin'}]);
  const c=(await db.query<any>('select * from account_controls where user_id=$1',[id])).rows[0];expect(c).toMatchObject({is_admin:false,setup_stage:1,source:'self'});
 });
 it('AUTH-NAME-DB reserves the supplied name case-insensitively and supports periods',async()=>{
  const id=randomUUID();await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,{username:'New.Player'}]);
  expect((await db.query<any>('select username from profiles where id=$1',[id])).rows[0].username).toBe('New.Player');
  await expect(db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[randomUUID(),{username:'new.player'}])).rejects.toThrow(/unique/);
  expect((await rpc('account_username_available',['NEW.PLAYER',null])).rows[0].value).toBe(false);
 });
 it('SETUP-DB direct step skipping and repeated completion are rejected atomically',async()=>{
  await db.query('update account_controls set setup_stage=1 where user_id=$1',[a]);await expect(rpc('account_setup_step',[a,2,null])).rejects.toThrow(/invalid_setup_step/);
  await rpc('account_setup_step',[a,1,'My.Player']);await rpc('account_setup_step',[a,2,null]);await expect(rpc('account_setup_step',[a,2,null])).rejects.toThrow(/invalid_setup_step/);
  expect((await userRole(a,'select username from profiles')).rows).toEqual([{username:'My.Player'}]);
 });
 it('keeps edge snapshots, presence and global quotas inaccessible to clients',async()=>{
  for(const table of ['edge_runtime','edge_presence','edge_quotas'])await expect(userRole(a,`select * from ${table}`)).rejects.toThrow(/permission denied/);
  for(const sql of ['select edge_snapshot()',`select edge_touch('${a}')`,`select edge_commit(0,'[]',null)`,`select edge_quota('${a}','api',999)`])await expect(userRole(a,sql)).rejects.toThrow(/permission denied/);
 });
 it('atomically commits one winning snapshot and rejects stale concurrent writers',async()=>{
  const original=(await rpc('edge_snapshot',[])).rows[0].value as {revision:number};
  const lobby=state();
  expect((await rpc('edge_commit',[original.revision,JSON.stringify([lobby]),null])).rows[0].value).toBe(true);
  lobby.players[1].eliminated=true;lobby.revision++;
  expect((await rpc('edge_commit',[original.revision,JSON.stringify([lobby]),null])).rows[0].value).toBe(false);
  const saved=(await rpc('edge_snapshot',[])).rows[0].value as {lobbies:Lobby[]};
  expect(saved.lobbies[0].players[1].eliminated).toBe(false);
 });
 it('persists selected end zones and server phase draws through a durable checkpoint',async()=>{
  const lobby=state();lobby.zone={feature:circle([13.405,52.52],.6,{steps:8}),excluded:[],name:'ISOLATED ENDZONE',confirmed:true,shrinkTarget:[13.406,52.521],randomCorners:true};const plan=shrinkPlan(lobby.zone,[1,.6,.1],()=>.5);(lobby as any)._engine={players:{},phase:0,leftIds:[],lastTick:Date.now(),zonePhases:plan};
  await rpc('save_game_checkpoint',[JSON.stringify(lobby)]);const snapshot=(await rpc('edge_snapshot',[])).rows[0].value as {lobbies:Lobby[]};expect(snapshot.lobbies[0].zone).toEqual(lobby.zone);expect((snapshot.lobbies[0] as any)._engine.zonePhases).toEqual(plan);await expect(userRole(a,'select state from game_checkpoints')).rejects.toThrow(/permission denied/);
 });
 it('invalidates snapshots when account erasure changes checkpoint membership',async()=>{
  await rpc('save_game_checkpoint',[JSON.stringify(state())]);
  const before=(await rpc('edge_snapshot',[])).rows[0].value as {revision:number;lobbies:Lobby[]};
  await rpc('delete_account',[b]);
  expect((await rpc('edge_commit',[before.revision,JSON.stringify(before.lobbies),null])).rows[0].value).toBe(false);
 });
 it('rolls back the revision and all writes when any checkpoint fails',async()=>{
  const before=(await rpc('edge_snapshot',[])).rows[0].value as {revision:number};
  const bad=state();bad.hostId=randomUUID();
  await expect(rpc('edge_commit',[before.revision,JSON.stringify([bad]),null])).rejects.toThrow();
  expect(((await rpc('edge_snapshot',[])).rows[0].value as {revision:number}).revision).toBe(before.revision);
 });
 it('shares rate limits across requests and never exposes presence',async()=>{
  expect((await rpc('edge_quota',[a,'gps',2])).rows[0].value).toBe(true);
  expect((await rpc('edge_quota',[a,'gps',2])).rows[0].value).toBe(true);
  expect((await rpc('edge_quota',[a,'gps',2])).rows[0].value).toBe(false);
  expect((await rpc('edge_quota',[b,'gps',2])).rows[0].value).toBe(true);
  await rpc('edge_touch',[a]);const result=(await rpc('edge_snapshot',[])).rows[0].value as {presence:Record<string,number>};
  expect(result.presence[a]).toBeGreaterThan(0);
 });
 it('advances the social revision for friend requests and approvals',async()=>{
  const before=(await rpc('edge_snapshot',[])).rows[0].value as {socialRevision:number};
  await befriend();
  const after=(await rpc('edge_snapshot',[])).rows[0].value as {socialRevision:number};
  expect(after.socialRevision).toBeGreaterThan(before.socialRevision);
 });
 it('executes the full unchanged migration and enables RLS on every application table',async()=>{
  const tables=await db.query<{tablename:string;rowsecurity:boolean}>("select tablename,rowsecurity from pg_tables where schemaname='public'");
  expect(tables.rows.length).toBe(33);
  expect(tables.rows.every(t=>t.rowsecurity)).toBe(true);
  expect((await db.query('select * from profiles')).rows).toHaveLength(3);
  expect(await friendCode(a)).toMatch(/^[A-Z0-9]{12}$/);
 });
 it('allows self profile reads, hides strangers and rejects client mutations',async()=>{
  expect((await userRole(a,'select * from profiles')).rows).toHaveLength(1);
  await expect(userRole(a,"update profiles set username='Hijacked' where id=$1",[b])).rejects.toThrow(/permission denied/);
  await expect(userRole(a,'select * from game_checkpoints')).rejects.toThrow(/permission denied/);
  await expect(userRole(a,'select public.request_friend($1,$2)',[a,await friendCode(b)])).rejects.toThrow(/permission denied/);
 });
 it('requires recipient approval, deduplicates requests and reveals only accepted friends',async()=>{
  const code=await friendCode(b);
  const first=await rpc('request_friend',[a,code]);
  const again=await rpc('request_friend',[a,code]);
  expect(first.rows).toEqual(again.rows);
  const id=(first.rows[0].value as {id:string}).id;
  await expect(rpc('respond_friend',[c,id,true])).rejects.toThrow();
  await rpc('respond_friend',[b,id,true]);
  expect((await userRole(a,'select * from profiles')).rows).toHaveLength(2);
  expect((await userRole(c,'select * from friendships')).rows).toHaveLength(0);
  await expect(rpc('respond_friend',[b,id,true])).rejects.toThrow();
 });
 it('blocks both directions, removes friendship and pending notifications',async()=>{
  await befriend();
  await rpc('block_user',[b,a]);
  expect((await db.query('select * from friendships')).rows).toHaveLength(0);
  await expect(rpc('request_friend',[a,await friendCode(b)])).rejects.toThrow();
  await expect(rpc('request_friend',[b,await friendCode(a)])).rejects.toThrow();
  expect((await userRole(a,'select * from profiles')).rows).toHaveLength(1);
 });
 it('atomically projects checkpoints while protecting private GPS and roles',async()=>{
  const s=state();await rpc('save_game_checkpoint',[s]);
  expect((await db.query('select * from game_checkpoints')).rows).toHaveLength(1);
  expect((await userRole(a,'select * from location_pins')).rows).toHaveLength(0);
  expect((await userRole(b,'select * from location_pins')).rows).toHaveLength(1);
  expect((await userRole(a,'select * from lobby_members')).rows).toHaveLength(1);
  expect((await userRole(c,'select * from lobbies')).rows).toHaveLength(0);
  expect((await userRole(a,'select * from lobbies')).rows).toHaveLength(1);
 });
 it('rolls back partial projections and rejects stale checkpoints',async()=>{
  const s=state();await rpc('save_game_checkpoint',[s]);
  const invalid={...s,revision:2,players:[...s.players,{...s.players[0],id:randomUUID()}]};
  await expect(rpc('save_game_checkpoint',[invalid])).rejects.toThrow(/foreign key/);
  expect((await db.query<{revision:number}>('select revision from lobbies where id=$1',[s.id])).rows[0].revision).toBe(1);
  await rpc('save_game_checkpoint',[{...s,revision:3}]);
  await expect(rpc('save_game_checkpoint',[s])).rejects.toThrow(/Stale/);
 });
 it('scrubs locations and capture codes at match end; results stay user-private',async()=>{
  const s=state();await rpc('save_game_checkpoint',[s]);
  s.status='finished';s.revision++;s.result={winner:'hiders',reason:'Zeitlimit',endedAt:Date.now(),survivors:[b]};
  await rpc('save_game_checkpoint',[s]);
  const saved=(await db.query<{state:Lobby}>('select state from game_checkpoints')).rows[0].state;
  expect(saved.pins).toEqual([]);expect(saved.players.every(p=>!p.location&&!p.captureCode)).toBe(true);
  expect((await db.query('select * from location_pins')).rows).toHaveLength(0);
  expect((await userRole(a,'select * from match_results')).rows).toHaveLength(1);
  expect((await userRole(c,'select * from match_results')).rows).toHaveLength(0);
 });
 it('requires friendship and waiting lobby membership for invitations',async()=>{
  const s={...state(),status:'waiting',startedAt:undefined} as Lobby;await rpc('save_game_checkpoint',[s]);
  await expect(rpc('invite_friend',[a,b,s.code])).rejects.toThrow();
  await befriend();
  const first=await rpc('invite_friend',[a,b,s.code]);const repeat=await rpc('invite_friend',[a,b,s.code]);expect(first.rows).toEqual(repeat.rows);
  expect((await userRole(c,'select * from lobby_invites')).rows).toHaveLength(0);
  await rpc('block_user',[b,a]);expect((await db.query('select * from lobby_invites')).rows).toHaveLength(0);
 });
 it('restricts avatar objects to the authenticated owner and keeps the bucket private',async()=>{
  expect((await db.query<{public:boolean}>('select public from storage.buckets where id=\'avatars\'')).rows[0].public).toBe(false);
  await userRole(a,"insert into storage.objects(bucket_id,name) values('avatars',$1)",[a+'/avatar.webp']);
  await expect(userRole(b,"insert into storage.objects(bucket_id,name) values('avatars',$1)",[a+'/other.webp'])).rejects.toThrow(/row-level security/);
  expect((await userRole(b,'select * from storage.objects')).rows).toHaveLength(0);
  expect((await userRole(a,'select * from storage.objects')).rows).toHaveLength(1);
 });
 it('erases a Last Survivor winner from other users histories and private engine metadata',async()=>{
  const l=lastSurvivor();expect(l.result!.reason).not.toContain('PrivacyTest2');
  // A pre-update record can contain the old name even after a later profile rename.
  l.result!.reason='OldWinnerName ist der letzte Hider.';
  (l as any)._engine.leftIds=[c];
  await rpc('save_game_checkpoint',[l]);
  await rpc('delete_account',[c]);await db.query('delete from auth.users where id=$1',[c]);
  const history=(await userRole(a,'select result from match_results where session_id=$1',[l.id])).rows[0] as {result:Lobby['result']};
  expect(history.result!.winner).toBe('deleted_player');expect(history.result!.reason).toBe('Der Sieger hat sein Konto gelöscht.');
  expect(JSON.stringify(history)).not.toContain(c);expect(JSON.stringify(history)).not.toContain('OldWinnerName');
  const saved=(await db.query<{state:Lobby}>('select state from game_checkpoints where id=$1',[l.id])).rows[0].state;
  expect(JSON.stringify(saved)).not.toContain(c);expect(JSON.stringify(saved)).not.toContain('OldWinnerName');
  expect(saved.players.map(p=>p.id)).toEqual([a,b]);expect((saved as any)._engine.players[a]).toBeDefined();
  expect((await userRole(b,'select * from match_results where session_id=$1',[l.id])).rows).toHaveLength(1);
 });
 it('keeps other winners and history when a non-winner deletes their account',async()=>{
  const l=lastSurvivor();await rpc('save_game_checkpoint',[l]);await rpc('delete_account',[b]);await db.query('delete from auth.users where id=$1',[b]);
  const saved=(await db.query<{state:Lobby}>('select state from game_checkpoints where id=$1',[l.id])).rows[0].state;
  expect(JSON.stringify(saved)).not.toContain(b);expect(saved.result!.winner).toBe(c);expect(saved.result!.survivors).toEqual([c]);
  expect((await userRole(c,'select * from match_results')).rows).toHaveLength(1);
 });
 it('rejects stale per-lobby writes and client erasure RPCs after account deletion',async()=>{
  const l=lastSurvivor();await rpc('save_game_checkpoint',[l]);await rpc('delete_account',[c]);
  await expect(rpc('save_game_checkpoint',[l])).rejects.toThrow(/Stale checkpoint/);
  for(const sql of ['select delete_account($1::uuid)',"select erase_result_identity('{}'::jsonb,$1::uuid)"]){
   await expect(userRole(a,sql,[b])).rejects.toThrow(/permission denied/);
   await db.exec('set role anon');try{await expect(db.query(sql,[b])).rejects.toThrow(/permission denied/);}finally{await db.exec('reset role');}
  }
 });
 it('repairs previously deleted winner references when upgrading an existing database',async()=>{
  const old=new PGlite({extensions:{pgcrypto}});
  try{
   await old.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
   const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
   const upgrade=files.find(f=>f.endsWith('_complete_account_erasure.sql'))!;
   for(const f of files.filter(f=>f<upgrade))await old.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
   for(const id of [a,b,c])await old.query('insert into auth.users(id) values($1)',[id]);
   const l=lastSurvivor();delete (l as any)._engine.stats;l.result!.reason='OldDeletedWinner ist der letzte Hider.';
   await old.query('select save_game_checkpoint($1)',[l]);await old.query('select delete_account($1)',[c]);await old.query('delete from auth.users where id=$1',[c]);
   expect((await old.query<{result:any}>('select result from match_results where user_id=$1',[a])).rows[0].result.winner).toBe(c);
   await old.exec(await readFile(`supabase/migrations/${upgrade}`,'utf8'));
   const rows=await old.query('select result from match_results');expect(JSON.stringify(rows.rows)).not.toContain(c);expect(JSON.stringify(rows.rows)).not.toContain('OldDeletedWinner');
   const saved=await old.query('select state from game_checkpoints');expect(JSON.stringify(saved.rows)).not.toContain(c);
   expect((await old.query('select id from profiles')).rows).toHaveLength(2);
  }finally{await old.close();}
 },30000);
 it('erases account references and purges expired GPS checkpoints',async()=>{
  const s=state();await rpc('save_game_checkpoint',[s]);
  await rpc('delete_account',[b]);
  await db.query('delete from auth.users where id=$1',[b]);
  const saved=(await db.query<{state:Lobby}>('select state from game_checkpoints')).rows[0].state;
  expect(saved.players.some(p=>p.id===b)).toBe(false);expect(saved.pins).toEqual([]);
  await db.exec("update game_checkpoints set updated_at=now()-interval '25 hours'");
  await rpc('cleanup_expired_data',[]);
  expect((await db.query('select * from game_checkpoints')).rows).toHaveLength(0);
 });
});

// Real SQL outbox tests; no production subscriptions or devices are contacted.
describe('durable web-push scheduling and privacy',()=>{
 it('denies clients access to signing keys, queued notifications and claims',async()=>{
  for(const sql of ['select * from push_config','select * from push_jobs','select claim_push_jobs(40)'])await expect(userRole(a,sql)).rejects.toThrow(/permission denied/);
 });
 it('schedules one reminder per deadline and cancels it on pause or location withdrawal',async()=>{
  const l=state();l.players[1].locationSharing=true;l.players[1].nextPinAt=Date.now()+60000;
  await rpc('save_game_checkpoint',[JSON.stringify(l)]);l.revision++;await rpc('save_game_checkpoint',[JSON.stringify(l)]);
  let rows=(await db.query<{status:string;payload:unknown}>('select status,payload from push_jobs where kind=\'pin_due\'')).rows;
  expect(rows).toHaveLength(1);expect(rows[0].status).toBe('pending');expect(JSON.stringify(rows)).not.toContain('52.52');expect(JSON.stringify(rows)).not.toContain('TestHider');
  l.status='paused';l.revision++;await rpc('save_game_checkpoint',[JSON.stringify(l)]);expect((await db.query<{status:string}>('select status from push_jobs where kind=\'pin_due\'')).rows[0].status).toBe('cancelled');
  l.status='active';l.players[1].nextPinAt!+=10000;l.revision++;await rpc('save_game_checkpoint',[JSON.stringify(l)]);l.players[1].locationSharing=false;l.revision++;await rpc('save_game_checkpoint',[JSON.stringify(l)]);expect((await db.query("select * from push_jobs where kind='pin_due' and status='pending'")).rows).toHaveLength(0);
 });
 it('notifies hunters about new pins and ignores retired emergency-pause events',async()=>{
  const l=state();l.events=[{id:randomUUID(),type:'emergency_pause',at:Date.now(),message:'PRIVATE TEST NAME'}];await rpc('save_game_checkpoint',[JSON.stringify(l)]);
  const rows=(await db.query<{user_id:string;kind:string;payload:unknown}>('select user_id,kind,payload from push_jobs')).rows;
  expect(rows.filter(r=>r.kind==='new_pin').map(r=>r.user_id)).toEqual([a]);expect(rows.filter(r=>r.kind==='emergency_pause')).toHaveLength(0);
  expect(JSON.stringify(rows)).not.toContain('PRIVATE TEST NAME');l.revision++;await rpc('save_game_checkpoint',[JSON.stringify(l)]);expect((await db.query('select * from push_jobs')).rows).toHaveLength(rows.length);
 });
 it('leases due work only once, retries expired leases and cascades account deletion',async()=>{
  await db.query("insert into push_jobs(user_id,event_key,kind,payload,expires_at) values($1,'test-job','test','{}',now()+interval '5 minutes')",[b]);
  expect((await rpc('claim_push_jobs',[40])).rows).toHaveLength(1);
  // SETOF functions are returned as one row per claim by our helper.
  expect((await rpc('claim_push_jobs',[40])).rows).toHaveLength(0);
  await db.exec("update push_jobs set locked_until=now()-interval '1 second'");expect((await rpc('claim_push_jobs',[40])).rows).toHaveLength(1);
  await db.query('delete from auth.users where id=$1',[b]);expect((await db.query('select * from push_jobs')).rows).toHaveLength(0);
 });
});


it('consumes a push dispatch ticket once and denies clients minting or consuming it',async()=>{const ticket=(await rpc('issue_push_ticket',[])).rows[0].value as string;const hash=(await db.query<{hash:string}>("select encode(sha256(convert_to($1,'UTF8')),'hex') as hash",[ticket])).rows[0].hash;expect((await rpc('consume_push_ticket',[hash])).rows[0].value).toBe(true);expect((await rpc('consume_push_ticket',[hash])).rows[0].value).toBe(false);await expect(userRole(a,'select issue_push_ticket()')).rejects.toThrow(/permission denied/);await expect(userRole(a,'select * from push_dispatch_tickets')).rejects.toThrow(/permission denied/);});

describe('account XP and team notices acceptance',()=>{
 it('LEVEL-01 LEVEL-02 LEVEL-03 LEVEL-04 LEVEL-08: atomic rewards, statistics and RLS survive duplicate writes',async()=>{
  const l=state();l.startedAt=Date.now()-600000;l.status='finished';l.result={winner:'hiders',reason:'Test time limit',endedAt:Date.now(),survivors:[b]};(l as any)._engine={stats:{[a]:{captures:2,points:0},[b]:{captures:0,points:3}},leftIds:[]};
  await rpc('save_game_checkpoint',[l]);await rpc('save_game_checkpoint',[l]);
  const rows=(await userRole(b,'select * from account_progress')).rows as any[];expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({total_xp:85,games:1,wins:1,survivals:1,hunt_points:3});
  expect((await userRole(b,'select * from xp_rewards')).rows).toHaveLength(1);
  await expect(userRole(b,'update account_progress set total_xp=999999')).rejects.toThrow();await expect(userRole(b,'insert into xp_rewards(session_id,user_id,amount) values($1,$2,500)',[l.id,b])).rejects.toThrow();
  const bad=state();bad.code='ABC124';bad.status='finished';bad.result={winner:'hiders',reason:'Too short',endedAt:Date.now(),survivors:[b]};(bad as any)._engine={stats:{[b]:{captures:0,points:100}},leftIds:[]};await rpc('save_game_checkpoint',[bad]);expect((await userRole(b,'select * from xp_rewards')).rows).toHaveLength(1);
 });
 it('LEVEL-02: guests, aborts and farming beyond five matches receive no XP',async()=>{
  await db.query('update auth.users set is_anonymous=true where id=$1',[c]);
  for(let i=0;i<6;i++){const l=state();l.code=`TST00${i}`;l.startedAt=Date.now()-600000;l.status='finished';l.result={winner:'hunters',reason:'Test complete',endedAt:Date.now(),survivors:[]};(l as any)._engine={stats:{[a]:{captures:1,points:0}},leftIds:[]};await rpc('save_game_checkpoint',[l]);}
  const earned=await db.query<{amount:number}>('select amount from xp_rewards where user_id=$1 order by created_at',[a]);expect(earned.rows.map(x=>x.amount)).toEqual([60,60,60,60,60,0]);
  const guest=state();guest.code='TSTGST';guest.startedAt=Date.now()-600000;guest.status='finished';guest.players.push({...guest.players[1],id:c,username:'GuestTest'});guest.result={winner:'hiders',reason:'Guest test',endedAt:Date.now(),survivors:[c]};(guest as any)._engine={stats:{[c]:{captures:0,points:99}},leftIds:[]};await rpc('save_game_checkpoint',[guest]);expect((await db.query('select * from xp_rewards where user_id=$1',[c])).rows).toHaveLength(0);
  const aborted=state();aborted.code='TSTABT';aborted.startedAt=Date.now()-600000;aborted.status='finished';aborted.result={winner:'aborted',reason:'Host ended',endedAt:Date.now(),survivors:[b]};(aborted as any)._engine={stats:{[b]:{captures:0,points:1}},leftIds:[]};await rpc('save_game_checkpoint',[aborted]);expect((await db.query('select * from xp_rewards where session_id=$1',[aborted.id])).rows).toHaveLength(0);

 });
 it('NOTIFY-01: host and every non-host get match notices; team chat never targets enemies',async()=>{
  const l=state();l.players.push({...l.players[1],id:c,username:'TestOther'});l.events=[{id:randomUUID(),type:'match_started',at:Date.now(),message:'start'}];(l as any)._engine={players:{},leftIds:[],chat:[]};await rpc('save_game_checkpoint',[l]);
  expect((await db.query('select distinct user_id from push_jobs where kind=\'match_started\'')).rows).toHaveLength(3);
  (l as any)._engine.chat=[{id:randomUUID(),actorId:b,channel:'hiders',text:'secret',at:Date.now()}];l.revision++;await rpc('save_game_checkpoint',[l]);
  const jobs=await db.query<{user_id:string;payload:any}>('select user_id,payload from push_jobs where kind=\'chat\'');expect(jobs.rows.map(x=>x.user_id)).toEqual([c]);expect(JSON.stringify(jobs.rows)).not.toContain('secret');
 });
});

describe('actual Supabase Auth role boundaries',()=>{
 it('AUTH-09: Auth user deletion cascades under auth_admin without exposing game state',async()=>{
  await befriend();const before=(await rpc('edge_snapshot',[])).rows[0].value as {socialRevision:number};
  await db.exec('set role supabase_auth_admin');
  try{await expect(db.query('select state from game_checkpoints')).rejects.toThrow(/permission denied/);await db.query('delete from auth.users where id=$1',[b]);}finally{await db.exec('reset role');}
  expect((await db.query('select id from profiles where id=$1',[b])).rows).toHaveLength(0);expect(((await rpc('edge_snapshot',[])).rows[0].value as {socialRevision:number}).socialRevision).toBeGreaterThan(before.socialRevision);
  await expect(userRole(a,'update edge_runtime set social_revision=0')).rejects.toThrow(/permission denied/);
 });
 it('LEVEL-03: erasing a finished match never re-awards XP or requires direct auth-table access',async()=>{
  const l=state();l.startedAt=Date.now()-600000;l.status='finished';l.result={winner:'hiders',reason:'Test',endedAt:Date.now(),survivors:[b]};(l as any)._engine={stats:{[b]:{captures:0,points:3}},leftIds:[]};await rpc('save_game_checkpoint',[l]);
  await db.exec('set role service_role');try{await expect(db.query('select is_anonymous from auth.users')).rejects.toThrow(/permission denied/);}finally{await db.exec('reset role');}
  await rpc('delete_account',[b]);expect((await db.query('select amount from xp_rewards where user_id=$1',[b])).rows).toEqual([{amount:85}]);
 });
});
