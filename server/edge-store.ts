import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lobby } from '../shared/types';
import { HttpError } from './auth';

export interface EdgeSnapshot { revision:number; socialRevision:number; now:number; lobbies:Lobby[]; presence:Record<string,number> }
export interface EdgeStore {
  ready():Promise<boolean>;
  snapshot():Promise<EdgeSnapshot>;
  commit(revision:number,lobbies:Lobby[],audit?:{actorId:string;action:string;lobbyId:string}):Promise<boolean>;
  touch(id:string):Promise<void>;
  quota(id:string,scope:string,limit:number):Promise<void>;
}

/** Nothing in this store is exposed through anon/authenticated SQL privileges.
 * A compare-and-swap transaction serializes ALL edge instances, including ticks.
 * The shared engine still filters each response for the verified participant.
 */
export class SupabaseEdgeStore implements EdgeStore {
  constructor(private db:SupabaseClient){}
  async ready(){const {error}=await this.db.from('edge_runtime').select('id').eq('id',1).single();return !error;}
  async snapshot():Promise<EdgeSnapshot>{const {data,error}=await this.db.rpc('edge_snapshot');if(error)throw new HttpError(503,'Der Spielstand konnte nicht sicher geladen werden.');return data;}
  async commit(revision:number,lobbies:Lobby[],audit?:{actorId:string;action:string;lobbyId:string}){
    const {data,error}=await this.db.rpc('edge_commit',{p_revision:revision,p_states:lobbies,p_audit:audit??null});
    if(error)throw new HttpError(503,'Der Spielstand konnte nicht sicher gespeichert werden. Bitte erneut verbinden.');return data===true;
  }
  async touch(id:string){const {error}=await this.db.rpc('edge_touch',{p_user:id});if(error)throw new HttpError(503,'Die Verbindung konnte nicht bestätigt werden.');}
  async quota(id:string,scope:string,limit:number){const {data,error}=await this.db.rpc('edge_quota',{p_user:id,p_scope:scope,p_limit:limit});if(error)throw new HttpError(503,'Der Spielserver ist vorübergehend nicht verfügbar.');if(!data)throw new HttpError(429,'Zu viele Aktionen. Bitte warte einen Moment.');}
}
