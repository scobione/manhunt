/** ISOLATED AUTOMATED TESTS: synthetic accounts/GPS never reach Supabase. */
import {test,expect,type Browser,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS} from '../shared/types';
async function actor(browser:Browser,name:string){
 const id=randomUUID(),token=`test:${id}:${name}_${id.slice(0,4)}`;
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(token=>sessionStorage.setItem('manhunt:test-token',token),token);
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
  await command(host.page,host.token,{type:'settings',settings:{...DEFAULT_SETTINGS,preparationSeconds:0,headStartSeconds:0}});
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
