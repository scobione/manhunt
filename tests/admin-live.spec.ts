/** LIVE, read-only deployment checks. No synthetic identities or mailbox. */
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../admin/src/public-config.json',import.meta.url),'utf8'));
for(const width of [390,1440])test(`ADMIN-LIVE-01-${width}: independent portal, security headers and mobile PWA assets`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const response=await page.goto('/');expect(response?.status()).toBe(200);expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 await expect(page.getByRole('button',{name:'Als Administrator anmelden'})).toBeVisible();await expect(page.getByRole('link',{name:/Lobby|Spielmodi/})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const manifest=await(await page.request.get('/manifest.webmanifest')).json();expect(manifest.name).toBe('Manhunt Admin');expect(manifest.display).toBe('standalone');for(const icon of manifest.icons)expect((await page.request.get(icon.src)).ok()).toBe(true);
 expect(errors).toEqual([]);await page.screenshot({path:`test-results-admin-live/admin-${width}.png`,fullPage:true});
});
test('ADMIN-LIVE-02: production API denies unauthenticated or forged admin requests',async({request})=>{
 for(const headers of [{},{Authorization:'Bearer not-a-valid-session'}] as Record<string,string>[]){const r=await request.get(config.apiUrl+'/api/admin/users',{headers:{Origin:'https://manhunt-admin-scobione.vercel.app',...headers}});expect(r.status()).toBe(401);expect(r.headers()['cache-control']).toBe('no-store');const data=await r.json();expect(data).not.toHaveProperty('users');}
 const origin=await request.get(config.apiUrl+'/api/admin/users',{headers:{Origin:'https://unrelated.example.invalid'}});expect(origin.status()).toBe(403);
});
test('ADMIN-LIVE-03: service worker caches static offline assets only',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Als Administrator anmelden'})).toBeVisible();await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();
 const urls=await page.evaluate(async()=>{const names=await caches.keys();return(await Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)))).flat();});
 expect(urls.sort()).toEqual(['/icon-192.png','/icon-512.png','/icon.svg','/offline.html','/offline.css'].sort());
 await context.setOffline(true);try{await page.reload();await expect(page.getByText(/Internetverbindung/)).toBeVisible();await expect(page.getByLabel('Passwort',{exact:true})).toHaveCount(0);}finally{await context.setOffline(false);}
});
