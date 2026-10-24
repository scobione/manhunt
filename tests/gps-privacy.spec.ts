/** AUTOMATED REGRESSION TESTS ONLY. Synthetic accounts and GPS, local servers only.
 * Late callbacks must never transmit data after consent revocation or unmount.
 */
import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';

async function event(api:APIRequestContext,token:string,event:string,data:unknown={}){
 const result=await api.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event,data}});
 expect(result.status(),await result.text()).toBe(200);return (await result.json()).lobby;
}
const cmd=(api:APIRequestContext,token:string,command:unknown)=>event(api,token,'lobby:command',{command});
async function setup(page:Page,api:APIRequestContext){
 const hunter=randomUUID(),hider=randomUUID(),hunterToken=`test:${hunter}:AuditHunter`,hiderToken=`test:${hider}:AuditHider`;
 const lobby=await event(api,hunterToken,'lobby:create',{settings:{...DEFAULT_SETTINGS,randomRoles:false,preparationSeconds:0,headStartSeconds:0,pinIntervalSeconds:10}});
 await event(api,hiderToken,'lobby:join',{code:lobby.code});
 await cmd(api,hunterToken,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],name:'ISOLATED SECURITY TEST',confirmed:true}});
 await cmd(api,hunterToken,{type:'assign',playerId:hunter,role:'hunter',team:'A'});
 await cmd(api,hunterToken,{type:'ready',ready:true});await cmd(api,hiderToken,{type:'ready',ready:true});
 await cmd(api,hunterToken,{type:'start'});
 await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await page.addInitScript(token=>{
  sessionStorage.setItem('manhunt:test-token',token);
  const fixture={pending:null as null|PositionCallback,cleared:false};(window as any).__auditGps=fixture;
  Object.defineProperty(navigator,'geolocation',{value:{
   watchPosition:()=>42,clearWatch:()=>{fixture.cleared=true;},
   getCurrentPosition:(success:PositionCallback)=>{fixture.pending??=success;},
  }});
 },hiderToken);
 await page.goto('/game');await expect(page.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
 await page.getByRole('checkbox',{name:/Ich teile meinen Standort/}).check();
 await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
 await page.getByRole('button',{name:'Standort jetzt prüfen',exact:true}).click();
 expect(await page.evaluate(()=>!!(window as any).__auditGps.pending)).toBe(true);
 return {hunterToken,hiderToken};
}
async function completeDelayedFix(page:Page){
 await page.evaluate(()=>{
  const fixture=(window as any).__auditGps;
  if(!fixture.cleared||!fixture.pending)throw Error('Expected cleared watch and pending one-shot GPS callback');
  fixture.pending({coords:{latitude:52.52,longitude:13.405,accuracy:5},timestamp:Date.now()});
 });
}
test('does not transmit a delayed GPS callback after leaving the game screen',async({page,request})=>{
 const {hiderToken}=await setup(page,request);
 await page.getByRole('link',{name:'Übersicht',exact:true}).first().click();await expect(page).toHaveURL(/\/$/);
 const transmitted:string[]=[];page.on('request',request=>{if(request.url().endsWith('/api/events')&&request.postDataJSON()?.data?.command?.type==='location')transmitted.push(request.url());});
 await completeDelayedFix(page);await page.waitForTimeout(1200);expect(transmitted).toEqual([]);
 const state=await event(request,hiderToken,'lobby:sync');expect(state.self.location).toBeUndefined();
});
test('does not transmit a delayed GPS callback after explicit stop and host resume',async({page,request})=>{
 const {hunterToken,hiderToken}=await setup(page,request);
 await page.getByRole('button',{name:'Standortfreigabe beenden',exact:true}).click();
 await expect.poll(async()=> (await event(request,hiderToken,'lobby:sync')).status).toBe('paused');
  await expect(page.locator('.safety-pause')).toBeVisible();
 await cmd(request,hunterToken,{type:'resume'});
  await expect(page.locator('.safety-pause')).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:/Ich teile meinen Standort/})).not.toBeChecked();
 await expect(page.getByRole('button',{name:'GPS aktivieren',exact:true})).toBeDisabled();
 const transmitted:string[]=[];page.on('request',request=>{if(request.url().endsWith('/api/events')&&request.postDataJSON()?.data?.command?.type==='location')transmitted.push(request.url());});
 await completeDelayedFix(page);await page.waitForTimeout(1200);expect(transmitted).toEqual([]);
 const state=await event(request,hiderToken,'lobby:sync');expect(state.self.location).toBeUndefined();
});
