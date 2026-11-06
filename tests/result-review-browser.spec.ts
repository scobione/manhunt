/** Isolated Auth/mailbox and explicitly synthetic GPS only. No production data. */
import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
const API='http://127.0.0.1:3003',GAME='http://127.0.0.1:5176',PASSWORD='Review-B22-Test-Password123';
interface Actor{id:string;username:string;email:string;token:string;}
async function register(request:APIRequestContext,prefix:string):Promise<Actor>{const suffix=randomUUID().slice(0,7),username=`R${prefix}_${suffix}`,email=`review-${prefix}-${suffix}@isolated.invalid`;const signup=await request.post(API+'/auth/v1/signup',{data:{email,password:PASSWORD,data:{username}}});expect(signup.ok(),await signup.text()).toBe(true);const mailbox=await(await request.get(API+'/__test/mailbox',{params:{email}})).json();const response=await request.post(API+'/auth/v1/verify',{data:{email,token:mailbox.code,type:'email'}});expect(response.ok()).toBe(true);const session=await response.json();return{id:session.user.id,username,email,token:session.access_token};}
async function api(request:APIRequestContext,actor:Actor,path:string,method='GET',data?:unknown){const r=await request.fetch(API+'/api'+path,{headers:{Authorization:`Bearer ${actor.token}`},method,...(data===undefined?{}:{data})});expect(r.ok(),await r.text()).toBe(true);return r.json();}
for(const width of [320,1440])test(`RESULT-B22-${width}: real result ledger, retained milestones, concrete optional feedback and reachable rematch`,async({page,request})=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const host=await register(request,'host'),hider=await register(request,'hider'),stranger=await register(request,'other');
 const event=(actor:Actor,event:string,data:unknown={})=>api(request,actor,'/events','POST',{event,data}).then(v=>v.lobby),cmd=(actor:Actor,command:unknown)=>event(actor,'lobby:command',{command});
 const lobby=await event(host,'lobby:create',{settings:{...DEFAULT_SETTINGS,durationSeconds:1200,preparationSeconds:0,headStartSeconds:0,captureMethod:'code',randomRoles:false}});await event(hider,'lobby:join',{code:lobby.code});
 await cmd(host,{type:'zone',zone:{feature:circle([13.405,52.52],.4),excluded:[],confirmed:true,name:'AUTOMATED RESULT REVIEW TEST'}});await cmd(host,{type:'assign',playerId:host.id,role:'hunter',team:'A'});
 for(const actor of [host,hider]){await cmd(actor,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await cmd(actor,{type:'ready',ready:true});}
 await cmd(host,{type:'start'});const target=await event(hider,'lobby:sync');
 await request.post(API+'/__test/advance',{data:{seconds:301}});
 try{const finished=await cmd(host,{type:'capture',targetId:hider.id,code:target.self.captureCode});expect(finished.status).toBe('finished');}
 finally{await request.post(API+'/__test/advance',{data:{seconds:-301}});}
 const review=await api(request,host,`/badges/match?matchId=${lobby.id}`);expect(review.rewards.xp).toBe(60);expect(review.highlights.captures).toBe(1);expect(review.rewards.badges.some((entry:any)=>entry.badge.id==='hunter'&&entry.added===1)).toBe(true);
 const denied=await request.get(API+`/api/badges/match?matchId=${lobby.id}`,{headers:{Authorization:`Bearer ${stranger.token}`}});expect(denied.status()).toBe(404);
 await page.goto(GAME+'/login');await page.getByLabel('E-Mail-Adresse',{exact:true}).fill(host.email);await page.getByLabel('Passwort',{exact:true}).fill(PASSWORD);await page.getByRole('button',{name:'Mit E-Mail anmelden',exact:true}).click();await expect(page.locator('.profile-link')).toBeVisible();await expect(page.locator('.connection')).toHaveText('VERBUNDEN');await page.goto(GAME+'/game');
 await expect(page.getByRole('heading',{name:'Die Jagd ist vorbei.'})).toBeVisible();await expect(page.getByText('+60 Account-XP',{exact:true})).toBeVisible();await expect(page.getByText('Diese Runde: +1 Fang',{exact:true})).toBeVisible();await expect(page.getByRole('progressbar',{name:'Aktueller Account-Level-Fortschritt'})).toHaveAttribute('value','60');
 await page.locator('.mh-result-timeline summary').click();await expect(page.locator('.mh-result-timeline')).toContainText(`${host.username} hat ${hider.username} gefangen.`);await expect(page.locator('.mh-result-timeline')).not.toContainText('13.405');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`test-results-admin/result-review-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Feedback geben',exact:true}).click();for(let i=0;i<4;i++)await page.getByRole('button',{name:'Frage überspringen',exact:true}).click();await expect(page.getByText('Was sollten wir verbessern?',{exact:false}).first()).toBeVisible();await page.getByRole('checkbox',{name:'GPS / Standort',exact:true}).check();await page.getByRole('checkbox',{name:'Fangen',exact:true}).check();await page.getByRole('button',{name:'Weiter',exact:true}).click();await page.getByRole('button',{name:'Frage überspringen',exact:true}).click();await page.getByRole('button',{name:'Frage überspringen',exact:true}).click();await page.getByRole('button',{name:'Feedback absenden',exact:true}).click();await expect(page.getByText('Dein Feedback wurde gespeichert. Danke!',{exact:true})).toBeVisible();
 const {offer}=await api(request,host,`/feedback?matchId=${lobby.id}`);expect(offer.status).toBe('completed');const overview=await api(request,host,'/badges');expect(overview.badges.find((badge:any)=>badge.id==='beta-tester')?.level).toBe(1);
 const rematch=page.getByRole('button',{name:'Revanche starten',exact:true});await rematch.click();await expect(page).toHaveURL(GAME+'/lobby');expect(errors).toEqual([]);
});
