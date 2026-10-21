import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lobby, Profile, Settings } from '../shared/types.js';
import type { Identity } from './auth.js';
import { HttpError } from './auth.js';

export interface FriendRequest { id:string; sender:Profile; recipient_id:string; status:string; direction:'incoming'|'outgoing'; }
export interface Notice { id:string; title:string; message:string; type:string; data:Record<string,unknown>; read_at:string|null; created_at:string; }
export interface Social { friends:(Profile & {online?:boolean})[]; requests:FriendRequest[]; blocked:Profile[]; notifications:Notice[]; }
export interface Preset { id:string; name:string; settings:Settings; }
export interface Subscription { endpoint:string; keys:{auth:string;p256dh:string}; }
export interface Repository {
  getProfile(identity:Identity):Promise<Profile>;
  patchProfile(id:string,patch:Partial<Pick<Profile,'username'|'show_online'|'avatar_url'>>):Promise<Profile>;
  setAvatar(id:string,path:string):Promise<Profile>;
  social(id:string):Promise<Social>;
  requestFriend(id:string,code:string):Promise<string[]>;
  respondFriend(id:string,requestId:string,accept:boolean):Promise<string[]>;
  removeFriend(id:string,target:string):Promise<string[]>;
  blockUser(id:string,target:string):Promise<string[]>;
  unblockUser(id:string,target:string):Promise<void>;
  hasBlock(a:string,b:string):Promise<boolean>;
  invite(id:string,friendId:string,code:string):Promise<string[]>;
  markNotice(id:string,noticeId:string):Promise<void>;
  history(id:string):Promise<unknown[]>;
  presets(id:string):Promise<Preset[]>;
  savePreset(id:string,name:string,settings:Settings):Promise<Preset>;
  deletePreset(id:string,presetId:string):Promise<void>;
  save(lobby:Lobby):Promise<void>;
  load():Promise<Lobby[]>;
  deleteAccount(id:string):Promise<void>;
  audit(actorId:string|null,action:string,metadata?:Record<string,unknown>):Promise<void>;
  cleanup():Promise<void>;
  subscribe(id:string,subscription:Subscription):Promise<void>;
  unsubscribe(id:string,endpoint:string):Promise<void>;
  subscriptions(id:string):Promise<Subscription[]>;
}
function didWin(result:any,role:string|undefined,team:string|undefined,id:string):boolean{
  if(!result||role==='spectator')return false;
  if(result.winner==='hiders')return role==='hider'&&result.survivors?.includes(id);
  if(result.winner==='hunters'||result.winner==='infected')return role==='hunter'||role==='zombie';
  if(result.winner===id)return true;
  if(result.winner==='A'||result.winner==='B')return result.winner===team;
  if(result.winner===`team_${team}`||result.winner===`Team ${team}`)return true;
  return Array.isArray(result.survivors)&&result.survivors.includes(id);
}
function check(error: {code?:string;message:string}|null):void {
  if (!error) return;
  if (error.code === '23505') throw new HttpError(409, 'Dieser Name oder Eintrag ist bereits vergeben.');
  if (['P0001','23514','22023','42501'].includes(error.code ?? '')) {
    const messages:Record<string,string> = { friend_not_found:'Freundescode nicht gefunden.', blocked:'Diese Verbindung ist nicht möglich.', self_request:'Du kannst dich nicht selbst hinzufügen.', request_not_found:'Anfrage nicht gefunden.', not_friends:'Ihr seid noch nicht befreundet.', not_lobby_member:'Du bist nicht in dieser Lobby.' };
    const message = Object.entries(messages).find(([key]) => error.message.includes(key))?.[1];
    throw new HttpError(400, message ?? 'Diese Aktion ist nicht erlaubt oder der Eintrag ist nicht mehr aktuell.');
  }
  throw new Error('Database operation failed');
}
const profileColumns='id,username,avatar_url,friend_code,show_online,created_at';
const noticeText:Record<string,[string,string]>={
  friend_request:['Neue Freundschaftsanfrage','Jemand möchte mit dir spielen.'],
  friend_accepted:['Freundschaft bestätigt','Ihr könnt euch jetzt in eine Lobby einladen.'],
  lobby_invite:['Lobby-Einladung','Ein Freund hat dich in eine private Lobby eingeladen.'],
};
export class SupabaseRepository implements Repository {
  constructor(readonly db:SupabaseClient) {}
  /** Private storage object locators are never returned to the client as public URLs. */
  private async withAvatar(profile:Profile):Promise<Profile>{
    if(!profile.avatar_url)return profile;
    try{
      const url=new URL(profile.avatar_url), origin=process.env.SUPABASE_URL;
      const prefix='/storage/v1/object/avatars/';
      if(origin && url.origin===new URL(origin).origin && url.pathname.startsWith(prefix)){
        const path=decodeURIComponent(url.pathname.slice(prefix.length));
        if(!path.startsWith(profile.id+'/'))return {...profile,avatar_url:null};
        const {data,error}=await this.db.storage.from('avatars').createSignedUrl(path,86400);
        return {...profile,avatar_url:error?null:data.signedUrl};
      }
      return /^(lh[0-9]+\.)?googleusercontent\.com$/.test(url.hostname)&&url.protocol==='https:'?profile:{...profile,avatar_url:null};
    }catch{return {...profile,avatar_url:null};}
  }
  async setAvatar(id:string,path:string):Promise<Profile>{
    const file=path.slice(id.length+1);
    if(!path.startsWith(id+'/')||!file||file.includes('/')||!/^[-a-zA-Z0-9_.]+$/.test(file))throw new HttpError(400,'Ungültiger Profilbildpfad.');
    const {data:files,error}=await this.db.storage.from('avatars').list(id,{limit:100,search:file});check(error);
    const found=files?.find(value=>value.name===file);
    if(!found)throw new HttpError(404,'Lade dein Profilbild zuerst hoch.');
    if(!['image/jpeg','image/png','image/webp'].includes(String(found.metadata?.mimetype ?? ''))||Number(found.metadata?.size)>2097152)throw new HttpError(400,'Profilbilder müssen JPEG, PNG oder WebP sein und höchstens 2 MB groß.');
    const origin=process.env.SUPABASE_URL;
    if(!origin)throw new HttpError(503,'Profilbildspeicher ist nicht eingerichtet.');
    return this.patchProfile(id,{avatar_url:new URL(`/storage/v1/object/avatars/${encodeURIComponent(id)}/${encodeURIComponent(file)}`,origin).href});
  }
  async getProfile(identity:Identity):Promise<Profile> {
    const {data,error}=await this.db.from('profiles').select(profileColumns).eq('id',identity.id).maybeSingle();check(error);
    if(data) return this.withAvatar(data as Profile);
    // Covers externally provisioned accounts as well as auth-trigger bootstrap.
    const base=(identity.username ?? 'spieler').normalize('NFKD').replace(/[^a-zA-Z0-9_]/g,'').slice(0,16) || 'spieler';
    const avatar = typeof identity.avatarUrl==='string' && /^https:\/\/[^/]*googleusercontent\.com\//.test(identity.avatarUrl) ? identity.avatarUrl : null;
    const insert=await this.db.from('profiles').upsert({id:identity.id,username:`${base}_${randomBytes(3).toString('hex')}`,avatar_url:avatar,friend_code:randomBytes(6).toString('hex').toUpperCase(),show_online:false},{onConflict:'id',ignoreDuplicates:true});check(insert.error);
    const result=await this.db.from('profiles').select(profileColumns).eq('id',identity.id).single();check(result.error);return this.withAvatar(result.data as Profile);
  }
  async patchProfile(id:string,patch:Partial<Profile>):Promise<Profile>{
    const {data,error}=await this.db.from('profiles').update(patch).eq('id',id).select(profileColumns).single();check(error);return this.withAvatar(data as Profile);
  }
  private async profiles(ids:string[]):Promise<Profile[]>{
    if(!ids.length)return[];const {data,error}=await this.db.from('profiles').select(profileColumns).in('id',[...new Set(ids)]);check(error);return Promise.all((data as Profile[]).map(profile=>this.withAvatar(profile)));
  }
  async social(id:string):Promise<Social>{
    const [friendRows,requestRows,blockRows,noticeRows]=await Promise.all([
      this.db.from('friendships').select('user_id,friend_id').or(`user_id.eq.${id},friend_id.eq.${id}`).limit(300),
      this.db.from('friend_requests').select('id,sender_id,receiver_id,status').or(`sender_id.eq.${id},receiver_id.eq.${id}`).eq('status','pending').limit(100),
      this.db.from('blocked_users').select('blocked_id').eq('user_id',id).limit(300),
      this.db.from('notifications').select('*').eq('user_id',id).order('created_at',{ascending:false}).limit(100)
    ]);for(const result of [friendRows,requestRows,blockRows,noticeRows])check(result.error);
    const f=friendRows.data??[],r=requestRows.data??[],b=blockRows.data??[];
    const all=await this.profiles([...f.map(x=>x.user_id===id?x.friend_id:x.user_id),...r.map(x=>x.sender_id),...b.map(x=>x.blocked_id)]);
    const lookup=new Map(all.map(p=>[p.id,p]));
    return {friends:f.map(x=>lookup.get(x.user_id===id?x.friend_id:x.user_id)).filter((x):x is Profile=>!!x),requests:r.flatMap(x=>{const sender=lookup.get(x.sender_id);return sender?[{id:x.id,sender,recipient_id:x.receiver_id,status:x.status,direction:x.receiver_id===id?'incoming' as const:'outgoing' as const}]:[];}),blocked:b.map(x=>lookup.get(x.blocked_id)).filter((x):x is Profile=>!!x),notifications:(noticeRows.data??[]).map(x=>({id:x.id,type:x.type,title:noticeText[x.type]?.[0]??'MANHUNT',message:noticeText[x.type]?.[1]??'Neue Benachrichtigung',data:x.payload??{},read_at:x.read_at,created_at:x.created_at}))};
  }
  private async rpc(name:string,args:Record<string,unknown>,fallback:string[]):Promise<string[]>{
    const {data,error}=await this.db.rpc(name,args);check(error);
    return Array.isArray(data?.user_ids)?data.user_ids:fallback;
  }
  requestFriend(id:string,code:string){return this.rpc('request_friend',{p_actor:id,p_code:code},[id]);}
  respondFriend(id:string,requestId:string,accept:boolean){return this.rpc('respond_friend',{p_actor:id,p_request:requestId,p_accept:accept},[id]);}
  removeFriend(id:string,target:string){return this.rpc('remove_friend',{p_actor:id,p_target:target},[id,target]);}
  blockUser(id:string,target:string){return this.rpc('block_user',{p_actor:id,p_target:target},[id,target]);}
  async unblockUser(id:string,target:string){const {error}=await this.db.from('blocked_users').delete().eq('user_id',id).eq('blocked_id',target);check(error);}
  async hasBlock(a:string,b:string){const {data,error}=await this.db.from('blocked_users').select('user_id').or(`and(user_id.eq.${a},blocked_id.eq.${b}),and(user_id.eq.${b},blocked_id.eq.${a})`).limit(1);check(error);return !!data?.length;}
  invite(id:string,friendId:string,code:string){return this.rpc('invite_friend',{p_actor:id,p_friend:friendId,p_code:code},[id,friendId]);}
  async markNotice(id:string,noticeId:string){const{error}=await this.db.from('notifications').update({read_at:new Date().toISOString()}).eq('id',noticeId).eq('user_id',id);check(error);}
  async history(id:string){const{data,error}=await this.db.from('match_results').select('session_id,role,team,result,created_at,game_sessions(mode)').eq('user_id',id).order('created_at',{ascending:false}).limit(100);check(error);return(data??[]).map(row=>({id:row.session_id,mode:(row.game_sessions as unknown as {mode:string})?.mode,role:row.role,result:row.result,played_at:row.created_at,won:didWin(row.result,row.role,row.team,id)}));}
  async presets(id:string){const{data,error}=await this.db.from('presets').select('id,name,settings').eq('user_id',id).order('created_at',{ascending:false});check(error);return data as Preset[];}
  async savePreset(id:string,name:string,settings:Settings){const{data,error}=await this.db.from('presets').upsert({user_id:id,name,settings},{onConflict:'user_id,name'}).select('id,name,settings').single();check(error);return data as Preset;}
  async deletePreset(id:string,presetId:string){const{error}=await this.db.from('presets').delete().eq('user_id',id).eq('id',presetId);check(error);}
  async save(lobby:Lobby){const{error}=await this.db.rpc('save_game_checkpoint',{p_state:lobby});check(error);}
  async load(){const{data,error}=await this.db.from('game_checkpoints').select('state').order('updated_at',{ascending:false}).limit(1000);check(error);return(data??[]).map(row=>row.state as Lobby);}
  async deleteAccount(id:string){
    // Storage API removes bytes as well as metadata. Repeat bounded batches until empty.
    for(let page=0;page<100;page++){
      const {data,error}=await this.db.storage.from('avatars').list(id,{limit:100});check(error);
      if(!data?.length)break;
      const removed=await this.db.storage.from('avatars').remove(data.map(file=>`${id}/${file.name}`));check(removed.error);
      if(page===99)throw new HttpError(503,'Profilbilder konnten noch nicht vollständig gelöscht werden. Bitte erneut versuchen.');
    }
    const rpc=await this.db.rpc('delete_account',{p_actor:id});check(rpc.error);const{error}=await this.db.auth.admin.deleteUser(id);check(error);}
  async audit(actorId:string|null,action:string,metadata:Record<string,unknown>={}){const{error}=await this.db.from('audit_logs').insert({actor_id:actorId,action,metadata});check(error);}
  async cleanup(){const{error}=await this.db.rpc('cleanup_expired_data');check(error);}
  async subscribe(id:string,subscription:Subscription){const{error}=await this.db.from('push_subscriptions').upsert({user_id:id,endpoint:subscription.endpoint,keys:subscription.keys},{onConflict:'endpoint'});check(error);}
  async unsubscribe(id:string,endpoint:string){const{error}=await this.db.from('push_subscriptions').delete().eq('user_id',id).eq('endpoint',endpoint);check(error);}
  async subscriptions(id:string){const{data,error}=await this.db.from('push_subscriptions').select('endpoint,keys').eq('user_id',id);check(error);return data as Subscription[];}
}

/** Isolated deterministic storage for automated tests only. Never selected by a production server. */
export class MemoryRepository implements Repository {
  profiles=new Map<string,Profile>(); checkpoints=new Map<string,Lobby>(); friendships=new Set<string>();blocks=new Set<string>();requests=new Map<string,{id:string;sender:string;receiver:string;status:string}>();notices=new Map<string,Notice[]>();savedPresets=new Map<string,(Preset&{userId:string})>();subs=new Map<string,Subscription&{userId:string}>();audits:unknown[]=[];
  private pair(a:string,b:string){return[a,b].sort().join(':');}
  private notify(id:string,type:string,data:Record<string,unknown>){this.notices.set(id,[{id:randomUUID(),type,title:noticeText[type]?.[0]??'MANHUNT',message:noticeText[type]?.[1]??'',data,read_at:null,created_at:new Date().toISOString()},...(this.notices.get(id)??[])]);}
  async getProfile(i:Identity){let p=this.profiles.get(i.id);if(!p){p={id:i.id,username:i.username??`spieler_${randomBytes(3).toString('hex')}`,friend_code:randomBytes(6).toString('hex').toUpperCase(),avatar_url:null,show_online:false};this.profiles.set(i.id,p);}return structuredClone(p);}
  async patchProfile(id:string,patch:Partial<Profile>){const p=this.profiles.get(id);if(!p)throw new HttpError(404,'Profil nicht gefunden.');if(patch.username&&[...this.profiles.values()].some(x=>x.id!==id&&x.username.toLowerCase()===patch.username!.toLowerCase()))throw new HttpError(409,'Benutzername bereits vergeben.');Object.assign(p,patch);return structuredClone(p);}
  async setAvatar(_id:string,_path:string):Promise<Profile>{throw new HttpError(503,'Dateispeicher wird in isolierten Tests nicht simuliert.');}
  async social(id:string):Promise<Social>{return{friends:[...this.profiles.values()].filter(p=>this.friendships.has(this.pair(id,p.id))).map(p=>structuredClone(p)),requests:[...this.requests.values()].filter(r=>(r.sender===id||r.receiver===id)&&r.status==='pending').map(r=>({id:r.id,sender:structuredClone(this.profiles.get(r.sender)!),recipient_id:r.receiver,status:r.status,direction:r.receiver===id?'incoming':'outgoing'})),blocked:[...this.profiles.values()].filter(p=>this.blocks.has(`${id}:${p.id}`)),notifications:structuredClone(this.notices.get(id)??[])};}
  async requestFriend(id:string,code:string){const p=[...this.profiles.values()].find(x=>x.friend_code===code);if(!p||p.id===id||await this.hasBlock(id,p.id))throw new HttpError(400,'Freundschaftsanfrage nicht möglich.');if(this.friendships.has(this.pair(id,p.id))||[...this.requests.values()].some(r=>r.status==='pending'&&this.pair(r.sender,r.receiver)===this.pair(id,p.id)))throw new HttpError(409,'Diese Verbindung oder Anfrage besteht bereits.');const rid=randomUUID();this.requests.set(rid,{id:rid,sender:id,receiver:p.id,status:'pending'});this.notify(p.id,'friend_request',{sender_id:id});return[id,p.id];}
  async respondFriend(id:string,requestId:string,accept:boolean){const r=this.requests.get(requestId);if(!r||r.receiver!==id||r.status!=='pending')throw new HttpError(404,'Anfrage nicht gefunden.');if(await this.hasBlock(id,r.sender))throw new HttpError(400,'Verbindung blockiert.');r.status=accept?'accepted':'rejected';if(accept){this.friendships.add(this.pair(r.sender,id));this.notify(r.sender,'friend_accepted',{friend_id:id});}return[id,r.sender];}
  async removeFriend(id:string,target:string){this.friendships.delete(this.pair(id,target));return[id,target];}
  async blockUser(id:string,target:string){if(id===target||!this.profiles.has(target))throw new HttpError(400,'Ungültiges Profil.');this.blocks.add(`${id}:${target}`);this.friendships.delete(this.pair(id,target));for(const r of this.requests.values())if(this.pair(r.sender,r.receiver)===this.pair(id,target))r.status='rejected';return[id,target];}
  async unblockUser(id:string,target:string){this.blocks.delete(`${id}:${target}`);}
  async hasBlock(a:string,b:string){return this.blocks.has(`${a}:${b}`)||this.blocks.has(`${b}:${a}`);}
  async invite(id:string,friendId:string,code:string){const lobby=[...this.checkpoints.values()].find(l=>l.code===code&&l.players.some(p=>p.id===id)&&l.status==='waiting');if(!lobby||!this.friendships.has(this.pair(id,friendId))||await this.hasBlock(id,friendId))throw new HttpError(403,'Einladung nicht erlaubt.');this.notify(friendId,'lobby_invite',{code,sender_id:id});return[id,friendId];}
  async markNotice(id:string,noticeId:string){const n=this.notices.get(id)?.find(x=>x.id===noticeId);if(n)n.read_at=new Date().toISOString();}
  async history(id:string){return[...this.checkpoints.values()].filter(l=>l.result&&l.players.some(p=>p.id===id)).map(l=>({id:l.id,mode:l.settings.mode,result:l.result,role:l.players.find(p=>p.id===id)?.role,played_at:new Date(l.result!.endedAt).toISOString(),won:didWin(l.result,l.players.find(p=>p.id===id)?.role,l.players.find(p=>p.id===id)?.team,id)}));}
  async presets(id:string){return[...this.savedPresets.values()].filter(p=>p.userId===id).map(({userId,...p})=>structuredClone(p));}
  async savePreset(id:string,name:string,settings:Settings){const old=[...this.savedPresets.values()].find(p=>p.userId===id&&p.name===name);const p={id:old?.id??randomUUID(),name,settings:structuredClone(settings),userId:id};this.savedPresets.set(p.id,p);return{id:p.id,name,settings};}
  async deletePreset(id:string,presetId:string){if(this.savedPresets.get(presetId)?.userId===id)this.savedPresets.delete(presetId);}
  async save(lobby:Lobby){this.checkpoints.set(lobby.id,structuredClone(lobby));}
  async load(){return structuredClone([...this.checkpoints.values()]);}
  async deleteAccount(id:string){this.profiles.delete(id);for(const key of this.friendships)if(key.includes(id))this.friendships.delete(key);for(const[key,r]of this.requests)if(r.sender===id||r.receiver===id)this.requests.delete(key);for(const key of this.blocks)if(key.includes(id))this.blocks.delete(key);this.notices.delete(id);for(const[key,p]of this.savedPresets)if(p.userId===id)this.savedPresets.delete(key);for(const[key,p]of this.subs)if(p.userId===id)this.subs.delete(key);for(const[key,l]of this.checkpoints){if(l.players.some(p=>p.id===id))this.checkpoints.delete(key);}}
  async audit(actorId:string|null,action:string,metadata:Record<string,unknown>={}){this.audits.push({actorId,action,metadata});}
  async cleanup(){}
  async subscribe(id:string,subscription:Subscription){this.subs.set(subscription.endpoint,{...subscription,userId:id});}
  async unsubscribe(id:string,endpoint:string){if(this.subs.get(endpoint)?.userId===id)this.subs.delete(endpoint);}
  async subscriptions(id:string){return[...this.subs.values()].filter(s=>s.userId===id).map(({userId,...s})=>s);}
}
