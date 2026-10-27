// Explicit live acceptance test. Creates three disposable Supabase guest accounts.
// Any GPS used here is synthetic automated-test GPS in this private test match only.
// Tokens stay in memory. No tracing/session storage artifacts. Every test account is deleted.
import {chromium,request as requestFactory,expect} from '@playwright/test';
import {circle} from '@turf/turf';
import {readFileSync,writeFileSync} from 'node:fs';
let input='';for await(const c of process.stdin){input+=c;if(input.includes('\n'))break;}
const {url,share,accessUrl,hostSession,fixtureCode}=JSON.parse(input),origin=new URL(url).origin;
const {releaseVersion}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const config=JSON.parse(readFileSync(new URL('../src/public-config.json',import.meta.url),'utf8'));
const API=config.apiUrl+'/api',AUTH=config.supabaseUrl+'/auth/v1',storageKey='sb-dxoleuqmhcnqnjyqdqvw-auth-token';
const proxy=process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined;
const api=await requestFactory.newContext({proxy,timeout:30000});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],proxy});
const actors=[],results=[];let failed=false;
function ok(id,detail){results.push({id,status:'BESTANDEN',detail});console.log(id+': BESTANDEN');}
async function call(actor,path,method='GET',data){const res=await api.fetch(API+path,{method,data,headers:{Authorization:`Bearer ${actor.session.access_token}`,Origin:origin}});if(res.status()>=400)throw Error(`${method} ${path}: ${res.status()} ${await res.text()}`);return await res.json();}
const event=(a,event,data={})=>call(a,'/events','POST',{event,data});
const cmd=(a,command)=>event(a,'lobby:command',{command});
async function open(a,path){if(accessUrl){await a.page.goto(accessUrl);}else if(share){const u=new URL(origin);u.searchParams.set('x-vercel-protection-bypass',share);u.searchParams.set('x-vercel-set-bypass-cookie','true');await a.page.goto(u.href);}await a.page.goto(origin+path);}
async function actor(name){const context=await browser.newContext({viewport:{width:390,height:844}}),a={context,page:await context.newPage(),name};actors.push(a);return a;}
try{
 const health=await api.get(API+'/health',{headers:{Origin:origin}});expect(health.status()).toBe(200);expect(health.headers()['access-control-allow-origin']).toBe(origin);expect((await health.json()).version).toBe(releaseVersion);ok('DEPLOY-07-health','Live API, version and exact frontend CORS');
 const host=await actor('QAHost');if(!hostSession||!fixtureCode)throw Error('A seeded private QA lobby with a real disposable anonymous session is required; guest lobby creation remains forbidden.');host.session=hostSession;host.id=hostSession.user.id;await host.context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:host.session});
 await call(host,'/profile');const lobby=(await event(host,'lobby:join',{code:fixtureCode})).lobby;await open(host,'/lobby');await expect(host.page.getByTestId('lobby-code')).toHaveText(lobby.code);ok('LIVE-FIXTURE','Authenticated real guest host uses isolated server-seeded private test lobby; this does not test registered host creation');
 for(const name of ['QAHider','QAOther']){const a=await actor(name);await open(a,'/join');await a.page.getByLabel('Dein Gastname').fill(name);await a.page.getByLabel('Lobby-Code',{exact:true}).fill(lobby.code);await a.page.getByRole('button',{name:'Als Gast beitreten',exact:true}).click();await expect(a.page.getByTestId('lobby-code')).toHaveText(lobby.code,{timeout:30000});a.session=await a.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);a.id=a.session.user.id;}
 const [,hider,other]=actors;ok('AUTH-05-live','Two independent browser sessions join using actual Supabase anonymous sign-in');await expect(host.page.locator('.player-row')).toHaveCount(3);ok('DEPLOY-06','Three real online sessions synchronize lobby membership');
 await cmd(host,{type:'zone',zone:{feature:circle([13.405,52.52],.7),excluded:[],name:'AUTOMATED ACCEPTANCE TEST — SYNTHETIC GPS',confirmed:true}});await cmd(host,{type:'assign',playerId:host.id,role:'hunter',team:'A'});for(const a of actors)await cmd(a,{type:'ready',ready:true});await cmd(host,{type:'start'});
 const started=(await event(host,'lobby:sync')).lobby;if(started.settings.rules?.xpHunt){if(started.xpHunt?.point){expect(started.xpHunt.point.pathId).toMatch(/^osm-way-/);ok('XPJ-04-live','Real Edge Function retrieved OSM footway data and generated a candidate requiring host confirmation');}else{results.push({id:'XPJ-04-live',status:'BLOCKIERT',detail:started.xpHunt?.message||'No safe OSM candidate available'});console.log('XPJ-04-live: BLOCKIERT — no safe external path candidate');}}
 for(const a of actors){await a.page.goto(origin+'/game');await expect(a.page.getByTestId('role-label')).toBeVisible();await a.page.getByRole('button',{name:/Crew-Chat/}).click();}
 await hider.page.getByRole('tab',{name:'Teamchat'}).click();await hider.page.getByLabel('Nachricht',{exact:true}).fill('Automatischer Test: nur Hider');await hider.page.getByRole('button',{name:'Nachricht senden'}).click();await other.page.getByRole('tab',{name:'Teamchat'}).click();await expect(other.page.getByRole('log')).toContainText('nur Hider');await expect(host.page.getByRole('log')).not.toContainText('nur Hider');ok('CHAT-03-live','Live Hider message reaches teammate, absent from Hunter view');
 await cmd(hider,{type:'location',location:{longitude:13.405,latitude:52.52,accuracy:4,timestamp:Date.now()}});await expect(host.page.locator(`[data-testid="map-player-pin"][data-player-id="${hider.id}"]`)).toBeVisible();const view=(await event(other,'lobby:sync')).lobby;expect(view.visibleLocations.some(p=>p.playerId===hider.id)).toBe(true);ok('MAP-01-live','Consenting Hider teammate visible; Hunter gets released pin only');
 const code=(await event(hider,'lobby:sync')).lobby.self.captureCode;await cmd(host,{type:'capture',targetId:hider.id,code});await expect(hider.page.getByRole('heading',{name:'DU WURDEST INFIZIERT.'})).toBeVisible();await hider.page.getByLabel('Infektion bestätigen').fill('100');await expect(hider.page.getByRole('heading',{name:'DU WURDEST INFIZIERT.'})).not.toBeVisible();expect((await event(hider,'lobby:sync')).lobby.chat.some(m=>m.text.includes('nur Hider'))).toBe(false);ok('MODE-10-live','Live capture/swipe changes team and revokes old protected chat');
 await cmd(host,{type:'pause'});expect((await event(other,'lobby:sync')).lobby.status).toBe('paused');await cmd(host,{type:'resume'});await other.page.reload();await expect(other.page.getByTestId('role-label')).toHaveText('HIDER');ok('LOBBY-09-live','Host pause/resume and reload preserve actual online match');
 await cmd(host,{type:'end'});await expect(other.page.getByRole('heading',{name:'MATCH OHNE WERTUNG BEENDET'})).toBeVisible();ok('LOBBY-10-live','Host end is unscored and synchronized');
 const settings=await api.get(AUTH+'/settings',{headers:{apikey:config.supabasePublishableKey}});expect((await settings.json()).external.google).toBe(false);const oauth=await api.get(AUTH+'/authorize?provider=google',{headers:{apikey:config.supabasePublishableKey},maxRedirects:0});expect(oauth.status()).toBe(400);ok('AUTH-02-live','Supabase Google provider disabled and direct OAuth rejected');
}catch(error){failed=true;console.error(String(error).replaceAll(share||'NON_SECRET','[REDACTED]'));results.push({id:'live-flow',status:'FEHLGESCHLAGEN',detail:String(error).replaceAll(share||'NON_SECRET','[REDACTED]')});}
finally{
 for(const a of actors){try{if(!a.session)a.session=await a.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);if(a.session){await call(a,'/profile','DELETE',{});console.log('Disposable guest removed');}}catch(error){failed=true;console.error('Guest cleanup failed: '+String(error));}await a.context.close();}
 await browser.close();await api.dispose();writeFileSync('/tmp/manhunt-live-results.json',JSON.stringify({url:origin,at:new Date().toISOString(),results},null,2));process.exitCode=failed?1:0;
}
