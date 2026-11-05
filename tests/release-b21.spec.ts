/** Release B2.1 acceptance: isolated Auth/mailbox, private stores and explicitly synthetic GPS.
 * These tests never contact or create a user in production. */
import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
import {badgeLabel} from '../shared/achievements';
import {RELEASE_VERSION} from '../shared/version';

const API='http://127.0.0.1:3003',GAME='http://127.0.0.1:5176',PASSWORD='Release-B21-Test-Password123';
interface Actor {id:string;email:string;username:string;token:string;}
const headers=(actor:Actor)=>({Authorization:`Bearer ${actor.token}`});
async function register(request:APIRequestContext,prefix:string):Promise<Actor>{
 const suffix=randomUUID().slice(0,8),email=`b21-${prefix}-${suffix}@isolated.invalid`,username=`Q${prefix}_${suffix}`;
 const signup=await request.post(API+'/auth/v1/signup',{data:{email,password:PASSWORD,data:{username}}});expect(signup.ok(),await signup.text()).toBe(true);
 const mail=await(await request.get(API+'/__test/mailbox',{params:{email}})).json();expect(mail.code).toMatch(/^\d{6}$/);
 const verified=await request.post(API+'/auth/v1/verify',{data:{email,token:mail.code,type:'email'}});expect(verified.ok(),await verified.text()).toBe(true);const session=await verified.json();
 return{id:session.user.id,email,username,token:session.access_token};
}
async function api(request:APIRequestContext,actor:Actor,path:string,method='GET',data?:unknown){
 const response=await request.fetch(API+'/api'+path,{method,headers:headers(actor),...(data===undefined?{}:{data})});expect(response.ok(),await response.text()).toBe(true);return response.json();
}
const event=(request:APIRequestContext,actor:Actor,event:string,data:unknown={})=>api(request,actor,'/events','POST',{event,data}).then(v=>v.lobby);
const cmd=(request:APIRequestContext,actor:Actor,command:unknown)=>event(request,actor,'lobby:command',{command});
async function login(page:Page,actor:Actor){await page.goto(GAME+'/login');await page.getByLabel('E-Mail-Adresse',{exact:true}).fill(actor.email);await page.getByLabel('Passwort',{exact:true}).fill(PASSWORD);await page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true}).click();await expect(page.locator('.profile-link')).toBeVisible();await expect(page.locator('.connection')).toHaveText('VERBUNDEN');}
async function dismissIntro(page:Page){const skip=page.locator('.intro-card-top').getByRole('button',{name:'Einführung überspringen',exact:true});if(await skip.count())await skip.click();}
async function befriend(request:APIRequestContext,owner:Actor,friend:Actor){const p=await api(request,friend,'/profile');await api(request,owner,'/friends/request','POST',{code:p.friend_code});const social=await api(request,friend,'/social'),incoming=social.requests.find((r:any)=>r.sender.id===owner.id);expect(incoming).toBeTruthy();await api(request,friend,'/friends/respond','POST',{requestId:incoming.id,accept:true});}
async function finishMatch(request:APIRequestContext,host:Actor,hider:Actor,eligible=false){
 const lobby=await event(request,host,'lobby:create',{settings:{...DEFAULT_SETTINGS,durationSeconds:600,preparationSeconds:0,headStartSeconds:0,captureMethod:'code',randomRoles:false}});await event(request,hider,'lobby:join',{code:lobby.code});
 await cmd(request,host,{type:'zone',zone:{feature:circle([13.405,52.52],.4),excluded:[],confirmed:true,name:'AUTOMATED B21 ACCEPTANCE ZONE'}});await cmd(request,host,{type:'assign',playerId:host.id,role:'hunter',team:'A'});
 for(const actor of [host,hider]){await cmd(request,actor,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await cmd(request,actor,{type:'ready',ready:true});}
 await cmd(request,host,{type:'start'});const target=await event(request,hider,'lobby:sync');
 if(eligible)await request.post(API+'/__test/advance',{data:{seconds:301}});
 try{const finished=await cmd(request,host,{type:'capture',targetId:hider.id,code:target.self.captureCode});expect(finished.status).toBe('finished');return finished;}
 finally{if(eligible)await request.post(API+'/__test/advance',{data:{seconds:-301}});}
}
async function feedback(request:APIRequestContext,actor:Actor,matchId:string){const {offer}=await api(request,actor,`/feedback?matchId=${matchId}`);expect(offer.status).toBe('offered');await api(request,actor,`/feedback/${offer.id}/submit`,'POST',{version:offer.version,answers:{}});}

for(const width of [320,1440])test(`B21-PROFILE-${width}: color and earned-badge order persist, friend sees order and unearned overrides fail`,async({browser,request})=>{
 test.setTimeout(150000);const owner=await register(request,'Style'),friend=await register(request,'Buddy');await befriend(request,owner,friend);const match=await finishMatch(request,owner,friend,true);await feedback(request,owner,match.id);
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320,reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await login(page,owner);await dismissIntro(page);await page.goto(GAME+'/profile/edit');const ocean=page.getByRole('button',{name:'Ozean als Profilfarbe',exact:true});await ocean.click();await expect(ocean).toHaveAttribute('aria-pressed','true');await page.reload();await expect(ocean).toHaveAttribute('aria-pressed','true');expect((await api(request,owner,'/profile/customization')).color).toBe('ocean');
  const overview=await api(request,owner,'/badges'),earned=overview.badges.filter((b:any)=>b.level>0);expect(earned.length).toBeGreaterThanOrEqual(2);const reversed=earned.map((b:any)=>b.id).reverse();
  await api(request,owner,'/badges/order','PUT',{badgeIds:reversed});expect((await api(request,owner,'/profile/customization')).badgeOrder).toEqual(reversed);
  await page.reload();const second=earned.find((b:any)=>b.id===reversed[1]);await page.getByRole('button',{name:`${badgeLabel(second)} nach oben`,exact:true}).click();const moved=[reversed[1],reversed[0],...reversed.slice(2)];
  await expect.poll(async()=>(await api(request,owner,'/profile/customization')).badgeOrder).toEqual(moved);await page.goto(GAME+'/profile');await expect(page.locator('.mh-profile-hero')).toHaveAttribute('data-profile-color','ocean');
  const labels=moved.map(id=>badgeLabel(earned.find((b:any)=>b.id===id)));await expect.poll(()=>page.locator('.profile-badge-strip button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).toEqual(labels);
  const locked=overview.badges.find((b:any)=>b.level===0);expect(locked).toBeTruthy();for(const badgeIds of [[...moved,moved[0]],[locked.id],['not-earned']]){const invalid=await request.put(API+'/api/badges/order',{headers:headers(owner),data:{badgeIds}});expect([400,403,409]).toContain(invalid.status());}
  const foreign=await request.patch(API+'/api/profile/customization',{headers:headers(owner),data:{bannerPath:`${friend.id}/${randomUUID()}.webp`}});expect([400,403,404]).toContain(foreign.status());
  const friendContext=await browser.newContext({viewport:{width,height:900}});try{const publicPage=await friendContext.newPage();await login(publicPage,friend);await dismissIntro(publicPage);await publicPage.goto(GAME+`/profile/${owner.id}`);await expect(publicPage.locator('.mh-profile-hero')).toHaveAttribute('data-profile-color','ocean');await expect.poll(()=>publicPage.locator('.profile-badge-strip button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).toEqual(labels);await publicPage.locator('.profile-badge-strip button').first().click();const dialog=publicPage.getByRole('dialog');await expect(dialog).toBeVisible();await publicPage.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}finally{await friendContext.close();}
  // Font scaling is independent of browser device scale and must keep touch targets reachable.
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results-admin/b21-profile-${width}.png`,fullPage:true});
 }finally{await context.close();}
});

test('B21-LIBRARY-REPORT: private saved-zone CRUD, favorites, unconfirmed reuse and manual report privacy',async({browser,request})=>{
 test.setTimeout(120000);const actor=await register(request,'Library'),other=await register(request,'Other'),context=await browser.newContext({viewport:{width:320,height:900}}),page=await context.newPage();
 try{
  expect((await request.get(API+'/api/library/zones')).status()).toBe(401);expect((await request.post(API+'/api/reports',{data:{}})).status()).toBe(401);
  const name='QA Park '+randomUUID().slice(0,5),zone={feature:circle([13.405,52.52],.4),excluded:[],confirmed:true,name};const saved=await api(request,actor,'/library/zones','POST',{name,zone,settings:DEFAULT_SETTINGS,favorite:false,tags:['Testpark']});expect(saved.zone.confirmed).toBe(false);
  expect((await api(request,other,'/library/zones')).zones).toEqual([]);const stolen=await request.patch(API+'/api/library/zones/'+saved.id,{headers:headers(other),data:{id:saved.id,name:'Unberechtigter Name',zone}});expect([403,404]).toContain(stolen.status());
  const preset=await api(request,actor,'/presets','POST',{name:'QA Lieblingsregeln',settings:DEFAULT_SETTINGS});await api(request,actor,'/library/favorites/'+preset.id,'PATCH',{favorite:true});expect((await api(request,actor,'/library/favorites')).presetIds).toContain(preset.id);
  await login(page,actor);await dismissIntro(page);await page.goto(GAME+'/library');await expect(page.getByRole('heading',{name:'Deine Bibliothek',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await page.getByRole('button',{name:`${name} als Favorit markieren`,exact:true}).click();await expect(page.getByRole('button',{name:`${name} aus Favoriten entfernen`,exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:`${name} aus Favoriten entfernen`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Zone verwenden',exact:true}).click();await expect(page).toHaveURL(GAME+'/zone');await expect(page.getByLabel('Zonenname',{exact:true})).toHaveValue(name);await expect(page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/})).not.toBeChecked();
  await page.goto(GAME+'/report');await page.getByRole('combobox',{name:'Bereich',exact:true}).selectOption('map');await page.getByLabel('Was ist passiert?',{exact:true}).fill('Im automatisierten Test war die Karte nach dem Zoomen schwer lesbar.');await page.getByRole('button',{name:'Fehlerbericht senden',exact:true}).click();await expect(page.getByText('Dein Fehlerbericht wurde gespeichert.',{exact:true})).toBeVisible();
  const {reports}=await api(request,actor,'/reports');expect(reports).toHaveLength(1);expect(reports[0].screenshotUrl).toBeNull();expect(reports[0].build).toBe(RELEASE_VERSION);for(const field of ['location','latitude','longitude','chat','access_token'])expect(reports[0]).not.toHaveProperty(field);expect((await api(request,other,'/reports')).reports).toEqual([]);
  const injected=await request.post(API+'/api/reports',{headers:headers(actor),data:{id:randomUUID(),category:'map',description:'Dieser Payload enthält absichtlich verbotene Zusatzdaten.',build:RELEASE_VERSION,location:{latitude:52.52,longitude:13.405}}});expect(injected.status()).toBe(400);
  await page.goto(GAME+'/library');const remove=page.getByRole('button',{name:`${name} aus Bibliothek löschen`,exact:true});await remove.click();const deletion=page.getByRole('dialog',{name:'Zone löschen?',exact:true});await expect(deletion).toBeVisible();await page.keyboard.press('Escape');await expect(deletion).not.toBeVisible();await expect(remove).toBeFocused();expect((await api(request,actor,'/library/zones')).zones).toHaveLength(1);await remove.click();await deletion.getByRole('button',{name:'Zone löschen',exact:true}).click();await expect.poll(async()=>(await api(request,actor,'/library/zones')).zones).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();}
});

test('B21-REMATCH: host restarts the group with the same code, resets consent and retains the first result exactly once',async({browser,request})=>{
 test.setTimeout(120000);const host=await register(request,'Host'),hider=await register(request,'Hider'),finished=await finishMatch(request,host,hider);
 const bad=await request.post(API+'/api/events',{headers:headers(hider),data:{event:'lobby:command',data:{command:{type:'rematch'}}}});expect([400,403]).toContain(bad.status());
 const a=await browser.newContext({viewport:{width:390,height:900}}),b=await browser.newContext({viewport:{width:1440,height:1000}});
 try{const hp=await a.newPage(),gp=await b.newPage();await login(hp,host);await login(gp,hider);await dismissIntro(hp);await dismissIntro(gp);await hp.goto(GAME+'/game');await gp.goto(GAME+'/game');await expect(hp.getByRole('heading',{name:'Die Jagd ist vorbei.',exact:true})).toBeVisible();await expect(gp.getByRole('button',{name:'Revanche starten',exact:true})).toHaveCount(0);await hp.getByRole('button',{name:'Revanche starten',exact:true}).click();await expect(hp).toHaveURL(GAME+'/lobby');await expect(gp).toHaveURL(GAME+'/lobby');
  const next=await event(request,host,'lobby:sync'),guestView=await event(request,hider,'lobby:sync');expect(next.id).not.toBe(finished.id);expect(next.code).toBe(finished.code);expect(next.previousMatchId).toBe(finished.id);expect(next.round).toBe(2);expect(next.players.map((p:any)=>p.id).sort()).toEqual([host.id,hider.id].sort());expect(guestView.id).toBe(next.id);expect(next.settings).toEqual(finished.settings);expect(next.zone).toEqual(finished.zone);expect(next.players.every((p:any)=>!p.ready&&!p.locationReady&&!p.eliminated)).toBe(true);expect(next.pins).toEqual([]);expect(next.captures).toEqual([]);expect(next.result).toBeUndefined();
  const history=await api(request,host,'/history');expect(history.filter((h:any)=>h.id===finished.id)).toHaveLength(1);expect(history.find((h:any)=>h.id===finished.id).result).toEqual(finished.result);const oldOffer=await api(request,host,`/feedback?matchId=${finished.id}`);expect(oldOffer.offer.matchId).toBe(finished.id);
 }finally{await a.close();await b.close();}
});

test('B21-INTRO-UPDATES: optional guidance can be skipped, completed and reopened; release notes match the actual build',async({browser,request})=>{
 const actor=await register(request,'Intro'),context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 try{await login(page,actor);const card=page.getByRole('region',{name:'Kurze Spieleinführung'});await expect(card).toBeVisible();await card.getByRole('button',{name:'Kurzanleitung öffnen',exact:true}).click();await expect(card.getByRole('heading',{name:'Deine Crew, eure Runde',exact:true})).toBeVisible();await card.getByRole('button',{name:'Nächster Tipp',exact:true}).click();await expect(card.getByRole('heading',{name:'Zone prüfen, Standort freigeben',exact:true})).toBeVisible();await card.locator('.intro-card-top').getByRole('button',{name:'Einführung überspringen',exact:true}).click();await page.reload();await expect(card).toHaveCount(0);
  await page.goto(GAME+'/updates');await expect(page.getByRole('heading',{name:'Was ist neu?',exact:true})).toBeVisible();await expect(page.locator('.release-note').first()).toContainText(RELEASE_VERSION);await expect(page.locator('.release-note').first()).toContainText('Aktuelle Version');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.goto(GAME+'/settings');await page.getByRole('button',{name:'Kurzanleitung öffnen',exact:true}).click();await expect(card.getByRole('heading',{name:'Deine Crew, eure Runde',exact:true})).toBeVisible();await card.getByRole('button',{name:'Nächster Tipp',exact:true}).click();await card.getByRole('button',{name:'Nächster Tipp',exact:true}).click();await card.getByRole('button',{name:'Los geht’s',exact:true}).click();await expect(card).toHaveCount(0);await page.reload();await expect(card).toHaveCount(0);
 }finally{await context.close();}
});

test('B21-PRIVATE-IMAGES: browser re-encodes and saves a personal banner and a manually selected report screenshot',async({browser,request})=>{
 test.setTimeout(120000);const actor=await register(request,'Images'),context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await login(page,actor);await dismissIntro(page);const image=await page.screenshot({type:'png'});await page.goto(GAME+'/profile/edit');
  await page.locator('#profile-banner-file').setInputFiles({name:'my-banner.png',mimeType:'image/png',buffer:image});await expect(page.getByText('Profilgestaltung gespeichert.',{exact:true})).toBeVisible();
  const customization=await api(request,actor,'/profile/customization');expect(customization.banner_url).toContain('/profile-banners/'+actor.id+'/');expect(customization.banner_url).toMatch(/\.webp\?/);
  const banner=page.getByAltText('Dein aktuelles Profilbanner');await expect(banner).toBeVisible();await expect.poll(()=>banner.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0)).toBe(true);await page.reload();await expect(banner).toHaveAttribute('src',customization.banner_url);
  await page.goto(GAME+'/report');await page.getByLabel('Was ist passiert?',{exact:true}).fill('Ein manuell hinzugefügter Test-Screenshot zur Kartenansicht. <img src=x onerror=alert(1)>');await page.locator('.bug-report-form input[type=file]').setInputFiles({name:'manual-screenshot.png',mimeType:'image/png',buffer:image});await expect(page.getByAltText('Vorschau des ausgewählten Screenshots')).toBeVisible();await page.getByRole('button',{name:'Fehlerbericht senden',exact:true}).click();await expect(page.getByText('Dein Fehlerbericht wurde gespeichert.',{exact:true})).toBeVisible();
  const {reports}=await api(request,actor,'/reports');expect(reports).toHaveLength(1);expect(reports[0].screenshotUrl).toContain('/bug-report-images/'+actor.id+'/');const screenshot=await request.get(reports[0].screenshotUrl);expect(screenshot.ok()).toBe(true);expect(screenshot.headers()['content-type']).toBe('image/webp');
  expect((await request.get(API+'/api/admin/reports',{headers:headers(actor)})).status()).toBe(403);
  const adminSession=await(await request.post(API+'/auth/v1/token?grant_type=password',{data:{email:'reports-admin@isolated.invalid',password:'Admin-Test-Password1'}})).json();expect((await request.get(API+'/api/admin/reports',{headers:{Authorization:`Bearer ${adminSession.access_token}`}})).status()).toBe(401);
  const adminContext=await browser.newContext({viewport:{width:320,height:900}});try{const adminPage=await adminContext.newPage();await adminPage.goto('/');await adminPage.getByLabel('E-Mail-Adresse',{exact:true}).fill('reports-admin@isolated.invalid');await adminPage.getByLabel('Passwort',{exact:true}).fill('Admin-Test-Password1');await adminPage.getByRole('button',{name:'Als Administrator anmelden',exact:true}).click();await expect(adminPage.getByRole('heading',{name:'Alles bereit für die nächste Runde.',exact:true})).toBeVisible();await adminPage.goto('/#reports');await expect(adminPage.getByRole('heading',{name:'Fehlerberichte',exact:true})).toBeVisible();const item=adminPage.locator('.admin-report').filter({hasText:reports[0].id});await expect(item).toContainText('Ein manuell hinzugefügter Test-Screenshot zur Kartenansicht. <img src=x onerror=alert(1)>');await expect(item.locator('.admin-report-text img')).toHaveCount(0);await expect(item.getByRole('link',{name:'Screenshot öffnen'})).toHaveAttribute('href',reports[0].screenshotUrl);expect(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await adminPage.screenshot({path:'test-results-admin/b21-reports-admin-320.png',fullPage:true});}finally{await adminContext.close();}
  await page.goto(GAME+'/profile/edit');await page.getByRole('button',{name:'Banner entfernen',exact:true}).click();await expect.poll(async()=>(await api(request,actor,'/profile/customization')).banner_url).toBeNull();
 }finally{await context.close();}
});

test('B21-PROFILE-RACE: an older delayed read cannot overwrite a color saved successfully during that read',async({browser,request})=>{
 const actor=await register(request,'Race'),context=await browser.newContext({viewport:{width:320,height:900}}),page=await context.newPage();let release=()=>{},fetched=()=>{},held=false;const staleRead=new Promise<void>(resolve=>{fetched=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  await login(page,actor);await dismissIntro(page);await page.route(API+'/api/profile/customization',async route=>{if(route.request().method()==='GET'&&!held){held=true;const response=await route.fetch();fetched();await gate;await route.fulfill({response});}else await route.continue();});await page.goto(GAME+'/profile/edit');await staleRead;
  const ocean=page.getByRole('button',{name:'Ozean als Profilfarbe',exact:true});await ocean.click();await expect(ocean).toHaveAttribute('aria-pressed','true');expect((await api(request,actor,'/profile/customization')).color).toBe('ocean');const response=page.waitForResponse(r=>r.url()===API+'/api/profile/customization'&&r.request().method()==='GET');release();await response;await expect(ocean).toHaveAttribute('aria-pressed','true');
 }finally{release();await context.close();}
});
