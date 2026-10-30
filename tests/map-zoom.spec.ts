/** Local-only regression: synthetic GPS/accounts/path data never reach production. */
import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';

async function event(api:APIRequestContext,token:string,event:string,data:unknown={}){
 const r=await api.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event,data}});
 expect(r.status(),await r.text()).toBe(200);return(await r.json()).lobby;
}
const command=(api:APIRequestContext,token:string,command:unknown)=>event(api,token,'lobby:command',{command});
async function targetPosition(page:Page){
 let position:{x:number;y:number}|null=null;
 // A sync can replace a marker between frames; wait for its next visible frame.
 await expect.poll(async()=>{position=await page.locator('.mh-xp-pin').boundingBox();return position!==null;}).toBe(true);
 return position!;
}
async function aligned(page:Page){
 // The server-generated XP target is a separate MapLibre marker at the same
 // known coordinate. Different DOM markers must share its projected centre.
 // This detects layout offsets without reading or trusting marker transforms.
 await expect.poll(()=>page.evaluate(()=>{
  const centre=(el:Element)=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const target=document.querySelector('.mh-xp-pin'),pins=[...document.querySelectorAll('.mh-pin')];
  if(!target||pins.length<3||!document.querySelector('.mh-pin-own')||!document.querySelector('.mh-pin img'))return 9999;
  const expected=centre(target);
  return Math.max(...[...pins,...document.querySelectorAll('.mh-pin img')].map(p=>{const c=centre(p);return Math.hypot(c.x-expected.x,c.y-expected.y);}));
 }),{timeout:5000,message:'GPS dots and avatars stay anchored to their geographic coordinate'}).toBeLessThan(1.5);
}
for(const mobile of [true,false])test(`MAP-ZOOM-${mobile?'MOBILE':'DESKTOP'}: fixed GPS points stay anchored across zoom, pan, rotation and resize`,async({browser,request})=>{
 const context=await browser.newContext({viewport:{width:mobile?390:1280,height:844},hasTouch:mobile,isMobile:mobile,reducedMotion:mobile?'no-preference':'reduce',permissions:['geolocation']});
 try{
  const [host,self,mate]=['ZoomHost','ZoomSelf','ZoomMate'].map(name=>({id:randomUUID(),name}));
  const token=(a:typeof host)=>`test:${a.id}:${a.name}`;
  const lobby=await event(request,token(host),'lobby:create',{settings:{...DEFAULT_SETTINGS,rules:{xpHunt:true,zombie:false,apocalypse:false},randomRoles:false,preparationSeconds:0,headStartSeconds:0,pinIntervalSeconds:300}});
  for(const a of [self,mate])await event(request,token(a),'lobby:join',{code:lobby.code});
  const avatar='https://lh3.googleusercontent.com/manhunt-isolated-zoom-test.png';
  const patched=await request.patch('http://127.0.0.1:3002/api/profile',{headers:{Authorization:`Bearer ${token(mate)}`},data:{avatar_url:avatar}});expect(patched.status()).toBe(200);
  await command(request,token(host),{type:'zone',zone:{feature:circle([13.405,52.52],.7),excluded:[],name:'AUTOMATED MAP TEST — SYNTHETIC GPS',confirmed:true}});
  await command(request,token(host),{type:'assign',playerId:host.id,role:'hunter',team:'A'});
  for(const a of [host,self,mate]){await command(request,token(a),{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await command(request,token(a),{type:'ready',ready:true});}
  const started=await command(request,token(host),{type:'start'}),target=started.xpHunt.point;expect(target).toBeTruthy();
  await command(request,token(host),{type:'xp_confirm',pointId:target.id});
  await command(request,token(mate),{type:'location',location:{longitude:target.longitude,latitude:target.latitude,accuracy:3,timestamp:Date.now()}});
  await context.setGeolocation({longitude:target.longitude,latitude:target.latitude,accuracy:3});
  await context.addInitScript(t=>sessionStorage.setItem('manhunt:test-token',t),token(self));
  const page=await context.newPage();
  await page.route('**/*',route=>{
   const url=route.request().url();if(url===avatar)return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="12" fill="#fff"/></svg>'});
   return ['127.0.0.1','localhost'].includes(new URL(url).hostname)?route.continue():route.abort();
  });
  await page.goto('/game');await expect(page.locator('.mh-xp-pin')).toBeVisible();
  await page.getByRole('checkbox',{name:/Ich erlaube die Standortverarbeitung für dieses Match:/}).check();await page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
  await expect(page.locator('.mh-pin-own')).toBeVisible();await aligned(page);
  const map=page.getByTestId('game-map');await map.scrollIntoViewIfNeeded();
  for(const name of ['Zoom in','Zoom in','Zoom out','Zoom out']){await map.getByRole('button',{name,exact:true}).click();await aligned(page);}
  const box=(await map.boundingBox())!;const x=box.x+box.width*.48,y=box.y+box.height*.55;
  await page.mouse.move(x,y);await page.mouse.wheel(0,-160);await aligned(page);
  const before=await targetPosition(page);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y+30,{steps:12});await page.mouse.up();await aligned(page);
  const moved=await targetPosition(page);expect(Math.hypot(moved.x-before.x,moved.y-before.y)).toBeGreaterThan(20);
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+55,y+15,{steps:12});await page.mouse.up({button:'right'});await aligned(page);
  if(mobile){
   const cdp=await context.newCDPSession(page);
   const touches=(spread:number)=>[{x:x-spread,y,id:1},{x:x+spread,y,id:2}];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(30)});
   for(let spread=35;spread<=75;spread+=5)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(spread)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await aligned(page);await cdp.detach();
  }
  await page.setViewportSize({width:mobile?430:1024,height:900});await aligned(page);
  await page.getByRole('button',{name:'Spielzone anzeigen',exact:true}).click();await aligned(page);
  await expect(page.locator('.mh-pin-own')).toBeInViewport();
  await page.screenshot({path:`test-results-edge/map-zoom-${mobile?'mobile':'desktop'}.png`,fullPage:true});
 }finally{await context.close();}
});
