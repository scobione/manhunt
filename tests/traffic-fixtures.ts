/** ISOLATED browser fixture. SQL authorization/aggregation is separately exercised
 * against the real migrations by TRAFFIC-DB; this adapter never ships. */
import type {TrafficStore} from '../server/traffic';
import type {Lobby} from '../shared/types';
import {NETWORKS,totalBytes,type TrafficReport} from '../shared/traffic';
import type {Identity} from '../server/auth';
import {HttpError} from '../server/auth';
export class TestTrafficStore implements TrafficStore {
 reports=new Map<string,{userId:string;report:TrafficReport;at:string}>();
 constructor(private lobbies:Map<string,Lobby>){}
 async report(actor:Identity,r:TrafficReport){const l=this.lobbies.get(r.matchId);if(!l?.players.some(p=>p.id===actor.id)||!l.startedAt)throw new HttpError(403,'Fremdes Match');const key=r.matchId+actor.id+r.clientId,old=this.reports.get(key);if(!old||r.sequence>old.report.sequence)this.reports.set(key,{userId:actor.id,report:structuredClone(r),at:new Date().toISOString()});return{ok:true};}
 async read(actor:Identity,admin:boolean,matchId:string|null,page:number){const lobbies=[...this.lobbies.values()].filter(l=>!!l.startedAt);if(!admin)throw new HttpError(403,'Fremdes Match');const entries=(id:string)=>[...this.reports.values()].filter(r=>r.report.matchId===id);const match=(l:Lobby)=>({id:l.id,code:l.code,status:l.status,startedAt:new Date(l.startedAt!).toISOString(),endedAt:l.result?new Date(l.result.endedAt).toISOString():null,players:l.players.length,reporters:new Set(entries(l.id).map(r=>r.userId)).size,bytes:entries(l.id).reduce((n,r)=>n+Object.values(r.report.buckets).reduce((n,b)=>n+totalBytes(b),0),0),updatedAt:entries(l.id).at(-1)?.at??null});if(!matchId)return{matches:lobbies.slice(page*20,page*20+20).map(match),page,hasMore:false};const l=lobbies.find(l=>l.id===matchId);if(!l)throw new HttpError(403,'Match fehlt');return{match:match(l),players:l.players.map(p=>({id:p.id,username:p.username,avatarUrl:p.avatar_url,updatedAt:entries(l.id).filter(r=>r.userId===p.id).at(-1)?.at??null})),rows:entries(l.id).flatMap(r=>NETWORKS.map(n=>({userId:r.userId,network:n,...r.report.buckets[n]})))};}
}
