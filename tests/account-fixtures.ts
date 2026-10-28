/** ISOLATED AUTOMATED TESTS ONLY. Fake Auth records/passwords never deploy. */
import {createHash,randomUUID} from 'node:crypto';
import type {AccountStore,AdminSession,Control,Security} from '../server/accounts';
import type {Identity} from '../server/auth';
import {HttpError} from '../server/auth';
import {MemoryRepository} from '../server/repository';
export class TestAccountStore implements AccountStore {
 controls=new Map<string,Control>();sessions=new Map<string,AdminSession>();live=new Set<string>();passwords=new Map<string,string>();emails=new Map<string,string>();locks=new Map<string,string>();counters=new Map<string,number>();auditEvents:{actor:string;action:string;target?:string}[]=[];securityData:Security={code_hash:null,code_salt:null,revision:1};resetRequests:string[]=[];
 sessionOwners=new Map<string,string>();
 constructor(readonly repo=new MemoryRepository()){}
 async seed(identity:Identity,email:string,password='Isolated-Password-123',admin=false){this.controls.set(identity.id,{user_id:identity.id,is_admin:admin,disabled:false,setup_stage:3,source:'legacy',email_verified_at:new Date().toISOString(),temporary_password_hash:null});this.emails.set(identity.id,email);this.passwords.set(identity.id,password);if(identity.sessionId){this.live.add(identity.sessionId);this.sessionOwners.set(identity.sessionId,identity.id);}await this.repo.getProfile(identity);}
 async control(id:string){const c=this.controls.get(id);if(!c)throw new HttpError(403,'Kontoberechtigung fehlt.');return structuredClone(c);}
 async sessionLive(user:string,session:string){return this.controls.has(user)&&this.live.has(session);}
 async security(){return structuredClone(this.securityData);}
 async saveSession(s:AdminSession){this.sessions.set(s.token_hash,structuredClone(s));}
 async session(hash:string){return structuredClone(this.sessions.get(hash)??null);}
 async revokeSession(hash:string,user:string){if(this.sessions.get(hash)?.user_id===user)this.sessions.delete(hash);}
 async changeCode(hash:string|null,salt:string|null){this.securityData={code_hash:hash,code_salt:salt,revision:this.securityData.revision+1};this.sessions.clear();}
 async quota(id:string,scope:string,limit:number){const k=id+scope,n=this.counters.get(k)??0;if(n>=limit)throw new HttpError(429,'Zu viele Versuche.');this.counters.set(k,n+1);}
 async available(name:string,except?:string){return ![...this.repo.profiles.values()].some(p=>p.id!==except&&p.username.toLowerCase()===name.toLowerCase());}
 async directory(_actor:string,_session:string,q:{search:string;status:string;page:number;id?:string}){
  const users=[...this.controls.values()].map(c=>({id:c.user_id,email:this.emails.get(c.user_id)!,username:this.repo.profiles.get(c.user_id)?.username??'Test',role:c.is_admin?'administrator':'player',status:c.disabled?'disabled':c.setup_stage<3?'setup_pending':(c.email_verified_at||c.source==='admin')?'active':'email_pending',setup_stage:c.setup_stage,source:c.source,created_at:'2026-01-01T00:00:00Z',last_sign_in_at:null,email_verified_at:c.email_verified_at,admin_approved_at:c.source==='admin'?'2026-01-01T00:00:00Z':null}));
  const selected=users.filter(u=>(!q.id||u.id===q.id)&&(!q.status||u.status===q.status)&&`${u.email} ${u.username}`.toLowerCase().includes(q.search.toLowerCase()));
  return{counts:{total:users.length,...Object.fromEntries(['active','email_pending','setup_pending','disabled'].map(s=>[s,users.filter(u=>u.status===s).length]))},users:selected.slice(q.page*30,q.page*30+30),total:selected.length,page:q.page};
 }
 async create(email:string,password:string,passwordHash:string,_actor:string){if([...this.emails.values()].includes(email))throw new HttpError(409,'Dieses Konto existiert bereits.');const id=randomUUID();await this.seed({id,username:'Test_'+id.slice(0,8),expiresAt:Date.now()+3600000},email,password);this.controls.set(id,{user_id:id,is_admin:false,disabled:false,setup_stage:0,source:'admin',email_verified_at:null,temporary_password_hash:passwordHash});return{id,email};}
 async setDisabled(id:string,disabled:boolean){this.controls.get(id)!.disabled=disabled;}
 async resetPassword(email:string){this.resetRequests.push(email);}
 revokeUser(id:string){for(const[s,u]of this.sessionOwners)if(u===id)this.live.delete(s);for(const[h,t]of this.sessions)if(t.user_id===id)this.sessions.delete(h);}
 async beginPasswordReset(actor:Identity,target:string,lock:string,hash:string){
  const c=this.controls.get(target)!;if(!this.controls.get(actor.id)?.is_admin||!this.live.has(actor.sessionId!))throw new HttpError(403,'Admin required');if(c.is_admin||target===actor.id)throw new HttpError(400,'Target not allowed');
  if(this.locks.has(target))throw new HttpError(409,'Passwortänderung läuft bereits.');this.locks.set(target,lock);c.password_return_stage=c.setup_stage===0?(c.password_return_stage??1):c.setup_stage;c.setup_stage=0;c.password_reset_pending=true;c.temporary_password_hash=hash;this.revokeUser(target);
 }
 async setTemporaryPassword(target:string,password:string){this.passwords.set(target,password);}
 async finishPasswordReset(_actor:Identity,target:string,lock:string,success:boolean){if(this.locks.get(target)!==lock)throw new HttpError(409,'Lock mismatch');this.locks.delete(target);this.controls.get(target)!.password_reset_pending=!success;this.revokeUser(target);}
 async email(id:string){const e=this.emails.get(id);if(!e)throw new HttpError(404,'Konto fehlt.');return e;}
 async lockPassword(id:string,lock:string){if(this.locks.has(id)||this.controls.get(id)?.password_reset_pending)return false;this.locks.set(id,lock);return true;}
 async changePassword(id:string,password:string,_token:string){this.passwords.set(id,password);}
 async finishPassword(id:string,lock:string,success:boolean){if(this.locks.get(id)!==lock)throw new HttpError(409,'Lock mismatch');this.locks.delete(id);if(success){const c=this.controls.get(id)!;c.setup_stage=c.password_return_stage??1;c.temporary_password_hash=null;}}
 async setupStep(id:string,stage:1|2,name?:string){const c=this.controls.get(id)!;if(c.disabled||c.setup_stage!==stage)throw new HttpError(409,'Schritt nicht erlaubt.');if(stage===1){if(!await this.available(name!,id))throw new HttpError(409,'Benutzername vergeben.');const p=this.repo.profiles.get(id)!;p.username=name!;}c.setup_stage=(stage+1) as 2|3;}
 async profile(id:string){const p=await this.repo.getProfile({id,expiresAt:Date.now()+60000});return{username:p.username,avatar_url:p.avatar_url};}
 async avatar(id:string,path:string){if(!path.startsWith(id+'/'))throw new HttpError(400,'Fremdes Profilbild.');}
 async audit(actor:string,action:string,target?:string){this.auditEvents.push({actor,action,target});}
}
export const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
