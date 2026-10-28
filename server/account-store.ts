import type {SupabaseClient} from '@supabase/supabase-js';
import {HttpError,type Identity} from './auth';
import {SupabaseEdgeStore} from './edge-store';
import {SupabaseRepository} from './repository';
import type {AccountStore,AdminSession,Control,Security} from './accounts';

function checked(error:{code?:string;message?:string}|null){
 if(!error)return;
 if(error.message?.includes('password_operation_busy'))throw new HttpError(409,'Eine Passwortänderung läuft bereits. Bitte kurz warten und dann erneut versuchen.');
 if(error.message?.includes('reset_target_not_allowed'))throw new HttpError(400,'Dieses Konto kann hier nicht zurückgesetzt werden.');
 if(error.message?.includes('admin_required'))throw new HttpError(403,'Die Administratorberechtigung ist nicht mehr gültig.');
 if(error.code==='23505')throw new HttpError(409,'Dieser Benutzername ist bereits vergeben.');
 if(error.message?.includes('invalid_setup_step'))throw new HttpError(409,'Dieser Einrichtungsschritt ist nicht mehr offen.');
 throw new HttpError(503,'Die Kontoverwaltung ist gerade nicht verfügbar. Bitte versuche es erneut.');
}
export class SupabaseAccountStore implements AccountStore {
 private quotaStore:SupabaseEdgeStore;
 private repository:SupabaseRepository;
 constructor(private db:SupabaseClient){this.quotaStore=new SupabaseEdgeStore(db);this.repository=new SupabaseRepository(db);}
 async control(id:string):Promise<Control>{const r=await this.db.from('account_controls').select('user_id,is_admin,disabled,setup_stage,source,email_verified_at,temporary_password_hash,password_return_stage,password_reset_pending').eq('user_id',id).maybeSingle();checked(r.error);if(!r.data)throw new HttpError(403,'Die Kontoberechtigung konnte nicht bestätigt werden.');return r.data as Control;}
 async sessionLive(user:string,session:string){const r=await this.db.rpc('account_session_live',{p_user:user,p_session:session});checked(r.error);return r.data===true;}
 async security():Promise<Security>{const r=await this.db.from('admin_security').select('code_hash,code_salt,revision').eq('id',1).single();checked(r.error);if(!r.data)throw new HttpError(503,'Die Admin-Konfiguration fehlt.');return r.data;}
 async saveSession(session:AdminSession){const cleanup=await this.db.from('admin_sessions').delete().lt('expires_at',new Date().toISOString());checked(cleanup.error);const r=await this.db.from('admin_sessions').insert(session);checked(r.error);}
 async session(hash:string):Promise<AdminSession|null>{const r=await this.db.from('admin_sessions').select('*').eq('token_hash',hash).maybeSingle();checked(r.error);return r.data;}
 async revokeSession(hash:string,user:string){const r=await this.db.from('admin_sessions').delete().eq('token_hash',hash).eq('user_id',user);checked(r.error);}
 async changeCode(hash:string|null,salt:string|null){const r=await this.db.rpc('admin_change_code',{p_hash:hash,p_salt:salt});checked(r.error);}
 quota(id:string,scope:string,limit:number){return this.quotaStore.quota(id,scope,limit);}
 async available(name:string,except?:string){const r=await this.db.rpc('account_username_available',{p_name:name,p_except:except??null});checked(r.error);return r.data===true;}
 async directory(actor:string,session:string,q:{search:string;status:string;page:number;id?:string}){const r=await this.db.rpc('admin_account_directory',{p_actor:actor,p_session:session,p_search:q.search,p_status:q.status,p_page:q.page,p_id:q.id??null});checked(r.error);return r.data;}
 async create(email:string,password:string,passwordHash:string,actor:string){
  // Supabase requires login confirmation for password sign-in. This is an
  // explicit ADMIN APPROVAL, not proof of mailbox ownership; our trusted
  // account_controls.email_verified_at stays null and all UIs distinguish it.
  const r=await this.db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{manhunt_provisioning:'admin',manhunt_temporary_password_hash:passwordHash}});
  if(r.error){if(['email_exists','user_already_exists'].includes(r.error.code??''))throw new HttpError(409,'Zu dieser E-Mail-Adresse existiert bereits ein Konto. Vorhandene Konten werden nicht überschrieben.');throw new HttpError(503,'Das Konto konnte nicht angelegt werden. Bitte erneut prüfen, bevor du es noch einmal versuchst.');}
  if(!r.data.user)throw new HttpError(503,'Die Kontoerstellung wurde nicht bestätigt.');
  const control=await this.db.from('account_controls').update({created_by:actor}).eq('user_id',r.data.user.id);checked(control.error);
  return{id:r.data.user.id,email:r.data.user.email!};
 }
 async setDisabled(id:string,disabled:boolean){
  // Fail closed: close application access before banning; remove the Auth ban
  // before reopening application access. No account, profile or match is deleted.
  if(disabled){const r=await this.db.from('account_controls').update({disabled:true,updated_at:new Date().toISOString()}).eq('user_id',id);checked(r.error);}
  const auth=await this.db.auth.admin.updateUserById(id,{ban_duration:disabled?'876000h':'none'});if(auth.error)throw new HttpError(503,'Der Anmeldestatus konnte nicht aktualisiert werden. Das Konto bleibt geschützt.');
  if(!disabled){const r=await this.db.from('account_controls').update({disabled:false,updated_at:new Date().toISOString()}).eq('user_id',id);checked(r.error);}
  const sessions=await this.db.from('admin_sessions').delete().eq('user_id',id);checked(sessions.error);
 }
 async resetPassword(email:string){const r=await this.db.auth.resetPasswordForEmail(email,{redirectTo:'https://manhunt-pwa.vercel.app/auth/callback'});if(r.error)throw new HttpError(r.error.status===429?429:503,'Die E-Mail konnte nicht angefordert werden. Das Versandkontingent kann ausgeschöpft sein; es wurde kein neues Passwort erzeugt.');}
 async beginPasswordReset(actor:Identity,target:string,lock:string,hash:string){const r=await this.db.rpc('admin_begin_password_reset',{p_actor:actor.id,p_session:actor.sessionId,p_target:target,p_lock:lock,p_hash:hash});checked(r.error);}
 async setTemporaryPassword(target:string,password:string){
  const r=await this.db.auth.admin.updateUserById(target,{password});
  if(r.error)throw new HttpError(503,'Das vorläufige Passwort konnte nicht bestätigt werden. Der Zugang bleibt gesperrt; bitte den manuellen Reset erneut ausführen.');
 }
 async finishPasswordReset(actor:Identity,target:string,lock:string,success:boolean){const r=await this.db.rpc('admin_finish_password_reset',{p_actor:actor.id,p_session:actor.sessionId,p_target:target,p_lock:lock,p_success:success});checked(r.error);}
 async email(id:string){const r=await this.db.auth.admin.getUserById(id);if(r.error||!r.data.user?.email)throw new HttpError(404,'Dieses E-Mail-Konto wurde nicht gefunden.');return r.data.user.email;}
 async lockPassword(id:string,lock:string){
  const now=new Date().toISOString();
  const r=await this.db.from('account_controls').update({setup_lock:lock,setup_lock_until:new Date(Date.now()+60000).toISOString()}).eq('user_id',id).eq('setup_stage',0).eq('disabled',false).eq('password_reset_pending',false).or(`setup_lock.is.null,setup_lock_until.lt.${now}`).select('user_id');checked(r.error);return r.data?.length===1;
 }
 async changePassword(id:string,password:string,token:string){
  const r=await this.db.auth.admin.updateUserById(id,{password,app_metadata:{manhunt_temporary_password_hash:null}});
  if(r.error)throw new HttpError(400,'Das neue Passwort wurde abgelehnt. Verwende ein starkes, eigenes Passwort.');
  const revoke=await this.db.auth.admin.signOut(token,'others');if(revoke.error)throw new HttpError(503,'Andere Sitzungen konnten noch nicht beendet werden. Bitte wiederhole die Passwortänderung.');
 }
 async finishPassword(id:string,lock:string,success:boolean){const r=await this.db.rpc('account_finish_password',{p_user:id,p_lock:lock,p_success:success});checked(r.error);}
 async setupStep(id:string,stage:1|2,name?:string){const r=await this.db.rpc('account_setup_step',{p_user:id,p_stage:stage,p_name:name??null});checked(r.error);}
 async profile(id:string){const profile=await this.repository.getProfile({id,expiresAt:Date.now()+60000});return{username:profile.username,avatar_url:profile.avatar_url};}
 async avatar(id:string,path:string){await this.repository.setAvatar(id,path);}
 async audit(actor:string,action:string,target?:string){await this.repository.audit(actor,action,target?{targetId:target}:{});}
}
