/** Player-experience integration tests. Synthetic identities, GPS and path data
 * exist only in the isolated localhost Edge harness; never in production. */
import {test,expect,type APIRequestContext,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS,type LobbyView,type Settings} from '../shared/types';
import {DEFAULT_XP} from '../shared/rules';

const API='http://127.0.0.1:3002/api/events';
const centre={longitude:13.405,latitude:52.52,accuracy:3};
type Actor={id:string;token:string;name:string};
const actor=(name:string):Actor=>{const id=randomUUID();return{id,name,token:`test:${id}:${name}`};};
async function event(api:APIRequestContext,who:Actor,event:string,data:unknown={}):Promise<LobbyView>{
 const response=await api.post(API,{headers:{Authorization:`Bearer ${who.token}`},data:{event,data}});
 expect(response.status(),await response.text()).toBe(200);return(await response.json()).lobby;
}
const command=(api:APIRequestContext,who:Actor,command:unknown)=>event(api,who,'lobby:command',{command});
async function createMatch(api:APIRequestContext,settings:Partial<Settings>={},start=true){
 const host=actor('ExperienceHunter'),hider=actor('ExperienceHider');
 const lobby=await event(api,host,'lobby:create',{settings:{...DEFAULT_SETTINGS,randomRoles:false,preparationSeconds:0,headStartSeconds:0,...settings}});
 await event(api,hider,'lobby:join',{code:lobby.code});
 await command(api,host,{type:'zone',zone:{name:'ISOLATED EXPERIENCE ZONE',feature:circle([centre.longitude,centre.latitude],.7),excluded:[],confirmed:true}});
 await command(api,host,{type:'assign',playerId:host.id,role:'hunter',team:'A'});
 for(const who of [host,hider]){
  await command(api,who,{type:'location_check',location:{...centre,timestamp:Date.now()}});
  await command(api,who,{type:'ready',ready:true});
 }
 return{host,hider,lobby:start?await command(api,host,{type:'start'}):await event(api,host,'lobby:sync')};
}
async function openActor(browser:Browser,who:Actor,width:number,position=centre){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<600,permissions:['geolocation']});
 await context.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
 await context.addInitScript(({token,position})=>{
  sessionStorage.setItem('manhunt:test-token',token);
  const callbacks=new Map<number,PositionCallback>();let id=0;
  const fixture={...position,calls:0,emitEnabled:true};(window as any).__experienceGps=fixture;
  const value=()=>({coords:{latitude:fixture.latitude,longitude:fixture.longitude,accuracy:fixture.accuracy},timestamp:Date.now()} as GeolocationPosition);
  Object.defineProperty(navigator,'geolocation',{value:{
   watchPosition:(success:PositionCallback)=>{fixture.calls++;const key=++id;callbacks.set(key,success);setTimeout(()=>{if(callbacks.has(key)&&fixture.emitEnabled)success(value());},10);return key;},
   clearWatch:(key:number)=>callbacks.delete(key),
   getCurrentPosition:(success:PositionCallback)=>{fixture.calls++;setTimeout(()=>{if(fixture.emitEnabled)success(value());},10);},
  }});
  // A fresh provider stream keeps server freshness and jump checks unchanged.
  // Clearing a watch removes its callback; closing the context destroys the timer.
  setInterval(()=>{if(fixture.emitEnabled)callbacks.forEach(callback=>callback(value()));},1000);
 },{token:who.token,position});
 return{context,page:await context.newPage()};
}
async function enableGps(page:Page){
 await page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/}).check();
 await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
 await expect(page.locator('.mh-pin-own')).toBeVisible();
}
async function expectInitialViewport(page:Page){
 await expect(page.getByTestId('game-match-time')).toBeVisible();
 await expect(page.getByTestId('game-pin-due')).toBeVisible();
 const shell=page.getByTestId('game-live-shell');await expect(shell).toBeVisible();
 const canvas=shell.locator('.mh-map-wrap canvas');await expect(canvas).toBeVisible();
 const boxes=await page.evaluate(()=>{
  const read=(selector:string)=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right}:null;};
  const nav=document.querySelector('.bottom-nav'),navRect=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect():null;
  return{shell:read('[data-testid="game-live-shell"]'),map:read('[data-testid="game-live-shell"] .mh-map-wrap canvas'),time:read('[data-testid="game-match-time"]'),pin:read('[data-testid="game-pin-due"]'),limit:navRect?.top??innerHeight,width:innerWidth,scrollY,documentWidth:document.documentElement.scrollWidth};
 });
 expect(boxes.scrollY).toBe(0);expect(boxes.documentWidth).toBeLessThanOrEqual(boxes.width+1);
 for(const rect of [boxes.shell,boxes.map,boxes.time,boxes.pin]){
  expect(rect).not.toBeNull();expect(rect!.top).toBeGreaterThanOrEqual(0);
  expect(rect!.bottom).toBeLessThanOrEqual(boxes.limit+1);
  expect(rect!.left).toBeGreaterThanOrEqual(-1);expect(rect!.right).toBeLessThanOrEqual(boxes.width+1);
 }
}

for(const width of [320,390,1440])test(`EXP-HUD-${width}: map, remaining time and next pin fit the initial viewport with consent preserved`,async({browser,request})=>{
 const match=await createMatch(request,{pinIntervalSeconds:120});
 const {context,page}=await openActor(browser,match.hider,width);
 try{
  await page.goto('/game');await expect(page.getByRole('heading',{name:'Die Jagd läuft.',exact:true})).toBeVisible();
  await expect(page.getByTestId('role-label')).toHaveText('HIDER');
  expect(await page.evaluate(()=>(window as any).__experienceGps.calls)).toBe(0);
  await expectInitialViewport(page);
  await enableGps(page);await page.evaluate(()=>scrollTo(0,0));
  await expect(page.getByTestId('game-gps-quality')).toContainText(/3\s*m/);
  await expectInitialViewport(page);
  if(width===320){await page.evaluate(()=>{document.documentElement.style.fontSize='200%';scrollTo(0,0);});await expectInitialViewport(page);}
  await page.screenshot({path:`test-results-edge/experience-hud-${width}.png`});
 }finally{await context.close();}
});

test('EXP-RULES: host and guest see the selected rules before start while start permission stays with the host',async({browser,request})=>{
 const match=await createMatch(request,{durationSeconds:2400,pinIntervalSeconds:120,captureMethod:'code',headStartSeconds:30,preparationSeconds:15,rules:{zombie:true,apocalypse:true,xpHunt:true},xp:{...DEFAULT_XP,target:7}},false);
 const actors: {context:BrowserContext;page:Page}[]=[];
 try{
  for(const who of [match.host,match.hider]){
   const a=await openActor(browser,who,who===match.host?1440:320);actors.push(a);await a.page.goto('/lobby');
   const summary=a.page.getByTestId('lobby-rules-summary');await expect(summary).toBeVisible();
   await expect(summary).toContainText(/40\s*(?:Min|MIN)/);
   await expect(summary).toContainText(/2\s*(?:Min|MIN)/);
   await expect(summary).toContainText(/Fangcode|FANGCODE/);
   for(const mode of [/Zombie/i,/Apokalypse/i,/XP.Jagd/i])await expect(summary).toContainText(mode);
   await expect(summary).toContainText(/30/);await expect(summary).toContainText(/15/);
  }
  await expect(actors[1].page.getByRole('button',{name:'Match starten',exact:true})).toHaveCount(0);
  const rejected=await request.post(API,{headers:{Authorization:`Bearer ${match.hider.token}`},data:{event:'lobby:command',data:{command:{type:'start'}}}});
  expect(rejected.status()).toBe(400);expect((await rejected.json()).error).toContain('Nur der Host');
  expect((await event(request,match.host,'lobby:sync')).status).toBe('waiting');
 }finally{for(const a of actors)await a.context.close();}
});

test('EXP-RELEASE: the Hunter sees team counts and cannot capture before the displayed release deadline',async({browser,request})=>{
 const match=await createMatch(request,{headStartSeconds:12,captureMethod:'code'}),{context,page}=await openActor(browser,match.host,390);
 try{
  await page.goto('/game');await expect(page.getByTestId('role-label')).toHaveText('HUNTER');
  const release=page.getByTestId('game-release-status'),teams=page.getByTestId('game-team-status');
  await expect(release).toContainText(/00:(?:0[1-9]|1[0-2])/);
  await expect(teams).toContainText(/Hunter/i);await expect(teams).toContainText(/Hider/i);
  await page.getByLabel('Hider auswählen').selectOption(match.hider.id);
  const target=await event(request,match.hider,'lobby:sync');
  const rejected=await request.post(API,{headers:{Authorization:`Bearer ${match.host.token}`},data:{event:'lobby:command',data:{command:{type:'capture',targetId:match.hider.id,code:target.self.captureCode}}}});
  expect(rejected.status()).toBe(400);expect((await rejected.json()).error).toMatch(/Vorsprung|Hunter|Start/);
  await expect(page.getByRole('button',{name:'Gefangen nehmen',exact:true})).toBeDisabled();
  await expect(release).toContainText(/freigegeben|aktiv/i);
  await expect(page.getByRole('button',{name:'Gefangen nehmen',exact:true})).toBeEnabled();
 }finally{await context.close();}
});

test('EXP-XP-REFUSAL: an out-of-range Hider sees the real refusal and progress remains unchanged',async({browser,request})=>{
 const match=await createMatch(request,{rules:{zombie:false,apocalypse:false,xpHunt:true},xp:{...DEFAULT_XP,target:5}});
 const point=match.lobby.xpHunt!.point!;
 const position={longitude:point.longitude<13.406?13.408:13.405,latitude:centre.latitude,accuracy:3};
 const {context,page}=await openActor(browser,match.hider,390,position);
 try{
  await page.goto('/game');await expect(page.getByRole('heading',{name:'Die Jagd läuft.',exact:true})).toBeVisible();await enableGps(page);
  await expect.poll(async()=>(await event(request,match.hider,'lobby:sync')).self.location?.longitude).toBe(position.longitude);
  await page.getByRole('button',{name:'XP-Punkt einsammeln',exact:true}).click();
  await expect(page.getByTestId('xp-action-error')).toContainText(/Sammelradius|entfernt|innerhalb/);
  const state=await event(request,match.hider,'lobby:sync');expect(state.xpHunt!.collected).toBe(0);expect(state.xpHunt!.point!.id).toBe(point.id);
  // The opponent cannot bypass the UI to collect the Hider objective.
  const denied=await request.post(API,{headers:{Authorization:`Bearer ${match.host.token}`},data:{event:'lobby:command',data:{command:{type:'xp_collect',pointId:point.id}}}});
  expect(denied.status()).toBe(400);expect((await event(request,match.host,'lobby:sync')).xpHunt!.collected).toBe(0);
 }finally{await context.close();}
});

test('EXP-XP-REPLACEMENTS: remaining allowance persists and an impossible replacement consumes no additional use',async({browser,request})=>{
 const match=await createMatch(request,{rules:{zombie:false,apocalypse:false,xpHunt:true},xp:{...DEFAULT_XP,target:5}});
 const original=match.lobby.xpHunt!.point!;
 const {context,page}=await openActor(browser,match.hider,320,{longitude:original.longitude,latitude:original.latitude,accuracy:3});
 try{
  await page.goto('/game');await expect(page.getByRole('heading',{name:'Die Jagd läuft.',exact:true})).toBeVisible();await enableGps(page);
  await expect.poll(async()=>(await event(request,match.hider,'lobby:sync')).self.location?.longitude).toBe(original.longitude);
  await expect(page.getByTestId('xp-replacements-left')).toContainText(/5/);
  await page.getByRole('button',{name:'Nicht erreichbar (0/5)',exact:true}).click();
  await expect(page.getByRole('button',{name:'Nicht erreichbar (1/5)',exact:true})).toBeVisible();
  await expect(page.getByTestId('xp-replacements-left')).toContainText(/4/);
  const replaced=await event(request,match.hider,'lobby:sync');expect(replaced.xpUnreachableUsed).toBe(1);expect(replaced.xpHunt!.point!.id).not.toBe(original.id);
  await page.getByRole('button',{name:'Nicht erreichbar (1/5)',exact:true}).click();
  await expect(page.getByTestId('xp-action-error')).toContainText(/Kein weiter entfernter|keinen.*Ersatz|geeigneter/);
  await expect(page.getByTestId('xp-replacements-left')).toContainText(/4/);
  const unchanged=await event(request,match.hider,'lobby:sync');expect(unchanged.xpUnreachableUsed).toBe(1);expect(unchanged.xpHunt!.point!.id).toBe(replaced.xpHunt!.point!.id);
  await page.reload();await expect(page.getByTestId('xp-replacements-left')).toContainText(/4/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await context.close();}
});

test('EXP-RECONNECT: confirmation waits for authoritative state and is not repeated on the next poll',async({browser,request})=>{
 const match=await createMatch(request),{context,page}=await openActor(browser,match.hider,390);
 let release=()=>{};
 try{
  await page.goto('/game');await expect(page.getByRole('heading',{name:'Die Jagd läuft.',exact:true})).toBeVisible();
  await expect(page.locator('.connection')).toHaveText('VERBUNDEN');
  const message=page.getByRole('status').filter({hasText:'Wieder verbunden. Spielstand synchronisiert.'});
  await expect(message).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({hasText:'Du bist offline.'})).toBeVisible();
  await expect(page.locator('.connection')).toHaveText('VERBINDE…');
  await command(request,match.host,{type:'pause'});
  let requestArrived=()=>{};
  const held=new Promise<void>(resolve=>release=resolve),arrived=new Promise<void>(resolve=>requestArrived=resolve);
  await page.route('**/api/sync',async route=>{requestArrived();await held;await route.continue();},{times:1});
  await context.setOffline(false);await arrived;
  await expect(message).toHaveCount(0);await expect(page.locator('.connection')).toHaveText('VERBINDE…');
  await expect(page.getByRole('heading',{name:'SPIEL PAUSIERT',exact:true})).toHaveCount(0);
  release();
  await expect(page.getByRole('heading',{name:'SPIEL PAUSIERT',exact:true})).toBeVisible();
  await expect(page.locator('.connection')).toHaveText('VERBUNDEN');await expect(message).toBeVisible();
  await page.locator('.toast').filter({hasText:'Wieder verbunden. Spielstand synchronisiert.'}).getByRole('button').click();
  const nextPoll=await page.waitForResponse(response=>response.url().endsWith('/api/sync'));expect(nextPoll.ok()).toBe(true);await nextPoll.finished();
  await expect(message).toHaveCount(0);
  expect((await event(request,match.hider,'lobby:sync')).status).toBe('paused');
 }finally{release();await context.close();}
});

test('EXP-GPS-GUIDANCE: actual HUD shows weak, stale and recovered fixes with safe guidance',async({browser,request})=>{
 test.setTimeout(60000);
 const match=await createMatch(request,{maxAccuracyMeters:30}),{context,page}=await openActor(browser,match.hider,390);
 try{
  await page.goto('/game');await expect(page.getByTestId('role-label')).toHaveText('HIDER');
  expect(await page.evaluate(()=>(window as any).__experienceGps.calls)).toBe(0);
  await enableGps(page);
  const quality=page.getByTestId('game-gps-quality'),advice=page.locator('.game-gps-advice');
  await expect(quality).toHaveClass(/gps-quality-good/);await expect(quality).toContainText(/3\s*m/);
  await page.evaluate(()=>(window as any).__experienceGps.accuracy=80);
  await expect(quality).toHaveClass(/gps-quality-weak/);await expect(quality).toContainText('GPS ungenau');await expect(quality).toContainText(/80\s*m/);
  await expect(page.getByTestId('map-gps-status')).toHaveText(/GPS UNGENAU.*80 M/);
  await expect(advice).toContainText('sicheren Weg');await expect(advice).toContainText('freien Himmel');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results-edge/experience-gps-weak.png'});
  const calls=await page.evaluate(()=>{const gps=(window as any).__experienceGps;gps.emitEnabled=false;return gps.calls as number;});
  // Keep the real 15-second freshness boundary. Both the watch and fallback
  // one-shots are silent, instead of advancing a fake clock or bypassing GPS rules.
  await expect(quality).toHaveClass(/gps-quality-stale/,{timeout:25000});
  await expect(quality).toContainText('Position veraltet');await expect(advice).toContainText('Vordergrund');
  await expect(page.getByTestId('map-gps-status')).toHaveText('GPS VERALTET');
  await expect(advice).toContainText('sicheren Ort');
  expect(await page.evaluate(()=>(window as any).__experienceGps.calls)).toBeGreaterThan(calls);
  const stale=await event(request,match.hider,'lobby:sync');expect(stale.status).toBe('active');expect(stale.self.eliminated).toBe(false);
  await page.screenshot({path:'test-results-edge/experience-gps-stale.png'});
  await page.evaluate(()=>{const gps=(window as any).__experienceGps;gps.accuracy=3;gps.emitEnabled=true;});
  await expect(quality).toHaveClass(/gps-quality-good/);await expect(quality).toContainText('GPS aktuell');await expect(quality).toContainText(/3\s*m/);
  await expect(advice).toHaveCount(0);
  await expect.poll(async()=>(await event(request,match.hider,'lobby:sync')).self.location?.accuracy).toBe(3);
  await page.screenshot({path:'test-results-edge/experience-gps-recovered.png'});
 }finally{await context.close();}
});

test('EXP-SIGNALS-UI: opt-in switches use real WebAudio, persist choices and explain unsupported vibration',async({browser,request})=>{
 const match=await createMatch(request),{context,page}=await openActor(browser,match.hider,390);
 // Only vibration hardware capability is simulated. AudioContext is Chromium's
 // actual WebAudio implementation; enabling must succeed from the real click.
 await context.addInitScript(()=>{
  (window as any).__experienceVibrations=[];
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:sessionStorage.getItem('manhunt:test-vibration-unsupported')==='true'?undefined:(pattern:number|number[])=>{(window as any).__experienceVibrations.push(pattern);return true;}});
 });
 try{
  await page.goto('/game');await expect(page.getByTestId('role-label')).toHaveText('HIDER');
  const sound=page.getByRole('switch',{name:'Tonsignale',exact:true}),vibration=page.getByRole('switch',{name:'Vibration',exact:true});
  await expect(sound).toHaveAttribute('aria-checked','false');await expect(vibration).toHaveAttribute('aria-checked','false');
  expect(await page.evaluate(()=>localStorage.getItem('manhunt:game-signals:v1'))).toBeNull();
  expect(await page.evaluate(()=>typeof window.AudioContext==='function'||typeof (window as any).webkitAudioContext==='function')).toBe(true);
  await expect(sound).toBeEnabled();await expect(vibration).toBeEnabled();
  await page.screenshot({path:'test-results-edge/experience-signals-default.png',fullPage:true});
  await sound.click();await expect(sound).toHaveAttribute('aria-checked','true');
  await vibration.click();await expect(vibration).toHaveAttribute('aria-checked','true');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt:game-signals:v1')!))).toEqual({sound:true,vibration:true});
  await page.screenshot({path:'test-results-edge/experience-signals-enabled.png',fullPage:true});
  await page.reload();await expect(sound).toHaveAttribute('aria-checked','true');await expect(vibration).toHaveAttribute('aria-checked','true');
  expect(await page.evaluate(()=>(window as any).__experienceVibrations)).toEqual([]);
  await sound.click();await expect(sound).toHaveAttribute('aria-checked','false');
  await vibration.click();await expect(vibration).toHaveAttribute('aria-checked','false');
  expect(await page.evaluate(()=>(window as any).__experienceVibrations)).toEqual([0]);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt:game-signals:v1')!))).toEqual({sound:false,vibration:false});
  await page.evaluate(()=>sessionStorage.setItem('manhunt:test-vibration-unsupported','true'));
  await page.reload();await expect(vibration).toBeDisabled();await expect(vibration).toHaveAttribute('aria-checked','false');
  await expect(page.getByText('Dieser Browser unterstützt keine Vibration.',{exact:true})).toBeVisible();
  await expect(sound).toBeEnabled();await expect(sound).toHaveAttribute('aria-checked','false');
  await page.screenshot({path:'test-results-edge/experience-signals-unsupported.png',fullPage:true});
 }finally{await context.close();}
});
