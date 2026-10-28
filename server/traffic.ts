import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {HttpError,type Identity} from './auth';
import type {TrafficReport} from '../shared/traffic';
const bytes=z.number().int().min(0).max(2_000_000_000);
const count=z.number().int().min(0).max(1_000_000);
const bucket=z.object({down:bytes,estimated:bytes,up:bytes,requests:count,unmeasured:count,cached:count}).strict();
export const trafficSchema=z.object({matchId:z.uuid(),clientId:z.uuid(),sequence:z.number().int().min(1).max(1_000_000),buckets:z.object({wifi:bucket,cellular:bucket,ethernet:bucket,unknown:bucket}).strict()}).strict();
export interface TrafficStore {
 report(actor:Identity,report:TrafficReport):Promise<unknown>;
 read(actor:Identity,admin:boolean,matchId:string|null,page:number):Promise<unknown>;
}
export class SupabaseTrafficStore implements TrafficStore {
 constructor(private db:SupabaseClient){}
 private async rpc(name:string,params:Record<string,unknown>){const r=await this.db.rpc(name,params);if(r.error){if(/traffic_forbidden/.test(r.error.message))throw new HttpError(403,'Für dieses Match fehlt die Berechtigung.');if(/traffic_limit/.test(r.error.message))throw new HttpError(429,'Zu viele Messsitzungen für dieses Match.');throw new HttpError(503,'Die Verbrauchsübersicht ist gerade nicht verfügbar.');}return r.data;}
 report(actor:Identity,r:TrafficReport){return this.rpc('record_match_traffic',{p_actor:actor.id,p_session:actor.sessionId,p_match:r.matchId,p_client:r.clientId,p_sequence:r.sequence,p_buckets:r.buckets});}
 read(actor:Identity,admin:boolean,matchId:string|null,page:number){return this.rpc('read_match_traffic',{p_actor:actor.id,p_session:actor.sessionId,p_admin:admin,p_match:matchId,p_page:page});}
}
