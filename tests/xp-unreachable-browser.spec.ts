// Isolated browser integration: synthetic identities, GPS and footway data only.
import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle,distance} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
import {DEFAULT_XP} from '../shared/rules';
const API='http://127.0.0.1:3002/api/events';
async function event(api:APIRequestContext,token:string,event:string,data:unknown={}){const r=await api.post(API,{maxRetries:event==='lobby:sync'?1:0,headers:{Authorization:`Bearer ${token}`},data:{event,data}});expect(r.status(),await r.text()).toBe(200);return(await r.json()).lobby;}
const command=(api:APIRequestContext,token:string,command:unknown)=>event(api,token,'lobby:command',{command});
for(const width of [320,1440])test(`XP-AUTO-BROWSER-${width}: no approval, farther replacement, durable personal count and direct collection`,async({browser,request})=>{
 const ids=[randomUUID(),randomUUID(),randomUUID()],tokens=ids.map((id,i)=>`test:${id}:XpAuto${i}`);
 const lobby=await event(request,tokens[0],'lobby:create',{settings:{...DEFAULT_SETTINGS,rules:{zombie:true,apocalypse:true,xpHunt:true},xp:{...DEFAULT_XP,target:5},randomRoles:false,preparationSeconds:0,headStartSeconds:0}});
 for(const t of tokens.slice(1))await event(request,t,'lobby:join',{code:lobby.code});
 await command(request,tokens[0],{type:'zone',zone:{feature:circle([13.405,52.52],.7),excluded:[],confirmed:true,name:'AUTOMATED XP REPORT ZONE'}});
 await command(request,tokens[0],{type:'assign',playerId:ids[0],role:'hunter',team:'A'});
 for(const t of tokens){await command(request,t,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await command(request,t,{type:'ready',ready:true});}
 const started=await command(request,tokens[0],{type:'start'}),original=started.xpHunt.point;
 expect(original.confirmed).toBe(true);
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320,permissions:['geolocation'],geolocation:{longitude:original.longitude,latitude:original.latitude,accuracy:3}});
 const other=await browser.newContext({viewport:{width,height:900},permissions:['geolocation']});
 // A stationary emulated provider emits only once. Real watchPosition updates
 // must stay fresh while maps load and two browser sessions interact.
 const gpsTimer=setInterval(()=>{void context.setGeolocation({longitude:original.longitude,latitude:original.latitude,accuracy:3}).catch(()=>{});},3500);
 let otherGpsTimer:ReturnType<typeof setInterval>|undefined;
 try{
  await context.addInitScript(t=>sessionStorage.setItem('manhunt:test-token',t),tokens[1]);const page=await context.newPage();await page.goto('/game');
  await expect(page.getByRole('button',{name:/Punkt freigeben/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Nicht erreichbar (0/5)',exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/}).check();await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
  await expect.poll(async()=>(await event(request,tokens[1],'lobby:sync')).self.location?.longitude).toBe(original.longitude);
  await page.getByRole('button',{name:'Nicht erreichbar (0/5)',exact:true}).click();
  await expect(page.getByRole('button',{name:'Nicht erreichbar (1/5)',exact:true})).toBeVisible();
  const changed=await event(request,tokens[1],'lobby:sync'),replacement=changed.xpHunt.point;
  expect(replacement.id).not.toBe(original.id);expect(replacement.confirmed).toBe(true);expect(distance([original.longitude,original.latitude],[replacement.longitude,replacement.latitude],{units:'meters'})).toBeGreaterThan(25);
  await page.getByRole('button',{name:'Nicht erreichbar (1/5)',exact:true}).click();await expect(page.getByText(/Kein weiter entfernter, geeigneter Fußweg-Punkt verfügbar/)).toBeVisible();
  expect((await event(request,tokens[1],'lobby:sync')).xpUnreachableUsed).toBe(1);
  await page.reload();await expect(page.getByRole('button',{name:'Nicht erreichbar (1/5)',exact:true})).toBeVisible();
  await other.addInitScript(t=>sessionStorage.setItem('manhunt:test-token',t),tokens[2]);await other.setGeolocation({longitude:replacement.longitude,latitude:replacement.latitude,accuracy:3});otherGpsTimer=setInterval(()=>{void other.setGeolocation({longitude:replacement.longitude,latitude:replacement.latitude,accuracy:3}).catch(()=>{});},3500);const second=await other.newPage();await second.goto('/game');
  await second.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/}).check();await second.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
  await expect.poll(async()=>(await event(request,tokens[2],'lobby:sync')).self.location?.longitude).toBe(replacement.longitude);
  await second.getByRole('button',{name:'XP-Punkt einsammeln',exact:true}).click();await expect(second.locator('.xp-panel')).toContainText('1 / 5');await expect(page.locator('.xp-panel')).toContainText('1 / 5');
  expect((await event(request,tokens[2],'lobby:sync')).xpUnreachableUsed).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results-edge/xp-auto-${width}.png`,fullPage:true});
 }finally{clearInterval(gpsTimer);clearInterval(otherGpsTimer);await context.close();await other.close();}
});
