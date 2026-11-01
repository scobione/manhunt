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
  // COUNTDOWN-01/02: the real start command reveals no role or map before
  // the shared five-second server deadline (desktop host + mobile player).
  await host.page.evaluate(()=>{
   const seen:{number:string;at:number}[]=[];(window as any).__startSequence=seen;
   const observer=new MutationObserver(()=>{const number=document.querySelector('[data-testid="start-countdown"]')?.textContent;if(number&&seen.at(-1)?.number!==number)seen.push({number,at:performance.now()});if(document.querySelector('[data-testid="role-label"]')){(window as any).__revealedAt=performance.now();observer.disconnect();}});
   observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  });
  await host.page.getByRole('button',{name:'Match starten',exact:true}).click();
  await expect(host.page.getByTestId('start-countdown')).toHaveText('5');
  for(const a of [host,guest]){
   const dialog=a.page.getByRole('dialog',{name:'Spielstart',exact:true});await expect(dialog).toBeVisible();
   await expect(a.page.getByTestId('role-label')).toHaveCount(0);await expect(a.page.getByTestId('zone-map')).toHaveCount(0);
   expect(await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))).toEqual(await a.page.evaluate(()=>({width:innerWidth,height:innerHeight})));
  }
  await guest.page.screenshot({path:'test-results-edge/start-countdown-mobile.png'});
  for(const a of [host,guest]){await expect(a.page).toHaveURL(/\/game$/);await expect(a.page.getByRole('button',{name:'GPS aktivieren',exact:true})).toHaveCount(0);await expect(a.page.getByRole('button',{name:'Standortfreigabe beenden',exact:true})).toBeVisible();}
  const sequence=await host.page.evaluate(()=>({seen:(window as any).__startSequence,revealed:(window as any).__revealedAt}));
  expect(sequence.seen.map((x:any)=>x.number)).toEqual(['5','4','3','2','1']);
  expect(sequence.revealed-sequence.seen[0].at).toBeGreaterThanOrEqual(4600);
  await expect(host.page.getByTestId('role-label')).toHaveText('HUNTER');await expect(guest.page.getByTestId('role-label')).toHaveText('HIDER');
  await expect.poll(async()=>!!(await event(guest,'lobby:sync')).lobby.self.location).toBe(true);
  await expect.poll(async()=>(await event(host,'lobby:sync')).lobby.pins.length).toBeGreaterThan(0);
  await guest.page.reload();await expect(guest.page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/})).not.toBeChecked();expect(await guest.page.evaluate(()=>(window as any).__lobbyGps.calls)).toBe(0);expect(errors).toEqual([]);
 }finally{await host.context.close();await guest.context.close();}
});
test('COUNTDOWN-03: reload resumes the remaining countdown; reduced motion and late navigation do not restart it',async({browser})=>{
 const {host,guest}=await lobby(browser);
 try{
  await host.page.emulateMedia({reducedMotion:'reduce'});
  for(const a of [host,guest]){await grant(a.page);await a.page.getByRole('button',{name:'Bereit',exact:true}).click();}
  await host.page.getByRole('button',{name:'Match starten',exact:true}).click();
  await expect(host.page.getByTestId('start-countdown')).toHaveText('5');
  expect(await host.page.getByTestId('start-countdown').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect(host.page.getByTestId('start-countdown')).toHaveText('3');await host.page.reload();
  await expect(host.page.getByRole('dialog',{name:'Spielstart',exact:true})).toBeVisible();
  expect(Number(await host.page.getByTestId('start-countdown').textContent())).toBeLessThanOrEqual(3);
  await expect(host.page.getByTestId('role-label')).toHaveText('HUNTER');
  await host.page.goto('/');await host.page.goto('/game');await expect(host.page.getByTestId('role-label')).toHaveText('HUNTER');await expect(host.page.getByRole('dialog',{name:'Spielstart',exact:true})).toHaveCount(0);
  expect(await host.page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 }finally{await host.context.close();await guest.context.close();}
});
test('COUNTDOWN-04: configured preparation remains intact, pause cancels the overlay, resume and match end stay usable',async({browser})=>{
 const {host,guest}=await lobby(browser);
 try{
  await cmd(host,{type:'settings',settings:{...DEFAULT_SETTINGS,preparationSeconds:30,headStartSeconds:60,randomRoles:false}});
  for(const a of [host,guest]){await grant(a.page);await a.page.getByRole('button',{name:'Bereit',exact:true}).click();}
  const started=(await cmd(host,{type:'start'})).lobby;
  expect(started.status).toBe('preparing');expect(started.startedAt-started.events.find((e:any)=>e.type==='match_started').at).toBe(30000);
  await expect(host.page.getByRole('dialog',{name:'Spielstart',exact:true})).toBeVisible();
  await cmd(host,{type:'pause'});await expect(host.page.getByRole('heading',{name:'SPIEL PAUSIERT',exact:true})).toBeVisible();await expect(host.page.getByRole('dialog',{name:'Spielstart',exact:true})).toHaveCount(0);
  await expect.poll(async()=>{const state=(await event(host,'lobby:sync')).lobby;return state.serverTime-started.events.find((e:any)=>e.type==='match_started').at;}).toBeGreaterThan(5000);
  await host.page.locator('.panel.game-status').getByRole('button',{name:'Fortsetzen',exact:true}).click();await expect(host.page.getByRole('heading',{name:'DU BIST HUNTER',exact:true})).toBeVisible();await expect(host.page.getByText('VORBEREITUNGSZEIT',{exact:true})).toBeVisible();await expect(host.page.getByRole('dialog',{name:'Spielstart',exact:true})).toHaveCount(0);
  await cmd(host,{type:'end'});await expect(host.page.getByRole('heading',{name:'Die Jagd ist vorbei.',exact:true})).toBeVisible();
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
