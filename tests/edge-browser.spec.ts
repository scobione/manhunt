/** ISOLATED AUTOMATED TESTS: synthetic accounts/GPS never reach Supabase. */
import {test,expect,type Browser,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
async function actor(browser:Browser,name:string){
 const id=randomUUID(),token=`test:${id}:${name}_${id.slice(0,4)}`;
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(token=>{if(!sessionStorage.getItem('manhunt:test-fixture-seeded')){sessionStorage.setItem('manhunt:test-token',token);sessionStorage.setItem('manhunt:test-fixture-seeded','1');}},token);
 const page=await context.newPage();await page.goto('/');await expect(page.locator('.connection')).toHaveText('VERBUNDEN');
 return {id,token,context,page};
}
async function command(page:Page,token:string,command:unknown){const result=await page.request.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event:'lobby:command',data:{command}}});expect(result.status(),await result.text()).toBe(200);return (await result.json()).lobby;}
test('mobile planned zone continues into a real lobby and both browsers start a match',async({browser})=>{
 const host=await actor(browser,'EdgeHost'),guest=await actor(browser,'EdgeGuest');
 try{
  await host.page.goto('/zone');
  const zone={name:'AUTOMATED BROWSER ZONE',feature:circle([13.405,52.52],.6),excluded:[],confirmed:false};
  await host.page.evaluate(zone=>localStorage.setItem('manhunt:planned-zone',JSON.stringify(zone)),zone);
  await host.page.reload();await expect(host.page.getByLabel('Zonenname',{exact:true})).toHaveValue(zone.name);
  await host.page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/}).check();
  await host.page.getByRole('button',{name:'Zone bestätigen & speichern'}).click();
  await expect(host.page.getByRole('heading',{name:'Deine Zone ist gespeichert.'})).toBeVisible();
  await host.page.getByRole('link',{name:'Weiter: Lobby erstellen'}).click();
  await host.page.getByRole('button',{name:'Lobby erstellen',exact:true}).click();
  await expect(host.page).toHaveURL(/\/zone$/);
  await expect(host.page.getByLabel('Zonenname',{exact:true})).toHaveValue(zone.name);
  await expect(host.page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/})).not.toBeChecked();
  await host.page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/}).check();
  await host.page.getByRole('button',{name:'Zone bestätigen & zum Warteraum'}).click();
  const code=await host.page.getByTestId('lobby-code').innerText();
  await guest.page.goto(`/join?code=${code}`);await guest.page.getByRole('button',{name:'Lobby beitreten',exact:true}).click();
  await expect(host.page.locator('.player-row')).toHaveCount(2);
  await command(host.page,host.token,{type:'settings',settings:{...DEFAULT_SETTINGS,captureMethod:'confirmation',preparationSeconds:0,headStartSeconds:0}});
  await host.page.getByRole('button',{name:'Bereit',exact:true}).click();await guest.page.getByRole('button',{name:'Bereit',exact:true}).click();
  await expect(host.page.getByRole('button',{name:'Match starten',exact:true})).toBeEnabled();
  await host.page.getByRole('button',{name:'Match starten',exact:true}).click();
  await expect(host.page).toHaveURL(/\/game$/);await expect(guest.page).toHaveURL(/\/game$/);
  await expect(host.page.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
  await expect(guest.page.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
  expect(new Set([await host.page.getByTestId('role-label').innerText(),await guest.page.getByTestId('role-label').innerText()])).toEqual(new Set(['HUNTER','HIDER']));
  await host.page.reload();await expect(host.page.locator('.connection')).toHaveText('VERBUNDEN');
  await expect(host.page.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
  expect(await host.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await host.page.screenshot({path:'test-results-edge/edge-mobile-match.png',fullPage:true});
  const hunter=(await host.page.getByTestId('role-label').innerText())==='HUNTER'?host:guest;
  const hider=hunter===host?guest:host;
  await hunter.page.getByLabel('Hider auswählen').selectOption(hider.id);
  await hunter.page.getByRole('button',{name:'Fang anfragen',exact:true}).click();
  await hider.page.getByRole('button',{name:'Fang bestätigen',exact:true}).click();
  await expect(host.page.getByRole('heading',{name:'DIE HUNTER GEWINNEN'})).toBeVisible();
  await expect(guest.page.getByRole('heading',{name:'DIE HUNTER GEWINNEN'})).toBeVisible();
 }finally{await host.context.close();await guest.context.close();}
});
test('friend requests and invitations appear through edge synchronization',async({browser})=>{
 const alice=await actor(browser,'EdgeAlice'),bob=await actor(browser,'EdgeBob');
 try{
  const result=await bob.page.request.get('http://127.0.0.1:3002/api/profile',{headers:{Authorization:`Bearer ${bob.token}`}}),profile=await result.json();
  await alice.page.goto('/friends');await bob.page.goto('/friends');
  const request=await alice.page.request.post('http://127.0.0.1:3002/api/friends/request',{headers:{Authorization:`Bearer ${alice.token}`},data:{code:profile.friend_code}});expect(request.status()).toBe(200);
  await expect(bob.page.getByRole('button',{name:'Annehmen',exact:true})).toBeVisible();
  await bob.page.getByRole('button',{name:'Annehmen',exact:true}).click();
  await expect(alice.page.locator('.friend-row').first()).toBeVisible();
 }finally{await alice.context.close();await bob.context.close();}
});

test('deleting a Last Survivor winner anonymizes the result for the remaining browser',async({browser})=>{
 const host=await actor(browser,'EraseHost'),caught=await actor(browser,'EraseCaught'),winner=await actor(browser,'EraseWinner');
 try{
  const response=await host.page.request.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${host.token}`},data:{event:'lobby:create',data:{settings:{...DEFAULT_SETTINGS,captureMethod:'confirmation',mode:'last_survivor',winCondition:'last_hider',randomRoles:false,preparationSeconds:0,headStartSeconds:0}}}});
  expect(response.status()).toBe(200);const lobby=(await response.json()).lobby;
  for(const p of [caught,winner]){const joined=await p.page.request.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${p.token}`},data:{event:'lobby:join',data:{code:lobby.code}}});expect(joined.status()).toBe(200);}
  await command(host.page,host.token,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],confirmed:true,name:'ISOLATED ERASURE TEST'}});
  await command(host.page,host.token,{type:'assign',playerId:host.id,role:'hunter',team:'A'});
  for(const p of [host,caught,winner])await command(p.page,p.token,{type:'ready',ready:true});await command(host.page,host.token,{type:'start'});
  const requested=await command(host.page,host.token,{type:'capture',targetId:caught.id});await command(caught.page,caught.token,{type:'confirm_capture',captureId:requested.captures[0].id,accept:true});
  await host.page.goto('/game');await expect(host.page.getByRole('heading',{name:'Die Jagd ist vorbei.'})).toBeVisible();
  await winner.page.goto('/settings');await winner.page.getByText('Konto dauerhaft löschen',{exact:true}).click();
  await winner.page.getByLabel('Zur Bestätigung LÖSCHEN eingeben').fill('LÖSCHEN');
  await winner.page.getByRole('button',{name:'Konto endgültig löschen',exact:true}).click();await expect(winner.page).toHaveURL(/\/$/);
  await expect(host.page.getByRole('heading',{name:'DER SIEGER HAT SEIN KONTO GELÖSCHT',exact:true})).toBeVisible();
  expect(await winner.page.evaluate(()=>sessionStorage.getItem('manhunt:test-token'))).toBeNull();
  await host.page.goto('/history');await host.page.getByRole('button',{name:/LAST SURVIVOR/}).click();
  await expect(host.page.locator('.history-detail')).toContainText('Der Sieger hat sein Konto gelöscht.');
  const history=await host.page.request.get('http://127.0.0.1:3002/api/history',{headers:{Authorization:`Bearer ${host.token}`}});
  expect(history.status()).toBe(200);const result=await history.text();expect(result).not.toContain(winner.id);expect(result).not.toContain('EraseWinner');
 }finally{for(const p of [host,caught,winner])await p.context.close();}
});

test('a real lobby QR image joins the private lobby through the browser scanner',async({browser})=>{
 const host=await actor(browser,'QrHost'),guest=await actor(browser,'QrGuest');
 try{
  await host.page.goto('/create');await host.page.getByRole('button',{name:'Lobby erstellen',exact:true}).click();await host.page.getByRole('button',{name:'Lobby-QR anzeigen'}).click();
  const image=host.page.getByRole('img',{name:'QR-Code zum Beitreten der Lobby'});await expect(image).toBeVisible();await image.evaluate(e=>e.scrollIntoView({block:'center'}));const buffer=await image.screenshot();
  await guest.page.goto('/join');await guest.page.getByRole('button',{name:'Lobby-QR scannen'}).click();await guest.page.getByLabel('QR-Bild auswählen').setInputFiles({name:'isolated-lobby-qr.png',mimeType:'image/png',buffer});
  await expect(guest.page).toHaveURL(/\/lobby$/);await expect(host.page.locator('.player-row')).toHaveCount(2);
  await host.page.screenshot({path:'test-results-edge/lobby-qr-mobile.png',fullPage:true});
 }finally{await host.context.close();await guest.context.close();}
});

test('a hunter scans the hiders actual rendered QR and captures without a request',async({browser})=>{
 const host=await actor(browser,'QrHunter'),guest=await actor(browser,'QrHider');
 try{
  const response=await host.page.request.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${host.token}`},data:{event:'lobby:create',data:{settings:{...DEFAULT_SETTINGS,randomRoles:false,preparationSeconds:0,headStartSeconds:0}}}});expect(response.status()).toBe(200);const l=(await response.json()).lobby;
  await guest.page.request.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${guest.token}`},data:{event:'lobby:join',data:{code:l.code}}});
  await command(host.page,host.token,{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],confirmed:true,name:'ISOLATED QR TEST'}});await command(host.page,host.token,{type:'assign',playerId:host.id,role:'hunter',team:'A'});
  for(const p of [host,guest])await command(p.page,p.token,{type:'ready',ready:true});await command(host.page,host.token,{type:'start'});
  await guest.page.goto('/game');await host.page.goto('/game');await guest.page.getByRole('button',{name:'Fang-QR anzeigen'}).click();
  const image=guest.page.getByRole('img',{name:'Dein persönlicher Fang-QR-Code'});await expect(image).toBeVisible();await image.evaluate(e=>e.scrollIntoView({block:'center'}));const buffer=await image.screenshot();
  await host.page.getByRole('button',{name:'Fang-QR scannen',exact:true}).click();await host.page.getByLabel('QR-Bild auswählen').setInputFiles({name:'isolated-capture-qr.png',mimeType:'image/png',buffer});
  await expect(host.page.getByRole('heading',{name:'DIE HUNTER GEWINNEN'})).toBeVisible();await expect(guest.page.getByRole('heading',{name:'DIE HUNTER GEWINNEN'})).toBeVisible();
  await expect(guest.page.getByRole('button',{name:'Fang bestätigen'})).toHaveCount(0);
 }finally{await host.context.close();await guest.context.close();}
});
