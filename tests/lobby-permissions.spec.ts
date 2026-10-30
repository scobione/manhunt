/** AUTOMATED TEST ONLY: synthetic identities/GPS, isolated local backend. */
import {test,expect,type Browser,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
async function actor(browser:Browser,name:string,width=390){
 const id=randomUUID(),token=`test:${id}:${name}`;
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await context.addInitScript(token=>{
  sessionStorage.setItem('manhunt:test-token',token);
  const fixture={calls:0,accuracy:5,watch:null as PositionCallback|null,error:null as PositionErrorCallback|null,clears:0,emit:()=>{}};
  const value=()=>({coords:{latitude:52.52,longitude:13.405,accuracy:fixture.accuracy},timestamp:Date.now()} as GeolocationPosition);
  fixture.emit=()=>fixture.watch?.(value());(window as any).__lobbyGps=fixture;
  Object.defineProperty(navigator,'geolocation',{value:{
   watchPosition:(success:PositionCallback,error:PositionErrorCallback)=>{fixture.calls++;fixture.watch=success;fixture.error=error;setTimeout(()=>success(value()),10);return 17;},
   clearWatch:()=>{fixture.clears++;fixture.watch=null;},
   getCurrentPosition:(success:PositionCallback)=>{fixture.calls++;success(value());},
  }});
 },token);
 await page.goto('/');await expect(page.locator('.connection')).toHaveText('VERBUNDEN');
 return {id,token,context,page};
}
async function event(actor:{page:Page;token:string},event:string,data:unknown={},status=200){const response=await actor.page.request.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${actor.token}`},data:{event,data}});expect(response.status(),await response.text()).toBe(status);return response.json();}
const cmd=(a:Parameters<typeof event>[0],command:unknown,status=200)=>event(a,'lobby:command',{command},status);
async function lobby(browser:Browser){const host=await actor(browser,'PreflightHost',1440),guest=await actor(browser,'PreflightGuest');
 const {lobby}=await event(host,'lobby:create',{settings:{...DEFAULT_SETTINGS,preparationSeconds:0,headStartSeconds:0,randomRoles:false}});
 await event(guest,'lobby:join',{code:lobby.code});await cmd(host,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],confirmed:true,name:'ISOLATED PERMISSIONS'}});await cmd(host,{type:'assign',playerId:host.id,role:'hunter',team:'A'});
 for(const a of [host,guest]){await a.page.goto('/lobby');await expect(a.page.getByTestId('lobby-code')).toHaveText(lobby.code);}
 return {host,guest};
}
async function grant(page:Page){await page.getByRole('checkbox',{name:/Ich aktiviere meinen Standort für diese Lobby/}).check();await page.getByRole('button',{name:'Standort freigeben',exact:true}).click();await expect(page.getByText('Standort geprüft',{exact:true})).toBeVisible();}
test('LOBBY-PERM-01: both players opt in, required GPS gates readiness, optional push does not block, grant survives start',async({browser})=>{
 const {host,guest}=await lobby(browser);const errors:string[]=[];for(const a of [host,guest])a.page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const a of [host,guest]){expect(await a.page.evaluate(()=>(window as any).__lobbyGps.calls)).toBe(0);await expect(a.page.getByRole('button',{name:'Bereit',exact:true})).toBeDisabled();await expect(a.page.getByRole('button',{name:'Push aktivieren',exact:true})).toBeVisible();expect((await cmd(a,{type:'ready',ready:true},400)).error).toContain('Standort');}
  expect((await cmd(host,{type:'start'},400)).error).toContain('Standort');
  await grant(host.page);await host.page.getByRole('button',{name:'Bereit',exact:true}).click();await expect(host.page.getByRole('button',{name:'Match starten',exact:true})).toBeDisabled();
  await grant(guest.page);await guest.page.getByRole('button',{name:'Bereit',exact:true}).click();
  const state=(await event(host,'lobby:sync')).lobby;expect(state.players.every((p:any)=>p.locationReady)).toBe(true);expect(state.players.every((p:any)=>!p.location)).toBe(true);expect(state.pins).toEqual([]);
  await guest.page.screenshot({path:'test-results-edge/lobby-permissions-mobile.png',fullPage:true});expect(await guest.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await host.page.getByRole('button',{name:'Match starten',exact:true}).click();
  for(const a of [host,guest]){await expect(a.page).toHaveURL(/\/game$/);await expect(a.page.getByRole('button',{name:'GPS aktivieren',exact:true})).toHaveCount(0);await expect(a.page.getByRole('button',{name:'Standortfreigabe beenden',exact:true})).toBeVisible();}
  await expect.poll(async()=>!!(await event(guest,'lobby:sync')).lobby.self.location).toBe(true);
  await expect.poll(async()=>(await event(host,'lobby:sync')).lobby.pins.length).toBeGreaterThan(0);
  await guest.page.reload();await expect(guest.page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/})).not.toBeChecked();expect(await guest.page.evaluate(()=>(window as any).__lobbyGps.calls)).toBe(0);expect(errors).toEqual([]);
 }finally{await host.context.close();await guest.context.close();}
});
test('LOBBY-PERM-02: inaccurate GPS, revoked permission and leaving lobby remove readiness; stale callbacks cannot restore it',async({browser})=>{
 const {host,guest}=await lobby(browser);
 try{
  await guest.page.evaluate(()=>(window as any).__lobbyGps.accuracy=500);
  await guest.page.getByRole('checkbox',{name:/Ich aktiviere meinen Standort für diese Lobby/}).check();await guest.page.getByRole('button',{name:'Standort freigeben',exact:true}).click();
  await expect(guest.page.locator('.gps-consent .form-error')).toBeVisible();await expect(guest.page.getByRole('button',{name:'Bereit',exact:true})).toBeDisabled();
  await guest.page.evaluate(()=>(window as any).__lobbyGps.accuracy=5);await guest.page.getByRole('button',{name:'Standort erneut prüfen',exact:true}).click();await guest.page.getByRole('button',{name:'Bereit',exact:true}).click();
  await guest.page.evaluate(()=>{const f=(window as any).__lobbyGps;(window as any).__lateGps=f.watch;f.error({code:1,message:'Isolated permission revocation'});});
  await expect.poll(async()=>(await event(guest,'lobby:sync')).lobby.self.ready).toBe(false);await expect(guest.page.getByRole('button',{name:'Bereit',exact:true})).toBeDisabled();
  await guest.page.evaluate(()=>(window as any).__lateGps({coords:{latitude:52.52,longitude:13.405,accuracy:5},timestamp:Date.now()}));expect((await event(guest,'lobby:sync')).lobby.self.locationReady).toBe(false);
  await grant(guest.page);await guest.page.getByRole('button',{name:'Bereit',exact:true}).click();
  await guest.page.locator('.bottom-nav').getByRole('link',{name:'Übersicht',exact:true}).click();await expect.poll(async()=>(await event(guest,'lobby:sync')).lobby.self.locationReady).toBe(false);
 }finally{await host.context.close();await guest.context.close();}
});
