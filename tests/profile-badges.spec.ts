/** B2 profile acceptance tests. All users, email delivery and GPS below are
 * isolated localhost fixtures; no production account or location is used. */
import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';

const API='http://127.0.0.1:3003',GAME='http://127.0.0.1:5176';
const PASSWORD='B2-Profile-Test-Password123';
interface Actor {id:string;email:string;username:string;token:string;}
const headers=(actor:Actor)=>({Authorization:`Bearer ${actor.token}`});
async function register(request:APIRequestContext,prefix:string):Promise<Actor>{
 const suffix=randomUUID().slice(0,8),email=`b2-${prefix}-${suffix}@isolated.invalid`,username=`B2${prefix}_${suffix}`;
 const signup=await request.post(API+'/auth/v1/signup',{data:{email,password:PASSWORD,data:{username}}});expect(signup.ok(),await signup.text()).toBe(true);
 const mail=await(await request.get(API+'/__test/mailbox',{params:{email}})).json();expect(mail.code).toMatch(/^\d{6}$/);
 const verified=await request.post(API+'/auth/v1/verify',{data:{email,token:mail.code,type:'email'}});expect(verified.ok(),await verified.text()).toBe(true);const session=await verified.json();
 return{id:session.user.id,email,username,token:session.access_token};
}
async function api(request:APIRequestContext,actor:Actor,path:string,method='GET',data?:unknown){
 const response=await request.fetch(API+'/api'+path,{method,headers:headers(actor),...(data===undefined?{}:{data})});expect(response.ok(),await response.text()).toBe(true);return response.json();
}
async function login(page:Page,actor:Actor){
 await page.goto(GAME+'/login');await page.getByLabel('E-Mail-Adresse',{exact:true}).fill(actor.email);await page.getByLabel('Passwort',{exact:true}).fill(PASSWORD);await page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true}).click();
 // Wait for persisted authentication before navigating to the profile.
 await expect(page.locator('.profile-link')).toBeVisible();await expect(page.locator('.connection')).toHaveText('VERBUNDEN');
}
async function befriend(request:APIRequestContext,owner:Actor,friend:Actor){
 const profile=await api(request,friend,'/profile');await api(request,owner,'/friends/request','POST',{code:profile.friend_code});
 const social=await api(request,friend,'/social'),incoming=social.requests.find((r:any)=>r.sender.id===owner.id);expect(incoming).toBeTruthy();await api(request,friend,'/friends/respond','POST',{requestId:incoming.id,accept:true});
}
async function earnBetaTester(request:APIRequestContext,owner:Actor,friend:Actor){
 const event=async(actor:Actor,event:string,data:unknown={})=>(await api(request,actor,'/events','POST',{event,data})).lobby;
 const command=(actor:Actor,command:unknown)=>event(actor,'lobby:command',{command});
 const lobby=await event(owner,'lobby:create',{settings:{durationSeconds:60,preparationSeconds:0,headStartSeconds:0,captureMethod:'code',randomRoles:false}});await event(friend,'lobby:join',{code:lobby.code});
 await command(owner,{type:'zone',zone:{feature:circle([13.405,52.52],.4),excluded:[],confirmed:true,name:'AUTOMATED B2 PROFILE BADGE TEST'}});await command(owner,{type:'assign',playerId:owner.id,role:'hunter',team:'A'});
 for(const actor of [owner,friend]){await command(actor,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await command(actor,{type:'ready',ready:true});}
 await command(owner,{type:'start'});const target=await event(friend,'lobby:sync');const finished=await command(owner,{type:'capture',targetId:friend.id,code:target.self.captureCode});expect(finished.status).toBe('finished');
 const {offer}=await api(request,owner,`/feedback?matchId=${lobby.id}`);expect(offer.status).toBe('offered');
 // Deliberately skip every optional question, but explicitly submit feedback.
 const saved=await api(request,owner,`/feedback/${offer.id}/submit`,'POST',{version:offer.version,answers:{}});expect(saved.badges.badges.find((b:any)=>b.id==='beta-tester').level).toBe(1);
 return lobby.id;
}
for(const width of [320,1440])test(`PROFILE-B2-${width}: colorful earned icons, friend details, visibility switches and access boundaries`,async({browser,request})=>{
 test.setTimeout(120000);
 const owner=await register(request,'Owner'),friend=await register(request,'Friend'),stranger=await register(request,'Other');
 const ownerContext=await browser.newContext({viewport:{width,height:900},hasTouch:width===320}),friendContext=await browser.newContext({viewport:{width,height:900},hasTouch:width===320});
 const ownerPage=await ownerContext.newPage(),friendPage=await friendContext.newPage();
 try{
  const privatePath=`/players/${owner.id}/profile`;
  expect((await request.get(API+'/api'+privatePath)).status()).toBe(401);
  expect([403,404]).toContain((await request.get(API+'/api'+privatePath,{headers:headers(stranger)})).status());
  expect([403,404]).toContain((await request.get(API+'/api'+privatePath,{headers:headers(friend)})).status());
  await befriend(request,owner,friend);await earnBetaTester(request,owner,friend);
  await login(ownerPage,owner);await ownerPage.goto(GAME+'/profile');await expect(ownerPage.getByRole('heading',{name:owner.username,exact:true})).toBeVisible();
  const ownBadge=ownerPage.locator('.profile-badge-strip').getByRole('button',{name:'Beta-Tester',exact:true});await expect(ownBadge).toBeVisible();
  expect(await ownBadge.locator('svg defs linearGradient,svg defs radialGradient').count()).toBeGreaterThan(0);
  const box=(await ownBadge.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  await ownBadge.click();const ownDialog=ownerPage.getByRole('dialog',{name:'Beta-Tester',exact:true});await expect(ownDialog).toBeVisible();await expect(ownDialog).toContainText('Sende Feedback ab.');await ownerPage.keyboard.press('Escape');await expect(ownDialog).not.toBeVisible();await expect(ownBadge).toBeFocused();
  await login(friendPage,friend);await friendPage.goto(GAME+'/friends');await friendPage.getByRole('link',{name:`Profil von ${owner.username} anzeigen`,exact:true}).click();await expect(friendPage).toHaveURL(GAME+`/profile/${owner.id}`);
  const friendBadge=friendPage.locator('.profile-badge-strip').getByRole('button',{name:'Beta-Tester',exact:true});await expect(friendBadge).toBeVisible();await friendBadge.click();const publicDialog=friendPage.getByRole('dialog',{name:'Beta-Tester',exact:true});await expect(publicDialog).toContainText('Sende Feedback ab.');await expect(publicDialog.locator('progress')).toHaveCount(0);await expect(publicDialog.getByRole('button',{name:'Als Profil-Badge verwenden',exact:true})).toHaveCount(0);await friendPage.keyboard.press('Escape');
  await expect(friendPage.locator('.badge-collection-grid')).toHaveCount(0);await expect(friendPage.getByText('Noch gesperrt',{exact:true})).toHaveCount(0);
  const visible=await api(request,friend,privatePath);expect(visible.badges.map((b:any)=>b.id)).toEqual(['beta-tester']);expect(visible).not.toHaveProperty('email');expect(visible).not.toHaveProperty('friend_code');expect(visible.badges[0]).not.toHaveProperty('thresholds');expect(visible.badges[0]).not.toHaveProperty('progress');
  // Neither an ownership override nor an unearned badge may be submitted.
  expect((await request.patch(API+'/api/badges/visibility',{headers:headers(owner),data:{badgeId:'beta-tester',visible:false,userId:friend.id}})).status()).toBe(400);
  expect([400,403,409]).toContain((await request.patch(API+'/api/badges/visibility',{headers:headers(owner),data:{badgeId:'hunter',visible:true}})).status());
  await ownerPage.goto(GAME+'/settings');const toggle=ownerPage.getByRole('switch',{name:'Beta-Tester im Profil anzeigen',exact:true});await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();await ownerPage.reload();await expect(toggle).not.toBeChecked();
  const hidden=await api(request,friend,privatePath);expect(hidden.badges).toEqual([]);expect(JSON.stringify(hidden)).not.toContain('beta-tester');
  await friendPage.reload();await expect(friendPage.locator('.profile-badge-strip').getByRole('button',{name:'Beta-Tester',exact:true})).toHaveCount(0);
  await toggle.click();await expect(toggle).toBeChecked();await friendPage.reload();await expect(friendBadge).toBeVisible();
  expect(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await friendPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await friendPage.screenshot({path:`test-results-admin/profile-badges-${width}.png`,fullPage:true});
  await api(request,friend,`/blocks/${owner.id}`,'POST',{});expect([403,404]).toContain((await request.get(API+'/api'+privatePath,{headers:headers(friend)})).status());
 }finally{await ownerContext.close();await friendContext.close();}
});

test('PROFILE-B2-ART: five original emblems, Roman tiers, own details and reduced motion on a narrow phone',async({browser,request})=>{
 // Deliberate UI fixture, never a production award: visual coverage of every emblem and maximum tier.
 const {DEFAULT_BADGES}=await import('../shared/achievements');
 const actor=await register(request,'Art'),context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'});
 try{
  const page=await context.newPage();await login(page,actor);
  const levels=[1,2,3,10,10],badges=DEFAULT_BADGES.map((b,i)=>({...b,level:levels[i],progress:b.thresholds[levels[i]-1],unlockedAt:'2026-11-04T12:00:00Z',upgradedAt:null}));
  await page.route('**/api/badges',route=>route.fulfill({json:{registered:true,badges,selected:null,notices:[],visibleBadgeIds:badges.map(b=>b.id)}}));
  await page.goto(GAME+'/profile');const strip=page.locator('.profile-badge-strip');await expect(strip.getByRole('button')).toHaveCount(5);
  await strip.getByRole('button',{name:'Hunter II',exact:true}).click();const detail=page.getByRole('dialog',{name:'Hunter II',exact:true});await expect(detail).toContainText('Spurenleser');await expect(detail).toContainText('20/50 Fänge bis Hunter III');await page.keyboard.press('Escape');
  await strip.getByRole('button',{name:'Veteran X',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Maximale Stufe erreicht');expect(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results-admin/profile-five-badges-320.png',fullPage:true});
 }finally{await context.close();}
});
