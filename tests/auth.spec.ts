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
 await expect(page.getByRole('alert')).toContainText('Die Google-Anmeldung wurde abgebrochen');
 await page.getByRole('link',{name:'Zur Anmeldung',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mit Google fortfahren'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
});

test('provider callback failure is explained without exposing raw OAuth details',async({page})=>{
 await page.route(`${origin}/**`,route=>route.abort());
 await page.goto('/auth/callback#error=server_error&error_code=unexpected_failure&error_description=Unable%20to%20exchange%20external%20code%3A%20isolated-sensitive-code');
 await expect(page.getByRole('alert')).toContainText('Die Google-Verbindung muss vom Betreiber geprüft werden');
 await expect(page.getByText(/isolated-sensitive-code/)).toHaveCount(0);
 await expect(page).toHaveURL(/\/auth\/callback\/?$/);
 await expect(page.getByRole('heading',{name:'Anmeldung erfolgreich.'})).toHaveCount(0);
});

test('callback in a different browser explains the missing local verifier',async({page})=>{
 const tokenRequests:string[]=[];
 await page.route(`${origin}/**`,route=>{tokenRequests.push(new URL(route.request().url()).pathname);return route.abort();});
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
   const body=route.request().postDataJSON();expect(body.email).toBe('email-test@example.invalid');expect(body.password).toBe('isolated-password-123');expect(body.code_challenge_method).toBe('s256');
   expect(new URL(url.searchParams.get('redirect_to')!).pathname).toBe('/auth/callback');
   return route.fulfill({status:allowed?200:400,headers:apiHeaders,contentType:'application/json',body:JSON.stringify(allowed?{...testUser,identities:[]}:{code:'email_address_not_authorized',msg:'Email not authorized'})});
  }
  if(url.pathname==='/auth/v1/resend'){resent++;expect(route.request().postDataJSON().type).toBe('signup');return route.fulfill({status:200,contentType:'application/json',body:'{}'});}
  return route.abort();
 });
 await page.goto('/login');await page.getByRole('button',{name:'Registrieren',exact:true}).click();
 await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('email-test@example.invalid');
 await page.getByLabel('Passwort',{exact:true}).fill('isolated-password-123');await page.getByLabel('Passwort wiederholen',{exact:true}).fill('different-password');
 await page.getByRole('button',{name:'Konto erstellen',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Passwörter stimmen nicht überein');
 await page.getByLabel('Passwort wiederholen',{exact:true}).fill('isolated-password-123');await page.getByRole('button',{name:'Konto erstellen',exact:true}).click();
 if(allowed){await expect(page.getByRole('status')).toContainText('bestätige deine E-Mail-Adresse');await page.getByRole('button',{name:'Bestätigung erneut senden'}).click();await expect(page.getByRole('status')).toContainText('Bestätigung erneut angefordert');expect(resent).toBe(1);}
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
