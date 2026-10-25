import {createHash,randomBytes,randomUUID} from 'node:crypto';
import webpush from 'web-push';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {HttpError} from './auth';
import type {Subscription} from './repository';

export const pushSubscriptionSchema=z.object({endpoint:z.string().url().max(2048),expirationTime:z.number().nullable().optional(),keys:z.object({auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/),p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/)}).strict()}).strict();
export function validPushEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].some(host=>u.hostname===host||u.hostname.endsWith(`.${host}`));}catch{return false;}}
export interface PushService {publicKey():Promise<string>;authorized(secret:string|null):Promise<boolean>;dispatch():Promise<{sent:number;retried:number}>;test(userId:string):Promise<void>}
type Config={public_key:string;private_key:string;dispatch_secret:string};
type Job={kind:string;id:string;user_id:string;payload:Record<string,string>;attempts:number;lease:string;delivered_endpoints:string[];expires_at:string};
const check=(error:unknown)=>{if(error)throw new HttpError(503,'Push ist vorübergehend nicht erreichbar. Bitte erneut versuchen.');};

/** Server-only keys never enter public config, logs or notification payloads. */
export class SupabasePushService implements PushService {
 private cached:Promise<Config>|null=null;
 constructor(private db:SupabaseClient,private origin:string,private dispatchUrl:string,private send:typeof webpush.sendNotification=(subscription,payload,options)=>webpush.sendNotification(subscription,payload,options)){}
 private configuration():Promise<Config>{
  if(!this.cached)this.cached=(async()=>{
   let row=await this.db.from('push_config').select('public_key,private_key,dispatch_secret').eq('id',1).maybeSingle();check(row.error);
   if(!row.data){const keys=webpush.generateVAPIDKeys();const inserted=await this.db.from('push_config').upsert({id:1,public_key:keys.publicKey,private_key:keys.privateKey,dispatch_secret:randomBytes(32).toString('base64url'),dispatch_url:this.dispatchUrl},{onConflict:'id',ignoreDuplicates:true});check(inserted.error);row=await this.db.from('push_config').select('public_key,private_key,dispatch_secret').eq('id',1).single();check(row.error);}
   if(!row.data)throw new Error('Push configuration unavailable');return row.data as Config;
  })().catch(error=>{this.cached=null;throw error;});return this.cached;
 }
 async publicKey(){return(await this.configuration()).public_key;}
 async authorized(ticket:string|null){if(!ticket||! /^[a-f0-9-]{36}$/.test(ticket))return false;const {data,error}=await this.db.rpc('consume_push_ticket',{p_hash:createHash('sha256').update(ticket).digest('hex')});check(error);return data===true;}
 async test(userId:string){const {error}=await this.db.from('push_jobs').insert({user_id:userId,event_key:`test:${randomUUID()}`,kind:'test',payload:{title:'MANHUNT · Push bereit',body:'Dieses Gerät empfängt jetzt Spielhinweise und Pin-Erinnerungen.',url:'/settings',tag:'manhunt-test'},due_at:new Date().toISOString(),expires_at:new Date(Date.now()+300000).toISOString()});check(error);}
 async dispatch(){
  const config=await this.configuration();const {data,error}=await this.db.rpc('claim_push_jobs',{p_limit:40});check(error);let sent=0,retried=0;
  await Promise.all((data as Job[]??[]).map(async job=>{
   const result=await this.db.from('push_subscriptions').select('endpoint,keys').eq('user_id',job.user_id);check(result.error);
   const completed=new Set(job.delivered_endpoints);let transient=false;
   await Promise.all((result.data as Subscription[]??[]).filter(s=>!completed.has(s.endpoint)).map(async subscription=>{
    if(!validPushEndpoint(subscription.endpoint)){await this.db.from('push_subscriptions').delete().eq('user_id',job.user_id).eq('endpoint',subscription.endpoint);return;}
    try{await this.send(subscription,JSON.stringify(job.payload),{vapidDetails:{subject:this.origin,publicKey:config.public_key,privateKey:config.private_key},TTL:Math.max(0,Math.min(300,Math.floor((Date.parse(job.expires_at)-Date.now())/1000))),urgency:job.kind==='pin_due'||job.kind==='zone_warning'?'high':'normal',timeout:8000});completed.add(subscription.endpoint);}
    catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410){const removed=await this.db.from('push_subscriptions').delete().eq('user_id',job.user_id).eq('endpoint',subscription.endpoint);check(removed.error);}else transient=true;}
   }));
   const retry=transient&&job.attempts<5;const updated=await this.db.from('push_jobs').update({status:retry?'pending':transient?'failed':'sent',delivered_endpoints:[...completed],lease:null,locked_until:null,available_at:new Date(Date.now()+Math.min(120,2**job.attempts*5)*1000).toISOString()}).eq('id',job.id).eq('lease',job.lease);check(updated.error);if(retry)retried++;else sent++;
  }));
  return{sent,retried};
 }
}
