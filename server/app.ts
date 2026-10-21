import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server, type Socket } from 'socket.io';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { z } from 'zod';
import { GameEngine, GameError } from './engine.js';
import { authenticate, bearer, HttpError, safeMessage, statusCode, testAuthEnabled, uuid, WindowLimiter, type Identity } from './auth.js';
import { MemoryRepository, SupabaseRepository, type Repository, type Subscription } from './repository.js';
import type { Command, Lobby, Profile, Settings } from '../shared/types.js';
import { settingsSchema } from './validation.js';

export interface BackendOptions { repository?:Repository; supabase?:SupabaseClient|null; engine?:GameEngine; timers?:boolean; }
interface UserSocketData { identity:Identity; profile:Profile; }
interface Ack { (result:{ok:boolean;data?:unknown;error?:string}):void; }
const emptyBody=z.object({}).strict();
const commandEnvelope=z.object({command:z.object({type:z.string()}).passthrough()}).strict();
const codeSchema=z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const pushSchema=z.object({endpoint:z.string().url().max(2048),expirationTime:z.number().nullable().optional(),keys:z.object({auth:z.string().min(8).max(100),p256dh:z.string().min(30).max(200)}).strict()}).strict();
function trustedPushEndpoint(endpoint:string):boolean{
  const url=new URL(endpoint);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`));
}
function validAvatar(value:string|null,_id:string):boolean{
  if(value===null)return true;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&/^(lh[0-9]+\.)?googleusercontent\.com$/.test(url.hostname);}catch{return false;}
}

export async function createBackend(options:BackendOptions={}){
  const testing=testAuthEnabled();
  if(process.env.NODE_ENV==='production'&&process.env.TEST_AUTH==='true')throw new Error('Test authentication cannot be enabled in production.');
  if(options.repository instanceof MemoryRepository&&!testing)throw new Error('MemoryRepository is allowed only in isolated automated tests.');
  const supabase=options.supabase!==undefined?options.supabase:process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}}):null;
  const repository=options.repository??(testing?new MemoryRepository():supabase?new SupabaseRepository(supabase):null);
  const engine=options.engine??new GameEngine();
  const app=express();
  app.disable('x-powered-by');
  // Render has one documented proxy hop. Do not trust arbitrary forwarding chains.
  if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
  const allowedOrigins=(process.env.FRONTEND_URL??(process.env.NODE_ENV==='production'?'':'http://localhost:5173,http://127.0.0.1:5173')).split(',').map(x=>x.trim()).filter(Boolean);
  app.use(helmet({referrerPolicy:{policy:'no-referrer'}}));
  app.use(cors({origin:(origin,callback)=>callback(null,!origin||allowedOrigins.includes(origin)),credentials:false}));
  app.use(express.json({limit:'64kb'}));
  app.use('/api',rateLimit({windowMs:60_000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Zu viele Anfragen. Bitte warte einen Moment.'},skip:req=>req.path==='/health'}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const httpServer=createServer(app);
  const io=new Server<never,never,never,UserSocketData>(httpServer,{cors:{origin:allowedOrigins,credentials:false},maxHttpBufferSize:64*1024,pingTimeout:20_000,pingInterval:25_000,connectionStateRecovery:undefined,allowRequest:(req,callback)=>callback(null,!req.headers.origin||allowedOrigins.includes(req.headers.origin))});
  // We intentionally reauthenticate and rebuild filtered snapshots on every reconnect.
  const socketsByUser=new Map<string,Set<string>>();
  const limiter=new WindowLimiter();
  let queue:Promise<unknown>=Promise.resolve();
  let healthy=!!repository;
  let shuttingDown=false;
  let tickTimer:ReturnType<typeof setInterval>|undefined;
  let cleanupTimer:ReturnType<typeof setInterval>|undefined;
  const timers=new Set<ReturnType<typeof setTimeout>>();
  const serialize=<T>(fn:()=>Promise<T>):Promise<T>=>{const result=queue.then(fn,fn);queue=result.catch(()=>undefined);return result;};
  const repo=()=>{if(!repository)throw new HttpError(503,'MANHUNT wartet auf die Supabase-Konfiguration.');return repository;};
  const broadcast=(lobby:Lobby)=>{
    for(const player of lobby.players){
      if(!socketsByUser.has(player.id))continue;
      try{(io.to(`user:${player.id}`) as unknown as {emit:(event:string,payload:unknown)=>void}).emit('lobby:state',engine.view(lobby.id,player.id));}catch{/* Removed users receive lobby:left below. */}
    }
  };
  const send=(userId:string,event:string,payload:unknown)=>(io.to(`user:${userId}`) as unknown as {emit:(event:string,payload:unknown)=>void}).emit(event,payload);
  const pushConfigured=!!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
  if(pushConfigured)webpush.setVapidDetails(process.env.VAPID_SUBJECT!,process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
  const notifySocial=async(ids:string[])=>{
    for(const id of new Set(ids)){
      send(id,'social:changed',{});
      if(pushConfigured&&!socketsByUser.has(id)){
        const subscriptions=await repo().subscriptions(id);
        await Promise.allSettled(subscriptions.map(async subscription=>{try{await webpush.sendNotification(subscription,JSON.stringify({title:'MANHUNT',body:'Du hast eine neue Benachrichtigung.',url:'/notifications'}),{TTL:120});}catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await repo().unsubscribe(id,subscription.endpoint);}}));
      }
    }
  };
  async function commit<T>(mutate:()=>{lobby:Lobby;data:T}):Promise<T>{
    const before=engine.snapshot();
    try{const{lobby,data}=mutate();await repo().save(lobby);healthy=true;broadcast(lobby);return data;}
    catch(error){
      if(error instanceof GameError&&error.stateChanged&&error.lobbyId){
        const changed=engine.lobbies.get(error.lobbyId);
        try{if(changed){await repo().save(changed);broadcast(changed);}}
        catch(persistError){engine.restore(before);healthy=false;throw persistError;}
        throw error;
      }
      engine.restore(before);if(!(error instanceof HttpError)&&!(error instanceof z.ZodError)&&!(error instanceof Error&&error.name==='GameError'))healthy=false;throw error;}
  }
  if(repository){
    try{
      await repository.cleanup();
      const restored=await repository.load();
      const now=Date.now();
      for(const lobby of restored){
        for(const p of lobby.players){p.connected=false;p.lastSeen=now;delete p.location;delete p.outsideSince;}
        const internals=(lobby as Lobby&{_engine?:{players?:Record<string,Record<string,unknown>>}})._engine;
        for(const meta of Object.values(internals?.players??{})){delete meta.lastOutsideAt;meta.lastReliableOutside=false;meta.outsideFixes=0;}
        if(lobby.status==='active'||lobby.status==='preparing'){
          lobby.previousStatus=lobby.status;lobby.status='paused';lobby.pausedAt=now;lobby.revision+=1;
        }
      }
      engine.restore(restored);
      for(const lobby of restored)if(lobby.status==='paused')await repository.save(lobby);
    }catch{healthy=false;console.error('Database initialization failed; multiplayer startup is blocked.');}
  }
  const requireReady=()=>{repo();if(!healthy)throw new HttpError(503,'Der Spielserver wartet auf eine sichere Datenbankverbindung.');};
  app.get('/api/health',(_req,res)=>res.status(repository&&!healthy?503:200).json({status:healthy?'ok':'configuration_required',configured:!!repository,version:'0.1.0'}));
  app.get('/api/config',(_req,res)=>res.json({configured:!!repository&&healthy,authConfigured:!!supabase||testing,pushPublicKey:pushConfigured?process.env.VAPID_PUBLIC_KEY:undefined}));
  const auth:RequestHandler=async(req,res,next)=>{
    try{requireReady();const identity=await authenticate(bearer(req),supabase);limiter.take(`api:${identity.id}`,120,60_000);res.locals.identity=identity;res.locals.profile=await repo().getProfile(identity);next();}catch(error){next(error);}
  };
  app.use('/api',auth);
  const identity=(res:express.Response)=>res.locals.identity as Identity;
  const route=(handler:(req:express.Request,res:express.Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{handler(req,res).catch(next);};
  const refreshProfile=async(profile:Profile)=>{
    await serialize(async()=>{
      for(const socket of io.sockets.sockets.values())if(socket.data.identity.id===profile.id)socket.data.profile=profile;
      const lobby=engine.lobbyFor(profile.id);
      if(lobby){await commit(()=>{const player=lobby.players.find(p=>p.id===profile.id)!;player.username=profile.username;player.avatar_url=profile.avatar_url;lobby.revision++;return{lobby,data:null};});}
    });
    await notifySocial([profile.id,...(await repo().social(profile.id)).friends.map(f=>f.id)]);
  };
  const changed=async(res:express.Response,task:Promise<string[]>)=>{const ids=await task;await notifySocial(ids);res.json({ok:true});};
  app.get('/api/profile',(_req,res)=>res.json(res.locals.profile));
  app.patch('/api/profile',route(async(req,res)=>{
    const patch=z.object({username:z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/),show_online:z.boolean(),avatar_url:z.string().url().max(2048).nullable()}).partial().strict().parse(req.body);
    if(!Object.keys(patch).length)throw new HttpError(400,'Keine Änderungen angegeben.');
    const id=identity(res).id;
    if(patch.avatar_url!==undefined&&!validAvatar(patch.avatar_url,id))throw new HttpError(400,'Bitte lade ein Profilbild in deinen eigenen Avatar-Speicher hoch.');
    const profile=await repo().patchProfile(id,patch);
    await repo().audit(id,'profile.update',{fields:Object.keys(patch)});
    await refreshProfile(profile);
    res.json(profile);
  }));
  app.post('/api/profile/avatar',route(async(req,res)=>{
    const {path}=z.object({path:z.string().min(1).max(240)}).strict().parse(req.body);
    const id=identity(res).id;
    if(!path.startsWith(`${id}/`)||!/^[-a-zA-Z0-9_.]+$/.test(path.slice(id.length+1)))throw new HttpError(400,'Bitte verwende deinen eigenen Profilbildspeicher.');
    const profile=await repo().setAvatar(id,path);await refreshProfile(profile);
    await repo().audit(id,'profile.avatar',{});res.json(profile);
  }));
  app.delete('/api/profile',route(async(_req,res)=>{
    const id=identity(res).id;
    await serialize(async()=>{
      const lobby=engine.lobbyFor(id);
      if(lobby&& !['finished','closed'].includes(lobby.status)){
        const oldIds=lobby.players.map(p=>p.id);
        await commit(()=>({lobby:engine.command(lobby.id,id,{type:'leave'}),data:null}));
        for(const oldId of oldIds)if(oldId!==id)send(oldId,'notice',{message:'Ein Spieler hat die Lobby verlassen.'});
      }
      await repo().deleteAccount(id);
      // Drop old private snapshots containing this identity so they cannot be written back.
      for(const [lobbyId,l]of engine.lobbies)if(l.players.some(p=>p.id===id))engine.lobbies.delete(lobbyId);
      send(id,'account:deleted',{});io.in(`user:${id}`).disconnectSockets(true);
    });
    res.json({ok:true});
  }));
  app.get('/api/social',route(async(_req,res)=>{
    const social=await repo().social(identity(res).id);
    for(const friend of social.friends)friend.online=friend.show_online&&socketsByUser.has(friend.id);
    res.json(social);
  }));
  app.post('/api/friends/request',route(async(req,res)=>{
    limiter.take(`friend-request:${identity(res).id}`,10,60_000);
    const{code}=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,20}$/)}).strict().parse(req.body);
    await changed(res,repo().requestFriend(identity(res).id,code));
  }));
  app.post('/api/friends/respond',route(async(req,res)=>{const{requestId,accept}=z.object({requestId:uuid,accept:z.boolean()}).strict().parse(req.body);await changed(res,repo().respondFriend(identity(res).id,requestId,accept));}));
  app.delete('/api/friends/:id',route(async(req,res)=>{await changed(res,repo().removeFriend(identity(res).id,uuid.parse(req.params.id)));}));
  app.post('/api/blocks/:id',route(async(req,res)=>{emptyBody.parse(req.body??{});await changed(res,repo().blockUser(identity(res).id,uuid.parse(req.params.id)));}));
  app.delete('/api/blocks/:id',route(async(req,res)=>{await repo().unblockUser(identity(res).id,uuid.parse(req.params.id));await notifySocial([identity(res).id]);res.json({ok:true});}));
  app.post('/api/invites',route(async(req,res)=>{
    limiter.take(`invite:${identity(res).id}`,10,60_000);
    const{friendId,code}=z.object({friendId:uuid,code:codeSchema}).strict().parse(req.body);
    await changed(res,repo().invite(identity(res).id,friendId,code));
  }));
  app.patch('/api/notifications/:id',route(async(req,res)=>{await repo().markNotice(identity(res).id,uuid.parse(req.params.id));res.json({ok:true});}));
  app.get('/api/history',route(async(_req,res)=>res.json(await repo().history(identity(res).id))));
  app.get('/api/presets',route(async(_req,res)=>res.json(await repo().presets(identity(res).id))));
  app.post('/api/presets',route(async(req,res)=>{
    const body=z.object({name:z.string().trim().min(1).max(60),settings:settingsSchema}).strict().parse(req.body);
    if((await repo().presets(identity(res).id)).length>=20)throw new HttpError(409,'Du kannst bis zu 20 Presets speichern.');
    res.json(await repo().savePreset(identity(res).id,body.name,body.settings as Settings));
  }));
  app.delete('/api/presets/:id',route(async(req,res)=>{await repo().deletePreset(identity(res).id,uuid.parse(req.params.id));res.json({ok:true});}));
  app.post('/api/push/subscribe',route(async(req,res)=>{
    if(!pushConfigured)throw new HttpError(503,'Push-Benachrichtigungen sind noch nicht eingerichtet.');
    const body=pushSchema.parse(req.body);
    if(!trustedPushEndpoint(body.endpoint))throw new HttpError(400,'Dieser Push-Dienst wird nicht unterstützt.');
    if((await repo().subscriptions(identity(res).id)).length>=5)throw new HttpError(409,'Maximal fünf Geräte pro Konto.');
    await repo().subscribe(identity(res).id,body as Subscription);res.json({ok:true});
  }));
  app.delete('/api/push/subscribe',route(async(req,res)=>{const{endpoint}=z.object({endpoint:z.string().url().max(2048)}).strict().parse(req.body);await repo().unsubscribe(identity(res).id,endpoint);res.json({ok:true});}));
  app.use('/api',(_req,res)=>res.status(404).json({error:'Diese API-Route existiert nicht.'}));
  const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{res.status(statusCode(error)).json({error:safeMessage(error)});};app.use(errorHandler);

  io.use(async(socket,next)=>{
    try{
      requireReady();
      // A 40-person group can share one NAT and reconnect together. On Render,
      // use the final forwarded hop only under the same explicit proxy trust as Express.
      const forwarded=socket.handshake.headers['x-forwarded-for'];
      const candidate=process.env.TRUST_PROXY==='1'&&typeof forwarded==='string'?forwarded.split(',').at(-1)!.trim():'';
      const address=isIP(candidate)?candidate:socket.handshake.address;
      limiter.take(`connect-ip:${address}`,240,60_000);
      const user=await authenticate(socket.handshake.auth?.token,supabase);
      limiter.take(`connect-user:${user.id}`,20,60_000);
      if((socketsByUser.get(user.id)?.size??0)>=6)throw new HttpError(429,'Zu viele aktive Verbindungen für dieses Konto.');
      socket.data.identity=user;socket.data.profile=await repo().getProfile(user);next();
    }catch(error){next(new Error(safeMessage(error)));}
  });
  io.on('connection',(socket)=>{
    const id=socket.data.identity.id;
    const set=socketsByUser.get(id)??new Set<string>();set.add(socket.id);socketsByUser.set(id,set);
    void socket.join(`user:${id}`);
    const expiryTimer=setTimeout(()=>{(socket as unknown as {emit:(event:string,payload:unknown)=>void}).emit('auth:expired',{});socket.disconnect(true);},Math.min(socket.data.identity.expiresAt-Date.now(),2_147_483_647));timers.add(expiryTimer);expiryTimer.unref();
    const event=(name:string,handler:(body:unknown)=>Promise<unknown>)=>{
      (socket as unknown as {on:(event:string,listener:(body:unknown,ack?:Ack)=>void)=>void}).on(name,(body,ack)=>{
        if(typeof ack!=='function')return;
        void serialize(async()=>{
          if(shuttingDown)throw new HttpError(503,'Der Server startet neu. Bitte verbinde dich erneut.');
          if(socket.data.identity.expiresAt<=Date.now())throw new HttpError(401,'Deine Sitzung ist abgelaufen.');
          limiter.take(`socket:${id}`,180,60_000);
          return handler(body);
        }).then(data=>ack({ok:true,data})).catch(error=>ack({ok:false,error:safeMessage(error)}));
      });
    };
    const latestLobby=()=>engine.lobbyFor(id)??[...engine.lobbies.values()].filter(l=>l.status==='finished'&&l.players.some(p=>p.id===id)).sort((a,b)=>(b.result?.endedAt??b.createdAt)-(a.result?.endedAt??a.createdAt))[0];
    const sync=async()=>{const lobby=latestLobby();if(!lobby)return null;return engine.view(lobby.id,id);};
    event('lobby:create',async raw=>{
      limiter.take(`create:${id}`,5,60_000);requireReady();
      const{settings}=z.object({settings:settingsSchema.innerType().partial().optional()}).strict().parse(raw??{});
      const profile=await repo().getProfile(socket.data.identity);
      return commit(()=>{const lobby=engine.create(profile,settings as Partial<Settings>);return{lobby,data:engine.view(lobby.id,id)};});
    });
    event('lobby:join',async raw=>{
      limiter.take(`join:${id}`,12,60_000);requireReady();const{code}=z.object({code:codeSchema}).strict().parse(raw);
      const existing=[...engine.lobbies.values()].find(l=>l.code===code);
      if(existing){for(const player of existing.players)if(await repo().hasBlock(id,player.id))throw new HttpError(403,'Der Beitritt zu dieser Lobby ist nicht möglich.');}
      const profile=await repo().getProfile(socket.data.identity);
      return commit(()=>{const lobby=engine.join(code,profile);return{lobby,data:engine.view(lobby.id,id)};});
    });
    event('lobby:sync',async raw=>{emptyBody.parse(raw??{});return sync();});
    event('lobby:command',async raw=>{
      requireReady();const{command}=commandEnvelope.parse(raw);const lobby=engine.lobbyFor(id)??(['leave','close'].includes(command.type)?latestLobby():undefined);if(!lobby)throw new HttpError(404,'Du bist in keiner Lobby.');
      if(command.type==='location')limiter.take(`gps:${id}`,30,60_000);
      if(command.type==='capture'||command.type==='confirm_capture')limiter.take(`capture:${id}`,20,60_000);
      const oldPlayers=lobby.players.map(p=>p.id);
      const view=await commit(()=>{const next=engine.command(lobby.id,id,command as Command);let data=null;try{data=engine.view(next.id,id);}catch{}return{lobby:next,data};});
      for(const userId of oldPlayers){if(command.type==='close'||!engine.lobbies.get(lobby.id)?.players.some(p=>p.id===userId)||command.type==='leave'&&userId===id)send(userId,'lobby:left',{});}
      if(command.type!=='location')await repo().audit(id,`lobby.${command.type}`,{lobbyId:lobby.id});
      return view;
    });
    void serialize(async()=>{const lobby=engine.lobbyFor(id);if(lobby)await commit(()=>({lobby:engine.setConnected(id,true)!,data:null}));if(socket.data.profile.show_online)await notifySocial((await repo().social(id)).friends.map(f=>f.id));}).catch(()=>send(id,'notice',{message:'Die Verbindung wird wiederhergestellt. Bitte synchronisiere die Lobby.'}));
    socket.on('disconnect',()=>{
      clearTimeout(expiryTimer);timers.delete(expiryTimer);const active=socketsByUser.get(id);active?.delete(socket.id);if(active?.size)return;socketsByUser.delete(id);
      void serialize(async()=>{const lobby=engine.lobbyFor(id);if(lobby)await commit(()=>({lobby:engine.setConnected(id,false)!,data:null}));if(socket.data.profile.show_online)await notifySocial((await repo().social(id)).friends.map(f=>f.id));}).catch(()=>{healthy=false;});
    });
  });
  if(options.timers!==false){
    tickTimer=setInterval(()=>{if(!repository||!healthy||shuttingDown)return;void serialize(async()=>{
      const before=engine.snapshot();try{const changed=engine.tick();for(const lobby of changed)await repository.save(lobby);for(const lobby of changed)broadcast(lobby);}catch{engine.restore(before);healthy=false;for(const id of socketsByUser.keys())send(id,'notice',{message:'Datenbankverbindung unterbrochen. Spielaktionen sind pausiert.'});}
    });},1000);tickTimer.unref();
    cleanupTimer=setInterval(()=>{if(!repository||shuttingDown)return;void serialize(async()=>{try{await repository.cleanup();if(!healthy){const restored=await repository.load();for(const l of restored)if(l.status==='active'||l.status==='preparing'){l.previousStatus=l.status;l.status='paused';l.pausedAt=Date.now();for(const p of l.players)p.connected=socketsByUser.has(p.id);await repository.save(l);}engine.restore(restored);healthy=true;for(const l of restored)broadcast(l);}}catch{healthy=false;}});},60_000);cleanupTimer.unref();
  }
  async function close(){
    shuttingDown=true;if(tickTimer)clearInterval(tickTimer);if(cleanupTimer)clearInterval(cleanupTimer);for(const timer of timers)clearTimeout(timer);
    await queue;
    if(repository)for(const l of engine.lobbies.values())if(l.status==='active'||l.status==='preparing'){
      try{engine.command(l.id,l.hostId,{type:'pause'});await repository.save(l);}catch{/* Restoration is fail-safe and always paused. */}
    }
    await new Promise<void>(resolve=>io.close(()=>resolve()));
    if(httpServer.listening)await new Promise<void>((resolve,reject)=>httpServer.close(e=>e?reject(e):resolve()));
  }
  return{app,httpServer,io,engine,repository,close};
}
