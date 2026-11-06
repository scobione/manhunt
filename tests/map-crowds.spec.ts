/** Isolated synthetic GPS/accounts only. No production identity or coordinates. */
import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
async function event(api:APIRequestContext,token:string,event:string,data:unknown={}){const r=await api.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event,data}});expect(r.status(),await r.text()).toBe(200);return(await r.json()).lobby;}
const command=(api:APIRequestContext,token:string,command:unknown)=>event(api,token,'lobby:command',{command});
for(const width of [320,390,1440])test(`MAP-CROWD-01-${width}: authorized teammate pins group, own GPS remains separate, and withdrawn pins disappear`,async({browser,request})=>{
 test.setTimeout(90000);
 const players=['HunterPrivate','CrowdSelf','CrowdMateOne','CrowdMateTwo','CrowdMateThree'].map(name=>{const id=randomUUID();return{id,name,token:`test:${id}:${name}`};});
 const [hunter,self,...mates]=players;
 const context=await browser.newContext({viewport:{width,height:844},permissions:['geolocation'],geolocation:{longitude:13.405,latitude:52.52,accuracy:3},hasTouch:width<500});
 try{
  const lobby=await event(request,hunter.token,'lobby:create',{settings:{...DEFAULT_SETTINGS,preparationSeconds:0,headStartSeconds:0,randomRoles:false,maxPlayers:12}});
  for(const p of players.slice(1))await event(request,p.token,'lobby:join',{code:lobby.code});
  await command(request,hunter.token,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],confirmed:true,name:'AUTOMATED CROWDED MAP'}});await command(request,hunter.token,{type:'assign',playerId:hunter.id,role:'hunter',team:'A'});
  for(const p of players){await command(request,p.token,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await command(request,p.token,{type:'ready',ready:true});}
  await command(request,hunter.token,{type:'start'});
  for(const p of [hunter,...mates])await command(request,p.token,{type:'location',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});
  await context.addInitScript(token=>sessionStorage.setItem('manhunt:test-token',token),self.token);const page=await context.newPage();await page.goto('/game');
  await page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/}).check();await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
  if(width===320)await page.locator('.mh-map-wrap').evaluate(element=>{element.style.height='240px';element.style.minHeight='240px';});
  await expect(page.locator('.mh-pin-own')).toBeVisible();const cluster=page.getByTestId('map-pin-cluster');await expect(cluster).toHaveCount(1);await cluster.click();
  const popup=page.locator('.mh-cluster-popup');await expect(popup).toBeVisible();for(const mate of mates)await expect(popup).toContainText(mate.name);await expect(popup).not.toContainText(hunter.name);
  const zoom=popup.getByRole('button',{name:'Gruppe auf der Karte vergrößern'});
  // The entire popup must fit inside the clipped map, including its action.
  // A visible but clipped button can otherwise retry until the whole test times out.
  await expect.poll(async()=>{const box=await popup.boundingBox(),map=await page.locator('.mh-map-canvas').boundingBox();return !!box&&!!map&&box.y>=map.y&&box.y+box.height<=map.y+map.height;}).toBe(true);
  await page.screenshot({path:`test-results-edge/crowd-popup-${width}.png`});
  await zoom.click({timeout:5000});await expect(page.locator('.mh-pin-own')).toBeVisible();await expect(page.getByRole('button',{name:'Sonnenlichtmodus'})).toBeVisible();
  for(const mate of mates.slice(0,2))await command(request,mate.token,{type:'stop_location'});
  await expect(cluster).toHaveCount(0);await expect(page.locator(`[data-player-id="${mates[2].id}"]`)).toHaveCount(1);for(const mate of mates.slice(0,2))await expect(page.locator(`[data-player-id="${mate.id}"]`)).toHaveCount(0);
  await expect(page.locator('.mh-pin-own')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();}
});
