import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS, type Lobby } from '../shared/types';

// All IDs, profiles and GPS coordinates below are isolated automated TEST fixtures.
const a='10000000-0000-4000-8000-000000000001';
const b='20000000-0000-4000-8000-000000000002';
const c='30000000-0000-4000-8000-000000000003';
let db:PGlite;
async function userRole(id:string, sql:string, params:unknown[]=[]){
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
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

beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto}});
 await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
 for (const file of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 }
},30000);
beforeEach(async()=>{
 await db.exec('truncate auth.users cascade');
 for(const id of [a,b,c])await db.query('insert into auth.users(id) values($1)',[id]);
});
afterAll(async()=>{await db?.close();});

describe('actual PostgreSQL migration and RLS (isolated WASM database)',()=>{
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
  expect(tables.rows.length).toBe(24);
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
