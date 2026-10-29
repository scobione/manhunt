import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const {supabaseUrl}=JSON.parse(readFileSync(new URL('../src/public-config.json',import.meta.url),'utf8'));
const origin=new URL(supabaseUrl).origin;
const storageKey=`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`;
const testUser={id:'a1111111-1111-4111-8111-111111111111',email:'verified-test@example.invalid',aud:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};

// Explicitly isolated browser fixtures. Every Supabase call is intercepted;
// no test identity, session or account is created in the real project.
function sessionFixture(){
 const expires=Math.floor(Date.now()/1000)+3600;
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:testUser.id,exp:expires,role:'authenticated'})}.isolated-test-signature`;
 return {access_token:token,refresh_token:'isolated-test-refresh',token_type:'bearer',expires_at:expires,expires_in:3600,user:{...testUser,email:'unverified-cache@example.invalid'}};
}
async function seedSession(page:Page,valid:boolean){
 const session=sessionFixture();
 await page.addInitScript(({storageKey,session})=>localStorage.setItem(storageKey,JSON.stringify(session)),{storageKey,session});
 await page.route(`${origin}/**`,route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/auth/v1/user')return route.fulfill({status:valid?200:401,contentType:'application/json',body:JSON.stringify(valid?testUser:{msg:'Invalid JWT',code:'bad_jwt'})});
  if(path==='/auth/v1/logout')return route.fulfill({status:204});
  return route.abort();
 });
 await page.route('**/api/config',route=>route.fulfill({status:503,body:'Unavailable'}));
}

test('verified Google session completes without a game server and can sign out',async({page})=>{
 await seedSession(page,true);
 const unwanted:string[]=[];
 page.on('request',request=>{if(/\/api\/profile|\/socket\.io/.test(request.url()))unwanted.push(new URL(request.url()).pathname);});
 await page.goto('/auth/callback');
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toBeVisible();
 await expect(page.getByText('Angemeldet als verified-test@example.invalid.')).toBeVisible();
 await expect(page.getByText(/unverified-cache@example/)).toHaveCount(0);
 await expect(page.getByText(/Der Spielserver ist noch nicht verbunden/)).toBeVisible();
 await page.getByRole('button',{name:'Abmelden',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();
 expect(unwanted).toEqual([]);
});

test('cached account claims never count as a verified session',async({page})=>{
 await seedSession(page,false);
 await page.goto('/auth/callback');
 await expect(page.getByRole('alert')).toContainText('Sitzung konnte nicht bestätigt');
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
 await expect(page.getByText(/unverified-cache@example/)).toHaveCount(0);
});

test('cancelled OAuth returns to a recoverable login screen',async({page})=>{
 await page.route(`${origin}/**`,route=>route.abort());
 await page.goto('/auth/callback?error=access_denied&error_description=User%20cancelled');
 await expect(page.getByRole('heading',{name:'Anmeldung abschließen'})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('Die Anmeldung wurde abgebrochen');
 await page.getByRole('link',{name:'Zur Anmeldung',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Google/})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
});

test('provider callback failure is explained without exposing raw OAuth details',async({page})=>{
 await page.route(`${origin}/**`,route=>route.abort());
 await page.goto('/auth/callback#error=server_error&error_code=unexpected_failure&error_description=Unable%20to%20exchange%20external%20code%3A%20isolated-sensitive-code');
 await expect(page.getByRole('alert')).toContainText('Melde dich mit deiner bisherigen E-Mail-Adresse an');
 await expect(page.getByText(/isolated-sensitive-code/)).toHaveCount(0);
 await expect(page).toHaveURL(/\/auth\/callback\/?$/);
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
});

test('callback in a different browser explains the missing local verifier',async({page})=>{
 const tokenRequests:string[]=[];
 await page.route(`${origin}/**`,route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/auth/'))tokenRequests.push(path);return route.abort();});
 await page.goto('/auth/callback?code=isolated-code-without-local-verifier');
 await expect(page.getByRole('alert')).toContainText('Der Anmeldenachweis fehlt in diesem Browser');
 await expect(page.getByRole('alert')).toContainText('Safari');
 await expect(page).toHaveURL(/\/auth\/callback\/?$/);
 expect(tokenRequests).toEqual([]);
});

for(const valid of [true,false])test(`PKCE callback ${valid?'exchanges once and verifies the returned identity':'reports a rejected verifier instead of silently losing the error'}`,async({page})=>{
 const verifier='isolated-playwright-code-verifier-'.repeat(2);
 await page.addInitScript(({key,verifier})=>localStorage.setItem(key,JSON.stringify(verifier)),{key:`${storageKey}-code-verifier`,verifier});
 let exchanges=0;
 await page.route(`${origin}/**`,route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/token'){
   exchanges++;
   expect(url.searchParams.get('grant_type')).toBe('pkce');
   expect(route.request().postDataJSON()).toEqual({auth_code:'isolated-pkce-code',code_verifier:verifier});
   return route.fulfill({status:valid?200:400,headers:{'X-Supabase-Api-Version':'2024-01-01','Access-Control-Expose-Headers':'X-Supabase-Api-Version'},contentType:'application/json',body:JSON.stringify(valid?sessionFixture():{code:'bad_code_verifier',msg:'Invalid verifier'})});
  }
  if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testUser)});
  return route.abort();
 });
 await page.goto('/auth/callback?code=isolated-pkce-code');
 if(valid){
  await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toBeVisible();
  await expect(page.getByText('Angemeldet als verified-test@example.invalid.')).toBeVisible();
 }else{
  await expect(page.getByRole('alert')).toContainText('Anmeldeversuch ist abgelaufen oder nicht mehr gültig');
  await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
 }
 expect(exchanges).toBe(1);
 await expect(page).toHaveURL(/\/auth\/callback\/?$/);
});

const apiHeaders={'X-Supabase-Api-Version':'2024-01-01','Access-Control-Expose-Headers':'X-Supabase-Api-Version'};
test('email password login rejects wrong credentials and verifies a successful session',async({page})=>{
 let valid=false;
 await page.route(`${origin}/**`,route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/token'){
   expect(url.searchParams.get('grant_type')).toBe('password');
   const body=route.request().postDataJSON();expect(body.email).toBe('email-test@example.invalid');expect(body.password).toBe('isolated-password-123');
   return route.fulfill({status:valid?200:400,headers:apiHeaders,contentType:'application/json',body:JSON.stringify(valid?sessionFixture():{code:'invalid_credentials',msg:'Invalid login credentials'})});
  }
  if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testUser)});
  return route.abort();
 });
 await page.goto('/login');await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('email-test@example.invalid');await page.getByLabel('Passwort',{exact:true}).fill('isolated-password-123');
 await page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('E-Mail-Adresse oder Passwort stimmen nicht.');
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
 valid=true;await page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toBeVisible();
 await expect(page.getByText('Angemeldet als verified-test@example.invalid.')).toBeVisible();
 expect(new URL(page.url()).pathname).toMatch(/^\/login\/?$/);
});

for(const allowed of [true,false])test(`email signup ${allowed?'requires confirmation and can resend it':'explains unavailable SMTP delivery'}`,async({page})=>{
 let resent=0;
 await page.route(`${origin}/**`,route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/signup'){
   const body=route.request().postDataJSON();expect(body.email).toBe('email-test@example.invalid');expect(body.password).toBe('isolated-password-123');expect(body.data.username).toBe('Email.Test');expect(body.code_challenge_method).toBe('s256');
   expect(new URL(url.searchParams.get('redirect_to')!).pathname).toBe('/auth/callback');
   return route.fulfill({status:allowed?200:400,headers:apiHeaders,contentType:'application/json',body:JSON.stringify(allowed?{...testUser,identities:[]}:{code:'email_address_not_authorized',msg:'Email not authorized'})});
  }
  if(url.pathname==='/auth/v1/resend'){resent++;expect(route.request().postDataJSON().type).toBe('signup');return route.fulfill({status:200,contentType:'application/json',body:'{}'});}
  return route.abort();
 });
 await page.goto('/login');await page.getByRole('button',{name:'Registrieren',exact:true}).click();
 await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('email-test@example.invalid');await page.getByRole('textbox',{name:/Benutzername/}).fill('Email.Test');
 await page.getByLabel('Passwort',{exact:true}).fill('isolated-password-123');await page.getByLabel('Passwort wiederholen',{exact:true}).fill('different-password');
 await page.getByRole('button',{name:'Konto erstellen',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Passwörter stimmen nicht überein');
 await page.getByLabel('Passwort wiederholen',{exact:true}).fill('isolated-password-123');await page.getByRole('button',{name:'Konto erstellen',exact:true}).click();
 if(allowed){await expect(page.getByRole('status')).toContainText('bestätige deine E-Mail-Adresse');await page.clock.install();await page.clock.fastForward(61000);await page.getByRole('button',{name:'Bestätigung erneut senden'}).click();await expect(page.getByRole('status')).toContainText('Bestätigung erneut angefordert');expect(resent).toBe(1);}
 else await expect(page.getByRole('alert')).toContainText('E-Mail-Versand ist für diese Adresse noch nicht freigeschaltet');
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
});

test('password reset request uses the already allowed callback and a neutral confirmation',async({page})=>{
 let requested=false;
 await page.route(`${origin}/**`,route=>{
  const url=new URL(route.request().url());
  if(url.pathname!=='/auth/v1/recover')return route.abort();
  expect(route.request().postDataJSON().email).toBe('email-test@example.invalid');
  expect(new URL(url.searchParams.get('redirect_to')!).pathname).toBe('/auth/callback');requested=true;
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.goto('/login');await page.getByRole('button',{name:'Passwort vergessen?',exact:true}).click();
 await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('email-test@example.invalid');await page.getByRole('button',{name:'Link zum Zurücksetzen anfordern'}).click();
 await expect(page.getByRole('status')).toContainText('Falls ein Konto zu dieser Adresse besteht');expect(requested).toBe(true);
});

test('recovery callback verifies the session before accepting a new password',async({page})=>{
 let changed=false;
 await page.route(`${origin}/**`,route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/recover')return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  if(url.pathname==='/auth/v1/token'){expect(route.request().postDataJSON().code_verifier.length).toBeGreaterThanOrEqual(43);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(sessionFixture())});}
  if(url.pathname==='/auth/v1/user'){
   if(route.request().method()==='PUT'){expect(route.request().postDataJSON().password).toBe('new-isolated-password-123');changed=true;}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testUser)});
  }
  return route.abort();
 });
 await page.goto('/login');await page.getByRole('button',{name:'Passwort vergessen?',exact:true}).click();
 await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('email-test@example.invalid');await page.getByRole('button',{name:'Link zum Zurücksetzen anfordern'}).click();
 await expect(page.getByRole('status')).toContainText('Falls ein Konto zu dieser Adresse besteht');
 await page.goto('/auth/callback?code=isolated-recovery-code');
 await expect(page.getByRole('heading',{name:'Neues Passwort festlegen'})).toBeVisible();
 await page.getByLabel('Neues Passwort',{exact:true}).fill('new-isolated-password-123');await page.getByLabel('Neues Passwort wiederholen',{exact:true}).fill('new-isolated-password-123');
 await page.getByRole('button',{name:'Neues Passwort speichern',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Dein Passwort wurde gespeichert');expect(changed).toBe(true);
 await expect(page.getByRole('heading',{name:'Neues Passwort festlegen'})).toHaveCount(0);
});


test('email verification accepts a code inside the installed-app flow without a PKCE verifier',async({page})=>{
 let checks=0;await page.route(`${origin}/**`,route=>{const url=new URL(route.request().url());if(url.pathname==='/auth/v1/signup')return route.fulfill({status:200,headers:apiHeaders,contentType:'application/json',body:JSON.stringify({...testUser,identities:[]})});if(url.pathname==='/auth/v1/verify'){checks++;expect(route.request().postDataJSON()).toMatchObject({email:'code-test@example.invalid',token:'123456',type:'email'});return route.fulfill({status:200,headers:apiHeaders,contentType:'application/json',body:JSON.stringify(sessionFixture())});}if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testUser)});return route.abort();});
 await page.goto('/login');await page.getByRole('button',{name:'Registrieren',exact:true}).click();await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('code-test@example.invalid');await page.getByRole('textbox',{name:/Benutzername/}).fill('Code.Test');await page.getByLabel('Passwort',{exact:true}).fill('isolated-password-123');await page.getByLabel('Passwort wiederholen',{exact:true}).fill('isolated-password-123');await page.getByRole('button',{name:'Konto erstellen',exact:true}).click();
 await page.getByLabel('Verifizierungscode aus der E-Mail').fill('123456');await page.getByRole('button',{name:'E-Mail mit Code bestätigen'}).click();await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toBeVisible();expect(checks).toBe(1);
});


test('a guest joins a private lobby without email or password and survives reload',async({page})=>{
 const {createEdgeHandler}=await import('../server/edge-runtime');const {MemoryRepository}=await import('../server/repository');const {TestEdgeStore}=await import('./edge-fixtures');
 const store=new TestEdgeStore(),repository=new MemoryRepository();repository.checkpoints=store.lobbies;
 const guestUser={...testUser,is_anonymous:true,email:undefined,app_metadata:{provider:'anonymous'}};
 const guestSession={...sessionFixture(),user:guestUser};
 const hostId='b2222222-2222-4222-8222-222222222222';
 const handler=createEdgeHandler({store,repository,origins:['http://127.0.0.1:4173'],verify:async token=>({id:token==='isolated-host'?hostId:guestUser.id,username:token==='isolated-host'?'GuestTestHost':'GuestTest',expiresAt:Date.now()+60000,isGuest:token!=='isolated-host'})});
 const made=await handler(new Request('http://isolated/api/events',{method:'POST',headers:{Authorization:'Bearer isolated-host'},body:JSON.stringify({event:'lobby:create',data:{}})}));const lobby=(await made.json()).lobby;
 let anonymousRequests=0;
 await page.route(`${origin}/**`,route=>{const path=new URL(route.request().url()).pathname;if(path==='/auth/v1/signup'){anonymousRequests++;const body=route.request().postDataJSON();expect(body.email).toBeUndefined();expect(body.password).toBeUndefined();return route.fulfill({status:200,headers:apiHeaders,contentType:'application/json',body:JSON.stringify(guestSession)});}if(path==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(guestUser)});return route.abort();});
 await page.route('**/api/**',async route=>{store.clock=Date.now();const r=route.request();const response=await handler(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{} )}));await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
 await page.goto(`/join?code=${lobby.code}`);await expect(page.getByLabel('E-Mail-Adresse',{exact:true})).toHaveCount(0);await page.getByLabel('Dein Gastname').fill('EventGast');await page.getByRole('button',{name:'Als Gast beitreten',exact:true}).click();await expect(page).toHaveURL(/\/lobby$/);await expect(page.locator('.player-row')).toHaveCount(2);await expect(page.locator('.player-row').filter({hasText:'Gast_EventGast_'})).toBeVisible();expect(anonymousRequests).toBe(1);
 await page.reload();await expect(page.getByTestId('lobby-code')).toHaveText(lobby.code);expect(anonymousRequests).toBe(1);
 const forbidden=await handler(new Request('http://isolated/api/events',{method:'POST',headers:{Authorization:`Bearer ${guestSession.access_token}`},body:JSON.stringify({event:'lobby:create',data:{}})}));expect(forbidden.status).toBe(403);
});

for(const landing of ['/', '/auth/callback'])test(`RESET-REG-02 recovery fragment on ${landing} opens password page and survives reload`,async({page})=>{
 await page.setViewportSize({width:390,height:844});const session=sessionFixture();let changed=0;
 await page.route(`${origin}/**`,route=>{
  if(new URL(route.request().url()).pathname==='/auth/v1/user'){
   if(route.request().method()==='PUT')changed++;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testUser)});
  }
  return route.abort();
 });
 await page.route('**/api/config',route=>route.fulfill({status:503,body:'Unavailable'}));
 const fragment=new URLSearchParams({access_token:session.access_token,refresh_token:session.refresh_token,expires_in:'3600',token_type:'bearer',type:'recovery'});
 await page.goto(`${landing}#${fragment}`);
 await expect(page).toHaveURL(/\/auth\/recovery$/);await expect(page.getByRole('heading',{name:'Neues Passwort festlegen'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Neues Passwort festlegen'})).toBeVisible();
 const password=page.getByLabel('Neues Passwort',{exact:true});await password.fill('New-Isolated-Password123');await expect(password).toHaveAttribute('type','password');
 await page.getByRole('button',{name:'Neues Passwort anzeigen',exact:true}).click();await expect(password).toHaveAttribute('type','text');expect(changed).toBe(0);
 await page.getByRole('button',{name:'Neues Passwort verbergen',exact:true}).click();await expect(password).toHaveAttribute('type','password');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results-public/recovery-mobile.png',fullPage:true});
 await page.getByLabel('Neues Passwort wiederholen',{exact:true}).fill('New-Isolated-Password123');await page.getByRole('button',{name:'Neues Passwort speichern'}).click();
 await expect(page.getByRole('status')).toContainText('Dein Passwort wurde gespeichert');expect(changed).toBe(1);await page.reload();await expect(page.getByRole('heading',{name:'Neues Passwort festlegen'})).toHaveCount(0);
});
test('RESET-REG-03 expired recovery link cannot reuse a cached account to show a password form',async({page})=>{
 await seedSession(page,true);await page.goto('/#type=recovery&error=access_denied&error_code=otp_expired&error_description=Expired');
 await expect(page).toHaveURL(/\/auth\/recovery$/);await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('Neues Passwort',{exact:true})).toHaveCount(0);
});

for(const cached of [false,true])test(`RESET-REG-05 expired link without recovery type (${cached?'existing account':'no session'}) explains failure and permits a fresh reset`,async({page})=>{
 let profileLoaded=false;
 if(cached){
  await seedSession(page,true);
  await page.route('**/api/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({configured:true,authConfigured:true,transport:'http'})}));
  await page.route('**/api/profile',route=>{profileLoaded=true;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:testUser.id,username:'ExistingPlayer',avatar_url:null,friend_code:'ISOLATED',show_online:false})});});
  await page.route('**/api/sync',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({lobby:null,socialRevision:0,serverTime:Date.now()})}));
 }else{await page.route(`${origin}/**`,route=>route.abort());await page.route('**/api/config',route=>route.fulfill({status:503,body:'Unavailable'}));}
 await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired');
 await expect(page).toHaveURL(/\/auth\/callback\/?$/);
 if(cached)await expect.poll(()=>profileLoaded).toBe(true);
 await expect(page.getByRole('alert')).toContainText('abgelaufen');
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
 await expect(page.getByLabel('Neues Passwort',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Neuen Reset-Link anfordern',exact:true}).click();
 await expect(page).toHaveURL(/\/login\?reset=1$/);await expect(page.getByRole('button',{name:'Link zum Zurücksetzen anfordern'})).toBeVisible();
});

test('RESET-REG-06 missing browser verifier on home-page callback opens an actionable error instead of home',async({page})=>{
 await page.route(`${origin}/**`,route=>route.abort());await page.route('**/api/config',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/?code=isolated-code-missing-verifier');await expect(page).toHaveURL(/\/auth\/callback\/?$/);
 await expect(page.getByRole('alert')).toContainText('Der Anmeldenachweis fehlt in diesem Browser');
 await page.getByRole('link',{name:'Zur Anmeldung',exact:true}).click();await expect(page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true})).toBeVisible();
});

test('AUTH-RETURN-05 pending email verifier never exchanges a six-character lobby code',async({page})=>{
 const verifier='isolated-pending-email-verifier-'.repeat(2);let exchanges=0;
 await page.addInitScript(({key,verifier})=>localStorage.setItem(key,JSON.stringify(verifier)),{key:`${storageKey}-code-verifier`,verifier});
 await page.route(`${origin}/**`,route=>{if(new URL(route.request().url()).pathname==='/auth/v1/token'){exchanges++;return route.fulfill({status:400,headers:apiHeaders,contentType:'application/json',body:JSON.stringify({code:'bad_code_verifier',msg:'Invalid verifier'})});}return route.abort();});
 await page.route('**/api/config',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/join?code=K7M4XP');await expect(page.getByRole('button',{name:'Als Gast beitreten',exact:true})).toBeEnabled();
 expect(exchanges).toBe(0);await expect(page.getByLabel('Lobby-Code',{exact:true})).toHaveValue('K7M4XP');
 expect(await page.evaluate(key=>localStorage.getItem(key),`${storageKey}-code-verifier`)).toBe(JSON.stringify(verifier));
});
