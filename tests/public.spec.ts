import {test,expect} from '@playwright/test';
// No synthetic users, no GPS simulation, no authentication bypass in these production checks.
test('production landing, all modes and privacy pages render without browser errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Raus aus dem Alltag.',exact:true})).toBeVisible();
 await expect(page.getByText('Die Spielzentrale wird eingerichtet.')).toBeVisible();
 await page.screenshot({path:'test-results/public-desktop.png',fullPage:true});
 await page.goto('/modes');await expect(page.locator('.all-modes article')).toHaveCount(8);
 await page.goto('/login');await expect(page.getByTestId('test-login')).toHaveCount(0);
 await page.getByRole('button',{name:'Mit Google fortfahren'}).click();await expect(page.getByRole('status')).toContainText('noch nicht eingerichtet');
 await page.goto('/privacy');await expect(page.getByRole('heading',{name:'Dein Standort gehört dir.'})).toBeVisible();
 await page.goto('/safety');await expect(page.getByRole('heading',{name:'Gutes Spiel. Sicher draußen.'})).toBeVisible();
 expect(errors).toEqual([]);
});
test('public zone editor creates, edits, confirms and exports actual GeoJSON',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const diagnostics=new Set<string>();page.on('console',message=>{if(message.type()==='error')diagnostics.add(message.text());});
 await page.goto('/zone');await expect(page.getByTestId('zone-map')).toBeVisible();
 const canvas=page.getByTestId('zone-map').locator('canvas');await expect(canvas).toBeVisible();
 await canvas.click({position:{x:260,y:220}});
 await expect(page.getByLabel('Zonenname',{exact:true})).toBeEnabled();await page.getByLabel('Zonenname',{exact:true}).fill('Browser-Prüfzone');
 await page.getByRole('button',{name:'Viereck',exact:true}).click();await expect(page.locator('.mh-zone-handle')).toHaveCount(4);
 await page.getByRole('button',{name:'Achteck',exact:true}).click();await expect(page.locator('.mh-zone-handle')).toHaveCount(8);
 await page.getByRole('button',{name:'Kreis',exact:true}).click();await page.getByLabel('Radius',{exact:true}).fill('400');
 await page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/}).check();
 await page.getByRole('button',{name:'Zone bestätigen & übernehmen'}).click();
 await expect(page.getByRole('status').filter({hasText:'Zone auf diesem Gerät gespeichert.'})).toBeVisible();
 await page.getByRole('button',{name:'Lokal speichern',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Zone als GeoJSON herunterladen'}).click();expect((await download).suggestedFilename()).toBe('manhunt-zone.geojson');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt:planned-zone')!).feature.geometry.type)).toBe('Polygon');
 await page.screenshot({path:'test-results/public-zone-editor.png',fullPage:true});expect(errors).toEqual([]);expect([...diagnostics].some(x=>x.includes('Worker failed to load'))).toBe(false);if([...diagnostics].some(x=>x.includes('ERR_CERT_AUTHORITY_INVALID')))console.log('External tile HTTPS remains unverified: environment CA is not trusted by Chromium.');
});
test('mobile production layout and PWA metadata work without test login',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Raus aus dem Alltag.'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
 await page.getByRole('button',{name:'Menü öffnen'}).click();await expect(page.getByRole('link',{name:'Manhunt Übersicht'})).toBeVisible();
 await page.goto('/settings');await expect(page.getByRole('heading',{name:'MANHUNT installieren'})).toBeVisible();
 await page.getByRole('checkbox',{name:/Animationen reduzieren/}).check();expect(await page.locator('html').getAttribute('data-reduced-motion')).toBe('true');
 const manifest=await page.request.get('/manifest.webmanifest');expect(manifest.ok()).toBe(true);expect((await manifest.json()).display).toBe('standalone');
 await page.goto('/login');await expect(page.getByTestId('test-login')).toHaveCount(0);
 await page.screenshot({path:'test-results/public-mobile.png',fullPage:true});
});
