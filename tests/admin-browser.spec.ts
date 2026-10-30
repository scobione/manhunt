import {circle} from '@turf/turf';
/** Multi-origin browser tests; simulated Auth/mail delivery exists ONLY on localhost. */
import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const GAME='http://127.0.0.1:5176',API='http://127.0.0.1:3003';
async function login(page:Page,email:string,password:string,admin=true){await page.goto(admin?'/':GAME+'/login');await page.getByLabel('E-Mail-Adresse',{exact:true}).fill(email);await page.getByLabel('Passwort',{exact:true}).fill(password);await page.getByRole('button',{name:admin?'Als Administrator anmelden':'Mit E-Mail anmelden',exact:true}).click();}
test('ADMIN-01 ADMIN-02 ADMIN-03 ADMIN-16: separate mobile portal denies player access and supplies its own PWA',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,'player@isolated.invalid','Player-Test-Password1');await expect(page.getByRole('heading',{name:'Kein Adminzugang.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Deine Spieler.'})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.name).toBe('Manhunt Admin');expect(manifest.display).toBe('standalone');for(const icon of manifest.icons)expect((await page.request.get(icon.src)).ok()).toBe(true);
 const sw=await(await page.request.get('/sw.js')).text();expect(sw).toContain("const STATIC=['/offline.html','/offline.css','/icon.svg','/icon-192.png','/icon-512.png']");
});
test('ADMIN-04 ADMIN-06 ADMIN-07 SETUP-08 SETUP-09 SETUP-10 SETUP-11 ADMIN-14 ADMIN-15: admin provisions a real test account which completes mandatory setup in a separate game browser',async({browser,request})=>{
 const admin=await browser.newContext({viewport:{width:390,height:844}}),player=await browser.newContext({viewport:{width:390,height:844}});const a=await admin.newPage(),p=await player.newPage();
 try{
  await login(a,'admin@isolated.invalid','Admin-Test-Password1');await expect(a.getByRole('heading',{name:'Alles bereit für die nächste Runde.'})).toBeVisible();
  await a.getByRole('link',{name:'Account erstellen',exact:true}).first().click();const email=`manual-${randomUUID()}@example.invalid`;
  await a.getByLabel('E-Mail-Adresse des Benutzers',{exact:true}).fill(email);await a.getByRole('button',{name:'Account erstellen',exact:true}).click();await expect(a.getByRole('heading',{name:'Account erstellt.'})).toBeVisible();
  await expect(a.getByLabel('Vorläufiges Passwort',{exact:true})).toHaveAttribute('type','password');await a.getByRole('button',{name:'Vorläufiges Passwort anzeigen',exact:true}).click();await expect(a.getByLabel('Vorläufiges Passwort',{exact:true})).toHaveAttribute('type','text');
  const temporary=await a.getByLabel('Vorläufiges Passwort',{exact:true}).inputValue();expect(temporary.length).toBeGreaterThanOrEqual(24);await a.getByRole('button',{name:'Zugangsdaten ausblenden'}).click();await a.reload();await expect(a.getByLabel('Vorläufiges Passwort',{exact:true})).toHaveCount(0);
  await login(p,email,temporary,false);await expect(p.getByRole('heading',{name:'Dein eigenes Passwort'})).toBeVisible();await p.goto(GAME+'/game');await expect(p.getByRole('heading',{name:'Dein eigenes Passwort'})).toBeVisible();
  await p.getByLabel('Neues Passwort',{exact:true}).fill('My-New-Password-123');await p.getByLabel('Passwort bestätigen',{exact:true}).fill('My-New-Password-123');await p.getByRole('button',{name:'Speichern & weiter',exact:true}).click();await expect(p.getByRole('heading',{name:'Benutzernamen wählen'})).toBeVisible();
  const old=await request.post(API+'/auth/v1/token?grant_type=password',{data:{email,password:temporary}});expect(old.status()).toBe(400);
  const name='Crew.'+randomUUID().slice(0,8);await p.getByRole('textbox',{name:/Benutzername/}).fill(name);await expect(p.getByText('Benutzername ist verfügbar.',{exact:true})).toBeVisible();await p.getByRole('button',{name:'Speichern & weiter',exact:true}).click();
  await expect(p.getByRole('heading',{name:'Bereit für deine erste Runde'})).toBeVisible();await expect(p.getByRole('checkbox')).toHaveCount(0);await expect(p.getByRole('navigation',{name:'Rechtliche Informationen'})).toBeVisible();await p.getByRole('button',{name:'Einrichtung abschließen'}).click();await expect(p.getByRole('heading',{name:'Dein eigenes Passwort'})).toHaveCount(0);
  await p.goto(GAME+'/profile');await expect(p.getByRole('heading',{name,exact:true})).toBeVisible();await p.reload();await expect(p.getByRole('heading',{name,exact:true})).toBeVisible();
  await a.goto('/#users');await a.getByRole('textbox',{name:'Benutzer suchen'}).fill(email);await expect(a.locator('.user-row')).toHaveCount(1);await a.locator('.user-row').click();await expect(a.getByText('Nicht verifiziert · administrativ freigegeben',{exact:true})).toBeVisible();
  await a.getByRole('button',{name:'Account deaktivieren',exact:true}).click();await expect(a.getByRole('status')).toHaveText('Account deaktiviert.');await p.reload();await expect(p.getByRole('heading',{name:'Dieses Konto ist deaktiviert.'})).toBeVisible();
  await a.getByRole('button',{name:'Account reaktivieren',exact:true}).click();await p.reload();await expect(p.getByRole('heading',{name,exact:true})).toBeVisible();
  expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:'test-results-admin/admin-mobile.png',fullPage:true});
 }finally{await admin.close();await player.close();}
});
test('ADMIN-05: additional code is required after reload and wrong codes fail',async({page})=>{
 await login(page,'code-admin@isolated.invalid','Admin-Test-Password1');await expect(page.getByRole('heading',{name:'Alles bereit für die nächste Runde.'})).toBeVisible();await page.goto('/#settings');await page.getByLabel('Neuer Zugangscode',{exact:true}).fill('Isolated-Extra-Code-123');await page.getByLabel('Zugangscode bestätigen',{exact:true}).fill('Isolated-Extra-Code-123');await page.getByRole('button',{name:'Zugangscode speichern'}).click();await expect(page.getByLabel('Zusätzlicher Zugangscode',{exact:true})).toBeVisible();
 await page.getByLabel('Zusätzlicher Zugangscode',{exact:true}).fill('Incorrect-Extra-Code');await page.getByRole('button',{name:'Portal entsperren'}).click();await expect(page.getByRole('alert')).toContainText('stimmt nicht');await page.getByLabel('Zusätzlicher Zugangscode',{exact:true}).fill('Isolated-Extra-Code-123');await page.getByRole('button',{name:'Portal entsperren'}).click();await expect(page.getByRole('heading',{name:'Zugang unter deiner Kontrolle.'})).toBeVisible();
 await page.reload();await expect(page.getByLabel('Zusätzlicher Zugangscode',{exact:true})).toBeVisible();await page.getByLabel('Zusätzlicher Zugangscode',{exact:true}).fill('Isolated-Extra-Code-123');await page.getByRole('button',{name:'Portal entsperren'}).click();await expect(page.getByRole('heading',{name:'Zugang unter deiner Kontrolle.'})).toBeVisible();
 await page.getByRole('button',{name:'Zusätzlichen Code deaktivieren'}).click();await expect(page.getByRole('heading',{name:'Zugang unter deiner Kontrolle.'})).toBeVisible();
});
test('AUTH-CODE-12 AUTH-CODE-13: signup reserves a name, rejects incorrect, expired and reused codes (simulated mailbox)',async({page,request})=>{
 const email=`registration-${randomUUID()}@example.invalid`;await page.goto(GAME+'/login');await page.getByRole('button',{name:'Registrieren',exact:true}).click();await page.getByLabel('E-Mail-Adresse',{exact:true}).fill(email);await page.getByRole('textbox',{name:/Benutzername/}).fill('New.'+randomUUID().slice(0,8));await page.getByLabel('Passwort',{exact:true}).fill('My-Registration-Password-123');await page.getByLabel('Passwort wiederholen',{exact:true}).fill('My-Registration-Password-123');await page.getByRole('button',{name:'Konto erstellen',exact:true}).click();
 const code=page.getByLabel('Bestätigungscode',{exact:true});await expect(code).toHaveAttribute('maxlength','6');await code.fill('000000');await page.getByRole('button',{name:'E-Mail bestätigen'}).click();await expect(page.getByRole('alert')).toContainText('ungültig oder abgelaufen');
 let mail=await(await request.get(API+'/__test/mailbox',{params:{email}})).json();await request.post(API+'/__test/expire-otp',{data:{email}});await code.fill(mail.code);await page.getByRole('button',{name:'E-Mail bestätigen'}).click();await expect(page.getByRole('alert')).toContainText('ungültig oder abgelaufen');
 await page.clock.install();await page.clock.fastForward(61000);await page.getByRole('button',{name:'Bestätigung erneut senden',exact:true}).click();mail=await(await request.get(API+'/__test/mailbox',{params:{email}})).json();await code.fill(mail.code);await page.getByRole('button',{name:'E-Mail bestätigen'}).click();await expect(code).toHaveCount(0);
 expect((await request.post(API+'/auth/v1/verify',{data:{email,token:mail.code,type:'email'}})).status()).toBe(403);
});

test('MRESET-E2E: prescribed password ends old sessions and requires exactly one password change while preserving the profile',async({browser,request})=>{
 const admin=await browser.newContext(),player=await browser.newContext({viewport:{width:390,height:844}});const a=await admin.newPage(),p=await player.newPage();
 try{
  const email='player@isolated.invalid';await login(p,email,'Player-Test-Password1',false);await p.goto(GAME+'/profile');await expect(p.getByRole('heading',{name:'PlayerFixture',exact:true})).toBeVisible();
  const oldSession=await(await request.post(API+'/auth/v1/token?grant_type=password',{data:{email,password:'Player-Test-Password1'}})).json();
  await login(a,'admin@isolated.invalid','Admin-Test-Password1');await expect(a.getByRole('heading',{name:'Alles bereit für die nächste Runde.'})).toBeVisible();await a.goto('/#users');await a.getByRole('textbox',{name:'Benutzer suchen'}).fill(email);await expect(a.locator('.user-row')).toHaveCount(1);await a.locator('.user-row').click();
  await a.getByRole('button',{name:'Vorläufiges Passwort festlegen',exact:true}).click();await a.getByLabel('Vorläufiges Passwort',{exact:true}).fill('Prescribed-Event-Password123');await a.getByLabel('Vorläufiges Passwort bestätigen',{exact:true}).fill('Prescribed-Event-Password123');await a.getByRole('button',{name:'Vorläufiges Passwort speichern',exact:true}).click();await expect(a.getByRole('status')).toContainText('Alle Sitzungen wurden beendet');await expect(a.getByLabel('Vorläufiges Passwort',{exact:true})).toHaveCount(0);
  expect((await request.get(API+'/api/profile',{headers:{Authorization:'Bearer '+oldSession.access_token}})).status()).toBe(401);expect((await request.post(API+'/auth/v1/token?grant_type=password',{data:{email,password:'Player-Test-Password1'}})).status()).toBe(400);
  await player.clearCookies();await p.goto(GAME+'/login');await p.evaluate(()=>localStorage.clear());await login(p,email,'Prescribed-Event-Password123',false);await expect(p.getByRole('heading',{name:'Neues Passwort erforderlich.'})).toBeVisible();await p.goto(GAME+'/game');await expect(p.getByRole('heading',{name:'Neues Passwort erforderlich.'})).toBeVisible();
  await p.getByLabel('Neues Passwort',{exact:true}).fill('Prescribed-Event-Password123');await p.getByLabel('Passwort bestätigen',{exact:true}).fill('Prescribed-Event-Password123');await p.getByRole('button',{name:'Neues Passwort speichern',exact:true}).click();await expect(p.getByRole('alert')).toContainText('vorläufige Passwort');
  await p.getByLabel('Neues Passwort',{exact:true}).fill('Own-Private-Password-123');await p.getByLabel('Passwort bestätigen',{exact:true}).fill('Own-Private-Password-123');await p.getByRole('button',{name:'Neues Passwort speichern',exact:true}).click();await expect(p.getByRole('heading',{name:'Neues Passwort erforderlich.'})).toHaveCount(0);await p.goto(GAME+'/profile');await expect(p.getByRole('heading',{name:'PlayerFixture',exact:true})).toBeVisible();await expect(p.getByRole('heading',{name:'Benutzernamen wählen'})).toHaveCount(0);
  expect((await request.post(API+'/auth/v1/token?grant_type=password',{data:{email,password:'Prescribed-Event-Password123'}})).status()).toBe(400);
  await p.reload();await expect(p.getByRole('heading',{name:'PlayerFixture',exact:true})).toBeVisible();await expect(p.getByText('Deine Sitzung ist abgelaufen.',{exact:false})).toHaveCount(0);
 }finally{await admin.close();await player.close();}
});

test('TRAFFIC-E2E: two mobile players report real browser bytes, switch networks and appear in the admin match detail',async({browser,request})=>{
 const host=await browser.newContext({viewport:{width:390,height:844}}),guest=await browser.newContext({viewport:{width:390,height:844}}),admin=await browser.newContext({viewport:{width:390,height:844}});const h=await host.newPage(),g=await guest.newPage(),a=await admin.newPage();
 // Connection classification is simulated ONLY in this explicitly isolated test.
 await host.addInitScript(()=>{const connection=Object.assign(new EventTarget(),{type:'wifi'});Object.defineProperty(navigator,'connection',{value:connection,configurable:true});});
 try{
  async function register(name:string){const email=name+'@example.invalid',password='Traffic-Test-Password123';const r=await request.post(API+'/auth/v1/signup',{data:{email,password,data:{username:name}}});expect(r.ok()).toBe(true);const mail=await(await request.get(API+'/__test/mailbox',{params:{email}})).json();const session=await(await request.post(API+'/auth/v1/verify',{data:{email,token:mail.code,type:'email'}})).json();return{email,password,token:session.access_token};}
  const x=await register('TrafficHost'+randomUUID().slice(0,5)),y=await register('TrafficGuest'+randomUUID().slice(0,5));
  const event=async(token:string,event:string,data:unknown)=>{const r=await request.post(API+'/api/events',{headers:{Authorization:'Bearer '+token},data:{event,data}});expect(r.ok(),await r.text()).toBe(true);return(await r.json()).lobby;};
  const lobby=await event(x.token,'lobby:create',{settings:{preparationSeconds:0,headStartSeconds:0}});await event(y.token,'lobby:join',{code:lobby.code});await event(x.token,'lobby:command',{command:{type:'zone',zone:{feature:circle([13.405,52.52],.6),excluded:[],confirmed:true,name:'ISOLATED TRAFFIC TEST'}}});for(const token of [x.token,y.token]){await event(token,'lobby:command',{command:{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}}});await event(token,'lobby:command',{command:{type:'ready',ready:true}});}await event(x.token,'lobby:command',{command:{type:'start'}});
  await login(h,x.email,x.password,false);await login(g,y.email,y.password,false);
  const reports:string[]=[];for(const p of [h,g])p.on('request',r=>{if(r.url().endsWith('/api/traffic'))reports.push(p===h?'host':'guest');});
  for(const p of [h,g]){await p.goto(GAME+'/game');await p.waitForResponse(r=>r.url().endsWith('/api/sync'));await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));}
  expect(reports).toEqual([]);
  for(const p of [h,g]){await p.goto(GAME+'/settings');const consent=p.getByRole('checkbox',{name:'Verbrauchsdiagnose erlauben',exact:true});await expect(consent).not.toBeChecked();await consent.check();await expect(consent).toBeChecked();}
  await h.goto(GAME+'/game');await g.goto(GAME+'/game');await expect(h.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();await expect(g.getByRole('heading',{name:'Die Jagd läuft.'})).toBeVisible();
  for(const p of [h,g]){await p.waitForResponse(r=>r.url().endsWith('/api/sync'));const report=p.waitForResponse(r=>r.url().endsWith('/api/traffic')&&r.request().method()==='POST');await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));expect((await report).ok()).toBe(true);}
  await h.evaluate(()=>{const connection=(navigator as any).connection;connection.type='cellular';connection.dispatchEvent(new Event('change'));});for(let i=0;i<2;i++)await(await h.waitForResponse(r=>r.url().endsWith('/api/sync'))).finished();const reported=h.waitForResponse(r=>r.url().endsWith('/api/traffic')&&r.request().method()==='POST');await h.evaluate(()=>window.dispatchEvent(new Event('pagehide')));expect((await reported).ok()).toBe(true);
  for(const token of [x.token,y.token])expect((await request.get(API+'/api/traffic?matchId='+lobby.id,{headers:{Authorization:'Bearer '+token}})).status()).toBe(403);
  for(const p of [h,g]){await expect(p.getByText('Datenverbrauch dieses Matches',{exact:true})).toHaveCount(0);await expect(p.locator('.traffic-player')).toHaveCount(0);}
  const detail=a.waitForResponse(r=>r.url().includes('/api/admin/traffic?matchId='));
  await login(a,'admin@isolated.invalid','Admin-Test-Password1');await expect(a.getByRole('heading',{name:'Alles bereit für die nächste Runde.'})).toBeVisible();await a.getByRole('link',{name:'Datenverbrauch',exact:true}).click();await a.getByRole('link').filter({hasText:'Match '+lobby.code}).click();await expect(a.locator('.traffic-player')).toHaveCount(2);await expect(a.locator('.traffic-summary')).toContainText('2 von 2');expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:'test-results-admin/traffic-mobile.png',fullPage:true});
  const data=await(await detail).json();expect(data.match.reporters).toBe(2);expect(data.match.bytes).toBeGreaterThan(0);for(const network of ['wifi','cellular'])expect(data.rows.some((r:any)=>r.network===network&&r.down+r.estimated>0)).toBe(true);
  await h.goto(GAME+'/settings');await h.getByRole('checkbox',{name:'Verbrauchsdiagnose erlauben',exact:true}).uncheck();const before=reports.filter(x=>x==='host').length;
  await h.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await h.waitForResponse(r=>r.url().endsWith('/api/sync'));expect(reports.filter(x=>x==='host').length).toBe(before);
  await h.reload();await expect(h.getByRole('checkbox',{name:'Verbrauchsdiagnose erlauben',exact:true})).not.toBeChecked();await h.goto(GAME+'/game');
  await event(x.token,'lobby:command',{command:{type:'end'}});await expect(h.getByRole('heading',{name:'Die Jagd ist vorbei.'})).toBeVisible();
 }finally{await host.close();await guest.close();await admin.close();}
});

test('RESET-REG-04 saved password survives failed automatic reauthentication without restarting setup',async({browser,request})=>{
 const admin=await browser.newContext(),player=await browser.newContext();const a=await admin.newPage(),p=await player.newPage();
 try{
  await login(a,'admin@isolated.invalid','Admin-Test-Password1');await a.getByRole('link',{name:'Account erstellen',exact:true}).first().click();
  const email=`retry-${randomUUID()}@example.invalid`;await a.getByLabel('E-Mail-Adresse des Benutzers',{exact:true}).fill(email);await a.getByRole('button',{name:'Account erstellen',exact:true}).click();await expect(a.getByRole('heading',{name:'Account erstellt.'})).toBeVisible();
  const temporary=await a.getByLabel('Vorläufiges Passwort',{exact:true}).inputValue();await login(p,email,temporary,false);await expect(p.getByRole('heading',{name:'Dein eigenes Passwort'})).toBeVisible();
  let blocked=0;await p.route(API+'/auth/v1/token?grant_type=password',route=>{if(route.request().postDataJSON().password==='Retry-New-Password123'&&blocked++===0)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({msg:'Isolated simulated reauthentication outage'})});return route.continue();});
  await p.getByLabel('Neues Passwort',{exact:true}).fill('Retry-New-Password123');await p.getByLabel('Passwort bestätigen',{exact:true}).fill('Retry-New-Password123');await p.getByRole('button',{name:'Speichern & weiter',exact:true}).click();
  await expect(p.getByText('Dein neues Passwort ist gespeichert. Bitte melde dich damit erneut an.',{exact:true}).first()).toBeVisible();
  await login(p,email,'Retry-New-Password123',false);await expect(p.getByRole('heading',{name:'Benutzernamen wählen'})).toBeVisible();await expect(p.getByRole('heading',{name:'Dein eigenes Passwort'})).toHaveCount(0);
  expect((await request.post(API+'/auth/v1/token?grant_type=password',{data:{email,password:temporary}})).status()).toBe(400);
 }finally{await admin.close();await player.close();}
});
