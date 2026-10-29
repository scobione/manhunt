import {createHash,randomBytes,randomUUID,pbkdf2Sync,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {trafficSchema,type TrafficStore} from './traffic';
import {HttpError,type Identity} from './auth';
import type {AccountState,SetupStage} from '../shared/accounts';
import {USERNAME_PATTERN,PASSWORD_MIN_LENGTH} from '../shared/accounts';

export interface Control {
 user_id:string;is_admin:boolean;disabled:boolean;setup_stage:SetupStage;
 source:AccountState['source'];email_verified_at:string|null;temporary_password_hash:string|null;
 password_return_stage?:1|2|3;password_reset_pending?:boolean;
}
export interface Security {code_hash:string|null;code_salt:string|null;revision:number;}
export interface AdminSession {token_hash:string;user_id:string;auth_session_id:string;security_revision:number;expires_at:string;}
export interface AccountStore {
 control(id:string):Promise<Control>;
 sessionLive(user:string,session:string):Promise<boolean>;
 security():Promise<Security>;
 saveSession(session:AdminSession):Promise<void>;
 session(hash:string):Promise<AdminSession|null>;
 revokeSession(hash:string,user:string):Promise<void>;
 changeCode(hash:string|null,salt:string|null):Promise<void>;
 quota(id:string,scope:string,limit:number):Promise<void>;
 available(name:string,except?:string):Promise<boolean>;
 directory(actor:string,session:string,query:{search:string;status:string;page:number;id?:string}):Promise<unknown>;
 create(email:string,password:string,passwordHash:string,actor:string):Promise<{id:string;email:string}>;
 setDisabled(id:string,disabled:boolean):Promise<void>;
 resetPassword(email:string):Promise<void>;
 beginPasswordReset(actor:Identity,target:string,lock:string,hash:string):Promise<void>;
 setTemporaryPassword(target:string,password:string):Promise<void>;
 finishPasswordReset(actor:Identity,target:string,lock:string,success:boolean):Promise<void>;
 email(id:string):Promise<string>;
 lockPassword(id:string,lock:string):Promise<boolean>;
 changePassword(id:string,password:string,token:string):Promise<void>;
 finishPassword(id:string,lock:string,success:boolean):Promise<void>;
 setupStep(id:string,stage:1|2,name?:string):Promise<void>;
 profile(id:string):Promise<{username:string;avatar_url:string|null}>;
 avatar(id:string,path:string):Promise<void>;
 audit(actor:string,action:string,target?:string):Promise<void>;
}
const nameSchema=z.string().trim().regex(USERNAME_PATTERN,'3–20 Buchstaben, Zahlen, Punkte oder Unterstriche.');
const passwordSchema=z.string().min(PASSWORD_MIN_LENGTH).max(128).refine(v=>/[a-z]/.test(v)&&/[A-Z]/.test(v)&&/[0-9]/.test(v),'Groß- und Kleinbuchstaben sowie eine Zahl verwenden.');
const empty=z.object({}).strict();
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function codeHash(code:string,salt:string){return pbkdf2Sync(code,salt,210000,32,'sha256').toString('hex');}
function sameHash(a:string,b:string){const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');return x.length===32&&y.length===32&&timingSafeEqual(x,y);}
function temporaryHash(password:string){const salt=randomBytes(24).toString('hex');return `pbkdf2$${salt}$${codeHash(password,salt)}`;}
function isTemporaryPassword(password:string,hash:string){const [algorithm,salt,digest]=hash.split('$');return algorithm==='pbkdf2'&&salt&&digest?sameHash(codeHash(password,salt),digest):sameHash(sha(password),hash);}
export class AccountService {
 constructor(readonly store:AccountStore,private now=Date.now,private traffic?:TrafficStore){}
 async state(identity:Identity):Promise<AccountState>{
  const c=await this.store.control(identity.id);
  const p=await this.store.profile(identity.id);
  return{disabled:c.disabled,setupStage:c.setup_stage,isAdmin:c.is_admin,source:c.source,emailVerified:c.source==='admin'?!!c.email_verified_at:!!identity.emailVerified,email:identity.email,username:p.username,avatarUrl:p.avatar_url,passwordOnly:c.setup_stage===0&&c.password_return_stage===3,passwordResetPending:!!c.password_reset_pending};
 }
 async requireGame(identity:Identity){
  const c=await this.store.control(identity.id);
  if(c.disabled)throw new HttpError(403,'Dieses Konto ist deaktiviert. Wende dich an den Administrator.');
  if(c.setup_stage!==3)throw new HttpError(428,'Bitte schließe zuerst die Kontoeinrichtung ab.');
  await this.live(identity);
 }
 async available(raw:unknown){const name=nameSchema.parse(raw);return{available:await this.store.available(name)};}
 private async live(identity:Identity){
  if(!identity.sessionId||!await this.store.sessionLive(identity.id,identity.sessionId))throw new HttpError(401,'Diese Sitzung ist nicht mehr gültig. Bitte melde dich erneut an.');
 }
 private async admin(identity:Identity){
  const c=await this.store.control(identity.id);
  if(identity.isGuest||!c.is_admin||c.disabled||c.setup_stage!==3)throw new HttpError(403,'Für dieses Konto ist kein Administratorzugang freigegeben.');
  await this.live(identity);
 }
 private async ticket(identity:Identity,ticket:string|null){
  await this.admin(identity);
  if(!ticket||!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw new HttpError(401,'Bitte entsperre das Admin-Portal erneut.');
  const [s,security]=await Promise.all([this.store.session(sha(ticket)),this.store.security()]);
  if(!s||s.user_id!==identity.id||s.auth_session_id!==identity.sessionId||s.security_revision!==security.revision||Date.parse(s.expires_at)<=this.now())throw new HttpError(401,'Die Admin-Sitzung ist abgelaufen. Bitte erneut entsperren.');
 }
 async handle(identity:Identity,token:string,path:string,method:string,body:unknown,query:URLSearchParams,ticket:string|null):Promise<unknown>{
  if(path==='/account'&&method==='GET')return this.state(identity);
  if(path.startsWith('/account/setup/'))return this.setup(identity,token,path,method,body);
  if(path==='/traffic'){
   await this.requireGame(identity);if(!this.traffic)throw new HttpError(503,'Die Verbrauchsmessung ist hier nicht eingerichtet.');
   if(method==='POST'){const report=trafficSchema.parse(body);await this.store.quota(identity.id,'traffic-report',12);return this.traffic.report(identity,report);}
   if(method==='GET')throw new HttpError(403,'Verbrauchsdaten sind ausschließlich im Adminportal verfügbar.');
   throw new HttpError(405,'Diese Methode ist nicht erlaubt.');
  }
  if(!path.startsWith('/admin/'))throw new HttpError(404,'Diese Verwaltungsroute existiert nicht.');
  await this.admin(identity);
  if(path==='/admin/access'&&method==='GET')return{codeRequired:!!(await this.store.security()).code_hash,email:identity.email,sessionMinutes:20};
  if(path==='/admin/session'&&method==='POST'){
   const {code}=z.object({code:z.string().max(128).optional()}).strict().parse(body);
   await this.store.quota(identity.id,'admin-unlock',5);
   const security=await this.store.security();
   if(security.code_hash&&(!code||!security.code_salt||!sameHash(codeHash(code,security.code_salt),security.code_hash))){await this.store.audit(identity.id,'admin.unlock_failed');throw new HttpError(403,'Der zusätzliche Zugangscode stimmt nicht.');}
   const sessionToken=randomBytes(32).toString('base64url'),expiresAt=new Date(this.now()+20*60000).toISOString();
   await this.store.saveSession({token_hash:sha(sessionToken),user_id:identity.id,auth_session_id:identity.sessionId!,security_revision:security.revision,expires_at:expiresAt});
   await this.store.audit(identity.id,'admin.session_started');return{sessionToken,expiresAt};
  }
  if(path==='/admin/session'&&method==='DELETE'){empty.parse(body);if(ticket)await this.store.revokeSession(sha(ticket),identity.id);return{ok:true};}
  await this.ticket(identity,ticket);
  if(path==='/admin/traffic'&&method==='GET'){
   if(!this.traffic)throw new HttpError(503,'Die Verbrauchsübersicht ist hier nicht eingerichtet.');
   const matchId=query.has('matchId')?z.uuid().parse(query.get('matchId')):null;const page=z.coerce.number().int().min(0).max(10000).parse(query.get('page')??0);
   return this.traffic.read(identity,true,matchId,page);
  }
  if(path==='/admin/users'&&method==='GET'){
   const q=z.object({search:z.string().max(254).default(''),status:z.enum(['','active','email_pending','setup_pending','disabled']).default(''),page:z.coerce.number().int().min(0).max(10000).default(0)}).parse(Object.fromEntries(query));
   return this.store.directory(identity.id,identity.sessionId!,q);
  }
  if(path==='/admin/users'&&method==='POST'){
   const {email}=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase())}).strict().parse(body);
   await this.store.quota(identity.id,'admin-create',5);
   const password=`Mh!${randomBytes(18).toString('base64url')}9a`;
   const user=await this.store.create(email,password,sha(password),identity.id);
   await this.store.audit(identity.id,'admin.account_created',user.id);
   // Neither a retry endpoint nor the database can return this password again.
   return{id:user.id,email:user.email,temporaryPassword:password,status:'setup_pending',emailVerification:'admin_approved_not_email_verified'};
  }
  const match=path.match(/^\/admin\/users\/([^/]+)(?:\/(status|reset-password|temporary-password))?$/);
  if(match){
   const target=z.string().uuid().parse(match[1]);
   if(!match[2]&&method==='GET')return this.store.directory(identity.id,identity.sessionId!,{search:'',status:'',page:0,id:target});
   if(match[2]==='status'&&method==='PATCH'){
    const {disabled}=z.object({disabled:z.boolean()}).strict().parse(body);
    if(target===identity.id)throw new HttpError(400,'Du kannst deinen eigenen Adminzugang hier nicht deaktivieren.');
    const control=await this.store.control(target);
    if(control.is_admin)throw new HttpError(400,'Administratorrechte werden separat verwaltet.');
    await this.store.setDisabled(target,disabled);await this.store.audit(identity.id,disabled?'admin.account_disabled':'admin.account_enabled',target);return{ok:true};
   }
   if(match[2]==='reset-password'&&method==='POST'){
    empty.parse(body);await this.store.quota(identity.id,'admin-reset',3);
    await this.store.resetPassword(await this.store.email(target));await this.store.audit(identity.id,'admin.reset_requested',target);return{ok:true};
   }
   if(match[2]==='temporary-password'&&method==='POST'){
    const {password,confirmation}=z.object({password:passwordSchema,confirmation:z.string().max(128)}).strict().parse(body);
    if(password!==confirmation)throw new HttpError(400,'Die Passwörter stimmen nicht überein.');
    if(target===identity.id||(await this.store.control(target)).is_admin)throw new HttpError(400,'Für Administratorkonten nutze bitte den persönlichen E-Mail-Reset.');
    await this.store.quota(identity.id,'admin-manual-reset',3);
    const lock=randomUUID();await this.store.beginPasswordReset(identity,target,lock,temporaryHash(password));
    let changed=false;
    try{await this.store.setTemporaryPassword(target,password);changed=true;}
    finally{await this.store.finishPasswordReset(identity,target,lock,changed);}
    await this.store.audit(identity.id,'admin.temporary_password_set',target);
    return{ok:true,requiresPasswordChange:true};
   }
  }
  if(path==='/admin/settings'&&method==='GET')return{codeRequired:!!(await this.store.security()).code_hash,sessionMinutes:20};
  if(path==='/admin/settings/code'&&['POST','DELETE'].includes(method)){
   await this.store.quota(identity.id,'admin-settings',5);
   const {code}=method==='POST'?z.object({code:z.string().min(12).max(128)}).strict().parse(body):(empty.parse(body),{code:undefined});
   const salt=code?randomBytes(24).toString('hex'):null;
   await this.store.changeCode(code?codeHash(code,salt!):null,salt);await this.store.audit(identity.id,'admin.access_code_changed');return{ok:true,requiresUnlock:true};
  }
  throw new HttpError(404,'Diese Verwaltungsroute existiert nicht.');
 }
 private async setup(identity:Identity,token:string,path:string,method:string,body:unknown){
  await this.live(identity);
  const c=await this.store.control(identity.id);
  if(c.disabled)throw new HttpError(403,'Dieses Konto ist deaktiviert.');
  if(c.password_reset_pending)throw new HttpError(409,'Der manuelle Passwort-Reset ist noch nicht abgeschlossen. Bitte den Administrator um Wiederholung bitten.');
  if(method!=='POST')throw new HttpError(405,'Diese Methode ist nicht erlaubt.');
  await this.store.quota(identity.id,'account-setup',10);
  if(path==='/account/setup/password'){
   const {password,confirmation}=z.object({password:passwordSchema,confirmation:z.string().max(128)}).strict().parse(body);
   if(password!==confirmation)throw new HttpError(400,'Die Passwörter stimmen nicht überein.');
   if(c.setup_stage!==0)throw new HttpError(409,'Dieser Einrichtungsschritt ist nicht mehr offen.');
   if(c.temporary_password_hash&&isTemporaryPassword(password,c.temporary_password_hash))throw new HttpError(400,'Bitte ersetze das vorläufige Passwort durch dein eigenes Passwort.');
   const lock=randomUUID();if(!await this.store.lockPassword(identity.id,lock))throw new HttpError(409,'Das Passwort wird bereits geändert. Bitte kurz warten.');
   let changed=false;
   try{await this.store.changePassword(identity.id,password,token);changed=true;}
   finally{await this.store.finishPassword(identity.id,lock,changed);}
   await this.store.audit(identity.id,'account.setup_password');
  }else if(path==='/account/setup/username'){
   const {username}=z.object({username:nameSchema}).strict().parse(body);
   if(c.setup_stage!==1)throw new HttpError(409,'Bitte schließe zuerst den vorherigen Einrichtungsschritt ab.');
   await this.store.setupStep(identity.id,1,username);
  }else if(path==='/account/setup/avatar'){
   const {path:avatar}=z.object({path:z.string().min(1).max(240)}).strict().parse(body);
   if(c.setup_stage!==2)throw new HttpError(409,'Bitte schließe zuerst die vorherigen Schritte ab.');
   await this.store.avatar(identity.id,avatar);
  }else if(path==='/account/setup/complete'){
   z.object({acknowledged:z.literal(true)}).strict().parse(body);
   if(c.setup_stage!==2)throw new HttpError(409,'Bitte schließe zuerst Passwort und Benutzernamen ab.');
   await this.store.setupStep(identity.id,2);await this.store.audit(identity.id,'account.setup_completed');
  }else throw new HttpError(404,'Dieser Einrichtungsschritt existiert nicht.');
  return this.state(identity);
 }
}
