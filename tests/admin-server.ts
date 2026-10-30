import {TestTrafficStore} from './traffic-fixtures';
/** LOCAL AUTOMATED TEST SERVER ONLY: simulated Supabase Auth/mailbox and users.
 * Never deployed, never contacted by a production build. Real AccountService,
 * Edge routing, game engine and both React/Supabase clients run unchanged. */
import {createServer} from 'node:http';
import {randomUUID,randomInt} from 'node:crypto';
import {AccountService} from '../server/accounts';
import {createEdgeHandler} from '../server/edge-runtime';
import {TestEdgeStore} from './edge-fixtures';
import {TestAccountStore} from './account-fixtures';
import {HttpError,type Identity} from '../server/auth';
if(process.env.NODE_ENV!=='test'||process.env.TEST_AUTH!=='true')throw Error('Isolated admin fixture requires explicit test opt-in.');
const store=new TestAccountStore(),edge=new TestEdgeStore(),service=new AccountService(store,Date.now,new TestTrafficStore(edge.lobbies)),tokens=new Map<string,Identity>(),confirmed=new Set<string>(),otps=new Map<string,{code:string;expires:number;used:boolean}>();
store.repo.checkpoints=edge.lobbies;
const admin={id:randomUUID(),username:'AdminFixture',email:'admin@isolated.invalid',expiresAt:Date.now()+3600000},player={id:randomUUID(),username:'PlayerFixture',email:'player@isolated.invalid',expiresAt:Date.now()+3600000};
await store.seed(admin,admin.email,'Admin-Test-Password1',true);await store.seed(player,player.email,'Player-Test-Password1');confirmed.add(admin.id);confirmed.add(player.id);
const codeAdmin={id:randomUUID(),username:'CodeAdminFixture',email:'code-admin@isolated.invalid',expiresAt:Date.now()+3600000};await store.seed(codeAdmin,codeAdmin.email,'Admin-Test-Password1',true);confirmed.add(codeAdmin.id);
function user(id:string){const c=store.controls.get(id)!;return{id,email:store.emails.get(id),aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},email_confirmed_at:confirmed.has(id)||c.source==='admin'?'2026-01-01T00:00:00Z':null,created_at:'2026-01-01T00:00:00Z',is_anonymous:false};}
function session(id:string){const u=user(id),identity={id,email:u.email,username:store.repo.profiles.get(id)!.username,emailVerified:!!u.email_confirmed_at,sessionId:randomUUID(),expiresAt:Date.now()+3600000},encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:id,session_id:identity.sessionId,exp:Math.floor(identity.expiresAt/1000),role:'authenticated'})}.isolated-admin-fixture`;tokens.set(token,identity);store.live.add(identity.sessionId);store.sessionOwners.set(identity.sessionId,id);return{access_token:token,refresh_token:'isolated-refresh-'+identity.sessionId,token_type:'bearer',expires_in:3600,expires_at:Math.floor(identity.expiresAt/1000),user:u};}
function verify(token:string){const i=tokens.get(token);if(!i||!store.live.has(i.sessionId!))throw new HttpError(401,'Ungültige Test-Sitzung.');return i;}
store.changePassword=async(id,password,token)=>{store.passwords.set(id,password);store.revokeUser(id);};
const handler=createEdgeHandler({repository:store.repo,store:edge,accounts:service,origins:['http://127.0.0.1:4175','http://127.0.0.1:5176'],verify:async t=>verify(t)});
const server=createServer(async(req,res)=>{
 // Browser GPS and server freshness checks use the same progressing test clock.
 edge.clock=Date.now();
 const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bodyText=Buffer.concat(chunks).toString(),body=bodyText?JSON.parse(bodyText):{},url=new URL(req.url!,'http://127.0.0.1:3003');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':req.headers.origin??'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-manhunt-admin-session','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'};
 const respond=(value:unknown,status=200)=>{res.writeHead(status,headers);res.end(JSON.stringify(value));};
 if(req.method==='OPTIONS'){respond({},204);return;}
 try{
  if(url.pathname==='/__test/mailbox'){const email=url.searchParams.get('email')!;respond(otps.get(email)??{},200);return;}
  if(url.pathname==='/__test/expire-otp'){const otp=otps.get(body.email);if(otp)otp.expires=0;respond({ok:true});return;}
  if(url.pathname.startsWith('/auth/v1/')){
   if(url.pathname==='/auth/v1/token'){
    const id=[...store.emails].find(([,email])=>email===body.email)?.[0];
    if(!id||store.passwords.get(id)!==body.password){respond({code:'invalid_credentials',msg:'Invalid credentials'},400);return;}
    const c=store.controls.get(id)!;
    if(c.disabled){respond({code:'user_banned',msg:'Account disabled'},403);return;}
    if(!confirmed.has(id)&&c.source!=='admin'){respond({code:'email_not_confirmed',msg:'Email not confirmed'},400);return;}
    respond(session(id));return;
   }
   if(url.pathname==='/auth/v1/signup'){
    if([...store.emails.values()].includes(body.email)){respond({code:'user_already_exists',msg:'Already exists'},409);return;}
    if(!await store.available(body.data?.username)){respond({code:'user_already_exists',msg:'Username taken'},409);return;}
    const id=randomUUID();await store.seed({id,username:body.data.username,expiresAt:Date.now()+3600000},body.email,body.password);store.controls.get(id)!.email_verified_at=null;
    otps.set(body.email,{code:String(randomInt(100000,1000000)),expires:Date.now()+60000,used:false});respond(user(id));return;
   }
   if(url.pathname==='/auth/v1/resend'){otps.set(body.email,{code:String(randomInt(100000,1000000)),expires:Date.now()+60000,used:false});respond({});return;}
   if(url.pathname==='/auth/v1/verify'){
    const otp=otps.get(body.email),id=[...store.emails].find(([,e])=>e===body.email)?.[0];
    if(!id||!otp||otp.used||otp.expires<Date.now()||otp.code!==body.token){respond({code:'otp_expired',msg:'Invalid or expired code'},403);return;}
    otp.used=true;confirmed.add(id);store.controls.get(id)!.email_verified_at=new Date().toISOString();respond(session(id));return;
   }
   const identity=verify(String(req.headers.authorization??'').replace(/^Bearer /,''));
   if(url.pathname==='/auth/v1/user'){respond(user(identity.id));return;}
   if(url.pathname==='/auth/v1/logout'){store.live.delete(identity.sessionId!);respond({},204);return;}
   respond({error:'Unsupported isolated Auth operation'},404);return;
  }
  const response=await handler(new Request(url,{method:req.method,headers:req.headers as Record<string,string>,body:['GET','HEAD'].includes(req.method!)?undefined:bodyText||undefined}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 }catch(error){respond({error:error instanceof Error?error.message:'Test server error'},error instanceof HttpError?error.status:500);}
});
server.listen(3003,'127.0.0.1');
