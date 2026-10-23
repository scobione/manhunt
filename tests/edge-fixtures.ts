// Explicitly isolated fixtures. Never imported by an application entrypoint.
import type { Lobby } from '../shared/types';
import type { EdgeSnapshot, EdgeStore } from '../server/edge-store';
import { HttpError } from '../server/auth';
export class TestEdgeStore implements EdgeStore {
  revision=0;socialRevision=0;clock=Date.now();lobbies=new Map<string,Lobby>();presence:Record<string,number>={};conflicts=0;failed=false;
  quotas=new Map<string,number>();
  async ready(){return !this.failed;}
  async snapshot():Promise<EdgeSnapshot>{if(this.failed)throw new HttpError(503,'Datenbank nicht verfügbar.');return structuredClone({revision:this.revision,socialRevision:this.socialRevision,now:this.clock,lobbies:[...this.lobbies.values()],presence:this.presence});}
  async commit(revision:number,lobbies:Lobby[]){if(this.failed)throw new HttpError(503,'Datenbank nicht verfügbar.');if(this.conflicts>0){this.conflicts--;this.revision++;return false;}if(revision!==this.revision)return false;for(const lobby of lobbies)this.lobbies.set(lobby.id,structuredClone(lobby));this.revision++;return true;}
  async touch(id:string){this.presence[id]=this.clock;}
  async quota(id:string,scope:string,limit:number){const key=`${id}:${scope}:${Math.floor(this.clock/60000)}`;const count=(this.quotas.get(key)||0)+1;this.quotas.set(key,count);if(count>limit)throw new HttpError(429,'Zu viele Aktionen.');}
}
