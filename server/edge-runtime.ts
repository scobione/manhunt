import {rules} from '../shared/rules';
import {loadXpPaths,type PathCandidate} from './xp-paths';
import { z } from 'zod';
import type { Command, Lobby, Profile, Settings } from '../shared/types';
import { GameEngine, GameError } from './engine';
import { HttpError, safeMessage, statusCode, uuid, type Identity } from './auth';
import type { Repository } from './repository';
import type { EdgeStore } from './edge-store';
import { settingsSchema, partialSettingsSchema } from './validation';
import packageInfo from '../package.json' with {type:'json'};
const {version}=packageInfo;
import {pushSubscriptionSchema,validPushEndpoint,type PushService} from './push';

const empty=z.object({}).strict();
const codeSchema=z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const eventSchema=z.object({event:z.enum(['lobby:create','lobby:join','lobby:sync','lobby:command']),data:z.unknown().optional()}).strict();
const commandSchema=z.object({command:z.object({type:z.string()}).passthrough()}).strict();
const PRESENCE_MS=20_000;
export interface EdgeOptions {repository:Repository;store:EdgeStore;verify:(token:string)=>Promise<Identity>;origins:string[];push?:PushService;pathLoader?:typeof loadXpPaths}

async function jsonBody(request:Request){
  if(!request.body)return {};
  // Bound bytes while streaming; Content-Length is not trusted.
  const reader=request.body.getReader();let length=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw new HttpError(413,'Die Anfrage ist zu groß.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{throw new HttpError(400,'Ungültige Anfrage.');}
}

/** Request-scoped engine, durable PostgreSQL state, no isolate-local authority.
 * HTTP polling survives the edge worker lifetime without depending on timers.
 */
export function createEdgeHandler({repository:repo,store,verify,origins,push,pathLoader=loadXpPaths}:EdgeOptions){
  async function game(identity:Identity,profile:Profile,event:string,raw:unknown){
    const id=identity.id;
    if(identity.isGuest&&event==='lobby:create')throw new HttpError(403,'Als Gast kannst du einer Lobby beitreten. Zum Erstellen benötigst du ein E-Mail-Konto.');
    const settings=event==='lobby:create'?z.object({settings:partialSettingsSchema.optional()}).strict().parse(raw??{}).settings:undefined;
    const code=event==='lobby:join'?z.object({code:codeSchema}).strict().parse(raw).code:undefined;
    const command=event==='lobby:command'?commandSchema.parse(raw).command as Command:undefined;
    if(event==='lobby:sync')empty.parse(raw??{});
    if(event==='lobby:create')await store.quota(id,'create',5);
    if(event==='lobby:join')await store.quota(id,'join',12);
    if(command?.type==='location')await store.quota(id,'gps',30);
    if(command&&['capture','confirm_capture'].includes(command.type))await store.quota(id,'capture',20);
    let pathData:{zone:string;candidates:PathCandidate[]}|undefined;
    if(command&&['start','xp_regenerate'].includes(command.type)){
      const before=await store.snapshot(),current=before.lobbies.find(l=>l.hostId===id&&l.players.some(p=>p.id===id)&&!['closed','finished'].includes(l.status));
      if(current?.zone&&rules(current.settings).xpHunt){await store.quota(id,'xp-paths',3);try{pathData={zone:JSON.stringify(current.zone),candidates:await pathLoader(current.zone)};}catch{pathData={zone:JSON.stringify(current.zone),candidates:[]};}}
    }
    for(let attempt=0;attempt<8;attempt++){
      const snapshot=await store.snapshot();
      const engine=new GameEngine({initial:snapshot.lobbies,now:()=>snapshot.now});
      const changed=new Map<string,Lobby>();
      for(const lobby of engine.lobbies.values()){
        if(['closed','finished'].includes(lobby.status))continue;
        // Persist legacy-pause recovery even when this request targets another lobby.
        if(lobby.revision!==snapshot.lobbies.find(saved=>saved.id===lobby.id)?.revision)changed.set(lobby.id,lobby);
        for(const player of lobby.players){
          const seen=snapshot.presence[player.id]??player.lastSeen;
          const connected=snapshot.now-seen<PRESENCE_MS;
          if(player.connected!==connected){const next=engine.setConnected(player.id,connected);if(next)changed.set(next.id,next);}
          // Preserve the last actual heartbeat, not the time this worker noticed it.
          if(!connected)player.lastSeen=seen;
        }
      }
      for(const lobby of engine.tick())changed.set(lobby.id,lobby);
      let lobby=engine.lobbyFor(id);
      let failure:unknown;
      try{
        if(event==='lobby:create'){
          if([...engine.lobbies.values()].filter(l=>!['finished','closed'].includes(l.status)).length>=100)throw new HttpError(503,'Alle Spielplätze sind gerade belegt. Bitte später erneut versuchen.');
          lobby=engine.create(profile,settings as Partial<Settings>);
        }else if(event==='lobby:join'){
          const target=[...engine.lobbies.values()].find(l=>l.code===code);
          if(target)for(const player of target.players)if(await repo.hasBlock(id,player.id))throw new HttpError(403,'Der Beitritt zu dieser Lobby ist nicht möglich.');
          lobby=engine.join(code!,profile);
        }else if(command){
          lobby??=[...engine.lobbies.values()].find(l=>l.status==='finished'&&l.players.some(p=>p.id===id));
          if(!lobby)throw new HttpError(404,'Du bist in keiner Lobby.');
          if(pathData){if(JSON.stringify(lobby.zone)!==pathData.zone)throw new HttpError(409,'Die Zone wurde während der Wegprüfung verändert. Bitte erneut starten.');engine.prepareXp(lobby.id,pathData.candidates);}
          lobby=engine.command(lobby.id,id,command);
        }
        if(lobby&&event!=='lobby:sync')changed.set(lobby.id,lobby);
      }catch(error){
        failure=error;
        if(error instanceof GameError&&error.stateChanged&&error.lobbyId){const state=engine.lobbies.get(error.lobbyId);if(state)changed.set(state.id,state);}
      }
      // Profile edits propagate on the next heartbeat without trusting client claims.
      const active=engine.lobbyFor(id);
      const self=active?.players.find(p=>p.id===id);
      if(active&&self){self.lastSeen=snapshot.now;changed.set(active.id,active);}
      if(active&&self&&(self.username!==profile.username||self.avatar_url!==profile.avatar_url)){
        self.username=profile.username;self.avatar_url=profile.avatar_url;active.revision++;changed.set(active.id,active);
      }
      const audit=command&&command.type!=='location'&&!failure&&lobby?{actorId:id,action:`lobby.${command.type}`,lobbyId:lobby.id}:undefined;
      // Even no-op commands check revision: a stale snapshot must never acknowledge
      // permissions or membership invalidated by a simultaneous kick/close.
      if(!await store.commit(snapshot.revision,[...changed.values()],audit))continue;
      if(failure)throw failure;
      const latest=engine.lobbyFor(id)??[...engine.lobbies.values()].filter(l=>l.status==='finished'&&l.players.some(p=>p.id===id)).sort((a,b)=>(b.result?.endedAt??0)-(a.result?.endedAt??0))[0];
      let view=null;
      if(latest&&!(command&&['leave','close'].includes(command.type)))try{view=engine.view(latest.id,id);}catch{/* A departed member receives no private snapshot. */}
      return {lobby:view,socialRevision:snapshot.socialRevision,serverTime:snapshot.now};
    }
    throw new HttpError(409,'Viele gleichzeitige Aktionen. Bitte kurz warten und erneut versuchen.');
  }
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods']='GET, POST, PATCH, DELETE, OPTIONS';
    const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    try{
      if(origin&&!origins.includes(origin))throw new HttpError(403,'Diese Website darf nicht auf den Spielserver zugreifen.');
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      const path=new URL(request.url).pathname.replace(/^.*?\/api(?=\/|$)/,'')||'/';
      const method=request.method;
      if(path==='/push/dispatch'&&method==='POST'){if(!push||!await push.authorized(request.headers.get('x-manhunt-push-ticket')))throw new HttpError(401,'Nicht berechtigt.');return respond(await push.dispatch());}
      if(method==='GET'&&(path==='/config'||path==='/health')){
        const ready=await store.ready();
        return respond(path==='/config'?{configured:ready,authConfigured:true,transport:'http',pollIntervalMs:2000,...(push?{pushPublicKey:await push.publicKey()}:{})}:{status:ready?'ok':'configuration_required',configured:ready,version,transport:'http'},ready?200:503);
      }
      const auth=request.headers.get('authorization');
      if(!auth?.startsWith('Bearer '))throw new HttpError(401,'Bitte melde dich an.');
      const identity=await verify(auth.slice(7)),id=identity.id;
      await store.quota(id,'api',120);
      const profile=await repo.getProfile(identity);
      await store.touch(id);
      const body=['POST','PATCH','DELETE'].includes(method)?await jsonBody(request):{};
      let result:unknown={ok:true};
      if(path==='/events'&&method==='POST'){
        const {event,data}=eventSchema.parse(body);result=await game(identity,profile,event,data);
      }else if(path==='/sync'&&method==='GET')result=await game(identity,profile,'lobby:sync',{});
      else if(path==='/profile'&&method==='GET')result=profile;
      else if(path==='/profile'&&method==='PATCH'){
        const patch=z.object({username:z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/),show_online:z.boolean(),avatar_url:z.string().url().max(2048).nullable()}).partial().strict().parse(body);
        if(!Object.keys(patch).length)throw new HttpError(400,'Keine Änderungen angegeben.');
        if(patch.avatar_url){const url=new URL(patch.avatar_url);if(url.protocol!=='https:'||url.username||url.password||!/^(lh[0-9]+\.)?googleusercontent\.com$/.test(url.hostname))throw new HttpError(400,'Bitte lade dein Profilbild in deinen eigenen Avatar-Speicher hoch.');}
        result=await repo.patchProfile(id,patch);await repo.audit(id,'profile.update',{fields:Object.keys(patch)});
      }else if(path==='/profile/avatar'&&method==='POST'){
        const {path:avatar}=z.object({path:z.string().min(1).max(240)}).strict().parse(body);result=await repo.setAvatar(id,avatar);await repo.audit(id,'profile.avatar',{});
      }else if(path==='/profile'&&method==='DELETE'){
        empty.parse(body);
        const snapshot=await store.snapshot();
        if(snapshot.lobbies.some(l=>!['finished','closed'].includes(l.status)&&l.players.some(p=>p.id===id)))await game(identity,profile,'lobby:command',{command:{type:'leave'}});
        await repo.deleteAccount(id);
      }else if(path==='/social'&&method==='GET'){
        const social=await repo.social(id),snapshot=await store.snapshot();
        result={...social,friends:social.friends.map(friend=>({...friend,online:friend.show_online&&snapshot.now-(snapshot.presence[friend.id]??0)<PRESENCE_MS}))};
      }else if(path==='/friends/request'&&method==='POST'){
        await store.quota(id,'friend-request',10);const {code}=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,20}$/)}).strict().parse(body);await repo.requestFriend(id,code);
      }else if(path==='/friends/respond'&&method==='POST'){
        const {requestId,accept}=z.object({requestId:uuid,accept:z.boolean()}).strict().parse(body);await repo.respondFriend(id,requestId,accept);
      }else if(/^\/friends\/[^/]+$/.test(path)&&method==='DELETE')await repo.removeFriend(id,uuid.parse(path.split('/')[2]));
      else if(/^\/blocks\/[^/]+$/.test(path)&&method==='POST'){empty.parse(body);await repo.blockUser(id,uuid.parse(path.split('/')[2]));}
      else if(/^\/blocks\/[^/]+$/.test(path)&&method==='DELETE')await repo.unblockUser(id,uuid.parse(path.split('/')[2]));
      else if(path==='/invites'&&method==='POST'){
        await store.quota(id,'invite',10);const {friendId,code}=z.object({friendId:uuid,code:codeSchema}).strict().parse(body);await repo.invite(id,friendId,code);
      }else if(/^\/notifications\/[^/]+$/.test(path)&&method==='PATCH')await repo.markNotice(id,uuid.parse(path.split('/')[2]));
      else if(path==='/history'&&method==='GET')result=await repo.history(id);
      else if(path==='/presets'&&method==='GET')result=await repo.presets(id);
      else if(path==='/presets'&&method==='POST'){
        const {name,settings}=z.object({name:z.string().trim().min(1).max(60),settings:settingsSchema}).strict().parse(body);
        if((await repo.presets(id)).length>=20)throw new HttpError(409,'Du kannst bis zu 20 Presets speichern.');result=await repo.savePreset(id,name,settings as Settings);
      }else if(/^\/presets\/[^/]+$/.test(path)&&method==='DELETE')await repo.deletePreset(id,uuid.parse(path.split('/')[2]));
      else if(path==='/push/subscribe'&&method==='POST'){if(!push)throw new HttpError(503,'Push ist noch nicht eingerichtet.');await store.quota(id,'push-subscribe',10);const subscription=pushSubscriptionSchema.parse(body);if(!validPushEndpoint(subscription.endpoint))throw new HttpError(400,'Dieser Push-Dienst ist nicht zugelassen.');const existing=await repo.subscriptions(id);if(existing.length>=10&&!existing.some(s=>s.endpoint===subscription.endpoint))throw new HttpError(409,'Höchstens zehn Push-Geräte pro Konto.');await repo.subscribe(id,subscription);}
      else if(path==='/push/test'&&method==='POST'){empty.parse(body);if(!push)throw new HttpError(503,'Push ist noch nicht eingerichtet.');await store.quota(id,'push-test',2);await push.test(id);}
      else if(path==='/push/subscribe'&&method==='DELETE'){const {endpoint}=z.object({endpoint:z.string().url().max(2048)}).strict().parse(body);await repo.unsubscribe(id,endpoint);}
      else throw new HttpError(404,'Diese API-Route existiert nicht.');
      return respond(result);
    }catch(error){return respond({error:safeMessage(error)},statusCode(error));}
  };
}
