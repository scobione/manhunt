/** Isolated browser tests: synthetic identities/GPS never reach Supabase. */
import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
async function event(api:APIRequestContext,token:string,event:string,data:unknown={}){
 const response=await api.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event,data}});
 expect(response.status(),await response.text()).toBe(200);return(await response.json()).lobby;
}
const command=(api:APIRequestContext,token:string,command:unknown)=>event(api,token,'lobby:command',{command});
test('host saves minute-based and custom visibility settings',async({page,request})=>{
 const token=`test:${randomUUID()}:SettingsHost`;
 await page.addInitScript(token=>sessionStorage.setItem('manhunt:test-token',token),token);
 await page.goto('/create');await page.getByLabel('Pin-Intervall auswählen').selectOption('2');
 await page.getByRole('button',{name:'Lobby erstellen',exact:true}).click();await expect(page.getByTestId('lobby-code')).toBeVisible();
 await page.getByRole('link',{name:'Regeln konfigurieren'}).click();
 await expect(page.getByLabel('Pin-Intervall in Minuten')).toHaveValue('2');
 await page.getByLabel('Pin-Intervall auswählen').selectOption('custom');await page.getByLabel('Pin-Intervall in Minuten').fill('1.5');
 await page.getByLabel('Spielmodus',{exact:true}).selectOption('custom');

 await page.getByRole('button',{name:'Regeln speichern'}).click();await expect(page.getByTestId('lobby-code')).toBeVisible();
 const lobby=await event(request,token,'lobby:sync');expect(lobby.settings.pinIntervalSeconds).toBe(90);expect(lobby.settings.mode).toBe('custom');expect(lobby.settings.outsideGraceSeconds).toBe(60);
});
test('mobile warning stays full screen, return swipe needs GPS, no emergency pause controls remain',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});
 const host=randomUUID(),hider=randomUUID(),other=randomUUID(),ht=`test:${host}:SafetyHunter`,pt=`test:${hider}:SafetyHider`,ot=`test:${other}:SafetyOther`;
 const lobby=await event(request,ht,'lobby:create',{settings:{...DEFAULT_SETTINGS,preparationSeconds:0,headStartSeconds:0,randomRoles:false,pinIntervalSeconds:60}});
 await event(request,pt,'lobby:join',{code:lobby.code});await event(request,ot,'lobby:join',{code:lobby.code});
 await command(request,ht,{type:'zone',zone:{feature:circle([13.405,52.52],.03),excluded:[],name:'ISOLATED GPS TEST',confirmed:true}});
 await command(request,ht,{type:'assign',playerId:host,role:'hunter',team:'A'});
 for(const token of [ht,pt,ot])await command(request,token,{type:'ready',ready:true});await command(request,ht,{type:'start'});
 for(const token of [ht,ot])await command(request,token,{type:'location',location:{latitude:52.52,longitude:13.405,accuracy:5,timestamp:Date.now()}});
 await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await page.addInitScript(token=>{
  sessionStorage.setItem('manhunt:test-token',token);
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(cb:PositionCallback)=>{(window as any).__gpsCallback=cb;return 42;},clearWatch:()=>{},getCurrentPosition:()=>{}}});
 },pt);
 await page.goto('/game');await expect(page.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
 await expect(page.locator(`[data-player-id="${other}"]`)).toBeVisible();
 await page.getByRole('checkbox',{name:/Ich teile meinen Standort/}).check();await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
 const fix=async(longitude:number,accuracy=5)=>{
  const response=page.waitForResponse(r=>r.url().endsWith('/api/events')&&r.request().postDataJSON()?.data?.command?.type==='location');
  await page.evaluate(({longitude,accuracy})=>(window as any).__gpsCallback({coords:{latitude:52.52,longitude,accuracy},timestamp:Date.now()}),{longitude,accuracy});return(await response).status();
 };
 expect(await fix(13.406)).toBe(200);
 const warning=page.getByRole('dialog',{name:'Warnung Spielzone'});await expect(warning).toBeVisible();
 const box=await warning.boundingBox();expect(box?.width).toBe(390);expect(box?.height).toBe(844);
 await expect(page.getByLabel('Rückkehr bestätigen')).toBeDisabled();
 await page.screenshot({path:'test-results-edge/gps-warning-mobile.png'});
 await page.waitForTimeout(3300);expect(await fix(13.406,500)).toBe(400);
 await expect(warning).toBeVisible();await expect(warning.getByText(/GPS unsicher oder unterbrochen/)).toBeVisible();
 const held=await page.getByTestId('outside-countdown').innerText();expect(held).not.toBe('01:00');
 await page.waitForTimeout(3300);expect(await fix(13.405)).toBe(200);await expect(page.getByLabel('Rückkehr bestätigen')).toBeDisabled();
 await page.waitForTimeout(3300);expect(await fix(13.405)).toBe(200);await expect(page.getByLabel('Rückkehr bestätigen')).toBeEnabled();
 await page.getByLabel('Rückkehr bestätigen').focus();await page.keyboard.press('End');await expect(warning).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Notfall-Pause',exact:true})).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'NOTFALL-PAUSE'})).toHaveCount(0);
 const continued=await event(request,pt,'lobby:sync');expect(continued.status).toBe('active');

});
