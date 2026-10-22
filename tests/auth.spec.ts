import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const {supabaseUrl}=JSON.parse(readFileSync(new URL('../src/public-config.json',import.meta.url),'utf8'));
const origin=new URL(supabaseUrl).origin;
const storageKey=`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`;
const testUser={id:'a1111111-1111-4111-8111-111111111111',email:'verified-test@example.invalid',aud:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};

// Explicitly isolated browser fixtures. Every Supabase call is intercepted;
// no test identity, session or account is created in the real project.
async function seedSession(page:Page,valid:boolean){
 const expires=Math.floor(Date.now()/1000)+3600;
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:testUser.id,exp:expires,role:'authenticated'})}.isolated-test-signature`;
 const session={access_token:token,refresh_token:'isolated-test-refresh',token_type:'bearer',expires_at:expires,expires_in:3600,user:{...testUser,email:'unverified-cache@example.invalid'}};
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
 await expect(page.getByRole('heading',{name:'Google-Anmeldung erfolgreich.'})).toBeVisible();
 await expect(page.getByText('Angemeldet als verified-test@example.invalid.')).toBeVisible();
 await expect(page.getByText(/unverified-cache@example/)).toHaveCount(0);
 await expect(page.getByText(/Der Spielserver ist noch nicht verbunden/)).toBeVisible();
 await page.getByRole('button',{name:'Abmelden',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Google-Anmeldung erfolgreich.'})).toHaveCount(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();
 expect(unwanted).toEqual([]);
});

test('cached account claims never count as a verified session',async({page})=>{
 await seedSession(page,false);
 await page.goto('/auth/callback');
 await expect(page.getByRole('alert')).toContainText('Sitzung konnte nicht bestätigt');
 await expect(page.getByRole('heading',{name:'Google-Anmeldung erfolgreich.'})).toHaveCount(0);
 await expect(page.getByText(/unverified-cache@example/)).toHaveCount(0);
});

test('cancelled OAuth returns to a recoverable login screen',async({page})=>{
 await page.route(`${origin}/**`,route=>route.abort());
 await page.goto('/auth/callback?error=access_denied&error_description=User%20cancelled');
 await expect(page.getByRole('heading',{name:'Anmeldung abschließen'})).toBeVisible();
 await page.getByRole('link',{name:'Zur Anmeldung',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mit Google fortfahren'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Google-Anmeldung erfolgreich.'})).toHaveCount(0);
});
