/** AUTOMATED LOCAL TESTS ONLY: synthetic identities/GPS, no production services.
 * Real game engine and browser Pointer Events; mobile gestures use Chromium touch input.
 */
import {test,expect,type Browser,type Page,type Locator,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
async function match(browser:Browser,api:APIRequestContext,width:number){
 const ids=[randomUUID(),randomUUID(),randomUUID()],tokens=ids.map((id,i)=>`test:${id}:${['SwipeHost','SwipePlayer','SwipeOther'][i]}`);
 const event=async(token:string,event:string,data:unknown={})=>{const r=await api.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event,data}});expect(r.status(),await r.text()).toBe(200);return(await r.json()).lobby;};
 const cmd=(token:string,command:unknown)=>event(token,'lobby:command',{command});
 const lobby=await event(tokens[0],'lobby:create',{settings:{...DEFAULT_SETTINGS,rules:{zombie:true,apocalypse:false,xpHunt:false},captureMethod:'code',preparationSeconds:0,headStartSeconds:0,randomRoles:false}});
 for(const token of tokens.slice(1))await event(token,'lobby:join',{code:lobby.code});
 await cmd(tokens[0],{type:'zone',zone:{feature:circle([13.405,52.52],.03),excluded:[],name:'AUTOMATED SWIPE TEST',confirmed:true}});
 await cmd(tokens[0],{type:'assign',playerId:ids[0],role:'hunter',team:'A'});
 for(const token of tokens){await cmd(token,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await cmd(token,{type:'ready',ready:true});}
 await cmd(tokens[0],{type:'start'});
 const context=await browser.newContext({viewport:{width,height:width<600?844:1000},isMobile:width<600,hasTouch:width<600});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await context.addInitScript(token=>{sessionStorage.setItem('manhunt:test-token',token);Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(cb:PositionCallback)=>{(window as any).__swipeGPS=cb;return 42;},clearWatch:()=>{},getCurrentPosition:()=>{}}});},tokens[1]);
 const page=await context.newPage();const commands:string[]=[];page.on('request',req=>{if(req.url().endsWith('/api/events'))commands.push(req.postDataJSON()?.data?.command?.type);});
 await page.goto('/game');await expect(page.getByTestId('role-label')).toHaveText('HIDER');
 const infect=async()=>{const state=await event(tokens[1],'lobby:sync');await cmd(tokens[0],{type:'capture',targetId:ids[1],code:state.self.captureCode});await expect(page.getByRole('heading',{name:'DU WURDEST INFIZIERT.'})).toBeVisible();};
 return {page,context,commands,infect,event,cmd,tokens};
}
async function geometry(slider:Locator){await slider.scrollIntoViewIfNeeded();return slider.evaluate(el=>{const rect=el.getBoundingClientRect(),track=el.parentElement!;return{x:rect.x+rect.width/2,y:rect.y+rect.height/2,travel:track.clientWidth-2*parseFloat(getComputedStyle(el).left)-(el as HTMLElement).offsetWidth};});}
async function mouseDrag(page:Page,slider:Locator,fraction:number,release=true){const g=await geometry(slider);await page.mouse.move(g.x,g.y);await page.mouse.down();await page.mouse.move(g.x+g.travel*fraction,g.y+20,{steps:12});if(release)await page.mouse.up();return g;}
async function enableGps(page:Page){await page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/}).check();await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();}
async function fix(page:Page,longitude:number){const result=page.waitForResponse(r=>r.url().endsWith('/api/events')&&r.request().postDataJSON()?.data?.command?.type==='location');await page.evaluate(longitude=>(window as any).__swipeGPS({coords:{longitude,latitude:52.52,accuracy:5},timestamp:Date.now()}),longitude);expect((await result).status()).toBe(200);}
for(const width of [320,1440])test(`SWIPE-${width}: GPS lock, track taps, aborted drag, pointer capture, one confirmation and zombie access`,async({browser,request})=>{
 const a=await match(browser,request,width),{page,commands}=a;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/api/events',async route=>{if(['zone_return_ack','infection_ack'].includes(route.request().postDataJSON()?.data?.command?.type))await new Promise(resolve=>setTimeout(resolve,650));await route.continue();});
  await enableGps(page);await fix(page,13.406);
  const dialog=page.getByRole('dialog',{name:'Warnung Spielzone'}),slider=page.getByRole('slider',{name:'Rückkehr bestätigen'});
  await expect(dialog).toBeVisible();await expect(slider).toBeDisabled();await expect(page.getByText('Warte auf bestätigte Position in der Spielzone')).toBeVisible();
  await mouseDrag(page,slider,1);await slider.focus();await page.keyboard.press('End');expect(commands.filter(v=>v==='zone_return_ack')).toHaveLength(0);await expect(slider).toHaveAttribute('aria-valuenow','0');
  await page.screenshot({path:`test-results-edge/swipe-${width}-locked.png`,animations:'disabled'});
  await page.waitForTimeout(3300);await fix(page,13.405);await expect(slider).toBeDisabled();
  await page.waitForTimeout(3300);await fix(page,13.405);await expect(slider).toBeEnabled();
  await page.screenshot({path:`test-results-edge/swipe-${width}-return-ready.png`,animations:'disabled'});
  const track=slider.locator('..');const size=(await track.boundingBox())!;
  await track.click({position:{x:size.width-8,y:size.height/2}});await slider.click();expect(commands.filter(v=>v==='zone_return_ack')).toHaveLength(0);
  await mouseDrag(page,slider,.93);await expect(slider).toHaveAttribute('aria-valuenow','0');
  await expect.poll(async()=>slider.evaluate(el=>el.getBoundingClientRect().x-el.parentElement!.getBoundingClientRect().x)).toBeLessThan(9);
  expect(commands.filter(v=>v==='zone_return_ack')).toHaveLength(0);
  const g=await mouseDrag(page,slider,.55,false);await expect(slider).toHaveAttribute('aria-valuenow','55');
  await page.screenshot({path:`test-results-edge/swipe-${width}-return.png`,animations:'disabled'});
  // Leave the grip vertically while captured; confirmation uses actual horizontal travel.
  await page.mouse.move(g.x+g.travel*.96,g.y+100,{steps:8});await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-busy','true');await expect(slider).toBeDisabled();await page.keyboard.press('End');
  await expect(dialog).not.toBeVisible();expect(commands.filter(v=>v==='zone_return_ack')).toHaveLength(1);
  await a.infect();const zombie=page.getByRole('slider',{name:'Zur Wiederbelebung schieben'});await expect(zombie).toBeEnabled();
  await expect(zombie.locator('..').getByText('Zur Wiederbelebung schieben')).toBeVisible();
  await zombie.scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results-edge/swipe-${width}-zombie-ready.png`,animations:'disabled'});
  if(width<600){
   const cdp=await a.context.newCDPSession(page);
   const touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',x=0,y=0)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
   const p=await geometry(zombie),scroll=await page.evaluate(()=>scrollY);
   await touch('touchStart',p.x,p.y);await touch('touchMove',p.x+p.travel*.97,p.y+70);await expect(zombie).toHaveAttribute('aria-valuenow','97');await touch('touchCancel');
   await expect(zombie).toHaveAttribute('aria-valuenow','0');expect(commands.filter(v=>v==='infection_ack')).toHaveLength(0);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
   await expect.poll(async()=>zombie.evaluate(el=>el.getBoundingClientRect().x-el.parentElement!.getBoundingClientRect().x)).toBeLessThan(9);
   // Normal vertical scrolling still works on the track outside the grip.
   const box=(await zombie.locator('..').boundingBox())!;
   await touch('touchStart',box.x+box.width-12,box.y+box.height/2);await touch('touchMove',box.x+box.width-12,box.y+box.height/2-90);await touch('touchEnd');
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(scroll+10);
   const q=await geometry(zombie);await touch('touchStart',q.x,q.y);await touch('touchMove',q.x+q.travel*.55,q.y);
   await page.screenshot({path:`test-results-edge/swipe-${width}-zombie.png`,animations:'disabled'});
   await touch('touchMove',q.x+q.travel*.97,q.y+75);await touch('touchEnd');await cdp.detach();
  }else{
   await zombie.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await expect(zombie).toHaveAttribute('aria-valuenow','20');await page.keyboard.press('Home');await expect(zombie).toHaveAttribute('aria-valuenow','0');
   await page.emulateMedia({reducedMotion:'reduce'});expect(await zombie.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
   await page.keyboard.press('ArrowRight');await page.screenshot({path:`test-results-edge/swipe-${width}-zombie.png`,animations:'disabled'});
   await page.keyboard.down('End');expect(commands.filter(v=>v==='infection_ack')).toHaveLength(0);await page.keyboard.up('End');await page.keyboard.press('End');
  }
  await expect(page.getByRole('heading',{name:'DU WURDEST INFIZIERT.'})).toHaveCount(0);expect(commands.filter(v=>v==='infection_ack')).toHaveLength(1);
  expect((await a.event(a.tokens[1],'lobby:sync')).self.infectionPending).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 }finally{await a.context.close();}
});
test('SWIPE-ERROR: a rejected confirmation resets the grip and retries only on a new deliberate gesture',async({browser,request})=>{
 const a=await match(browser,request,390);try{
  await a.infect();let attempts=0;
  await a.page.route('**/api/events',async route=>{if(route.request().postDataJSON()?.data?.command?.type==='infection_ack'&&++attempts===1)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Test: Bestätigung abgelehnt.'})});await route.continue();});
  const slider=a.page.getByRole('slider',{name:'Zur Wiederbelebung schieben'});await slider.focus();await a.page.keyboard.press('End');
  await expect(a.page.getByRole('status').filter({hasText:'Test: Bestätigung abgelehnt.'})).toBeVisible();await expect(slider).toHaveAttribute('aria-valuenow','0');await expect(slider).toBeEnabled();expect(attempts).toBe(1);
  await slider.focus();await a.page.keyboard.press('End');await expect(slider).toHaveCount(0);expect(attempts).toBe(2);
 }finally{await a.context.close();}
});
