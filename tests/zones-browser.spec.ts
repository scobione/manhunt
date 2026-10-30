/** Explicit automated fixtures: local-only accounts and geometry, no live GPS. */
import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS,type Zone} from '../shared/types';
import {endZone} from '../shared/zones';
async function event(api:APIRequestContext,token:string,event:string,data:unknown={}){
 const response=await api.post('http://127.0.0.1:3002/api/events',{headers:{Authorization:`Bearer ${token}`},data:{event,data}});expect(response.status(),await response.text()).toBe(200);return(await response.json()).lobby;
}
const command=(api:APIRequestContext,token:string,command:unknown)=>event(api,token,'lobby:command',{command});
test('mobile octagon corners randomize and a selected end point survives save and import',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const original:Zone={feature:circle([13.405,52.52],.6),excluded:[],name:'AUTOMATED END ZONE',confirmed:false};
 await page.addInitScript(zone=>localStorage.setItem('manhunt:planned-zone',JSON.stringify(zone)),original);
 await page.goto('/zone');await page.getByRole('button',{name:'Achteck',exact:true}).click();await expect(page.locator('.mh-zone-handle')).toHaveCount(8);
 await page.getByRole('button',{name:'Lokal speichern',exact:true}).click();const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt.saved-zones.v1')!)[0].zone);
 await page.getByRole('button',{name:'Ecken zufällig ändern',exact:true}).click();await page.getByRole('button',{name:'Lokal speichern',exact:true}).click();
 const shuffled=await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt.saved-zones.v1')!)[0].zone);expect(shuffled.feature.geometry).not.toEqual(before.feature.geometry);expect(shuffled.feature.geometry.coordinates[0]).toHaveLength(9);
 await page.getByRole('button',{name:'Schrumpfpunkt neu wählen',exact:true}).click();const canvas=page.getByTestId('zone-map').locator('canvas'),box=await canvas.boundingBox();await canvas.click({position:{x:box!.width/2+22,y:box!.height/2+16}});
 await expect(page.getByTestId('end-zone-preview')).toContainText('Endzone:');await expect(page.getByTestId('shrink-target')).toBeVisible();await page.getByTestId('shrink-target').focus();await page.getByTestId('shrink-target').press('ArrowRight');
 await page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/}).check();await page.getByRole('button',{name:'Zone bestätigen & speichern'}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt:planned-zone')!));expect(saved.shrinkTarget).not.toEqual(before.shrinkTarget);expect(saved.randomCorners).toBe(true);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Zone als GeoJSON herunterladen'}).click();const file=await(await downloaded).path();await page.getByLabel('Zonendatei auswählen').setInputFiles(file!);
 await expect(page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/})).not.toBeChecked();await expect(page.getByTestId('end-zone-preview')).toBeVisible();await expect(page.getByRole('checkbox',{name:/Ecken in jeder Schrumpfphase/})).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.getByTestId('zone-map').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results-edge/end-zone-mobile.png',fullPage:true});
});
test('saved end zones synchronize and the authoritative final phase matches the map preview',async({page,request})=>{
 const host=randomUUID(),guest=randomUUID(),ht=`test:${host}:ZoneHost`,gt=`test:${guest}:ZoneGuest`;
 await page.addInitScript(token=>sessionStorage.setItem('manhunt:test-token',token),ht);
 const made=await event(request,ht,'lobby:create',{settings:{...DEFAULT_SETTINGS,mode:'apocalypse',preparationSeconds:0,headStartSeconds:0,randomRoles:false,phases:[{afterSeconds:0,scale:1},{afterSeconds:2,scale:.6},{afterSeconds:4,scale:.1}]}});await event(request,gt,'lobby:join',{code:made.code});
 const zone:Zone={feature:circle([13.405,52.52],.6,{steps:8}),excluded:[],name:'AUTOMATED SHARED END ZONE',confirmed:true,shrinkTarget:[13.406,52.521],randomCorners:true};
 await command(request,ht,{type:'zone',zone});await page.goto('/zone');await expect(page.getByTestId('end-zone-preview')).toBeVisible();
 await page.getByRole('button',{name:'Schrumpfpunkt neu wählen'}).click();const canvas=page.getByTestId('zone-map').locator('canvas'),box=await canvas.boundingBox();await canvas.click({position:{x:box!.width/2+25,y:box!.height/2}});await page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/}).check();await page.getByRole('button',{name:'Zone bestätigen & zum Warteraum'}).click();
 const shared=await event(request,gt,'lobby:sync');expect(shared.zone.shrinkTarget).not.toEqual(zone.shrinkTarget);expect(shared.zone.randomCorners).toBe(true);
 await command(request,ht,{type:'assign',playerId:host,role:'hunter',team:'A'});for(const token of [ht,gt]){await command(request,token,{type:'location_check',location:{longitude:13.405,latitude:52.52,accuracy:3,timestamp:Date.now()}});await command(request,token,{type:'ready',ready:true});}await command(request,ht,{type:'start'});await page.goto('/game');
 await expect(page.locator('.mh-map-legend')).toContainText('ENDZONE');await expect.poll(async()=>JSON.stringify((await event(request,ht,'lobby:sync')).activeZone)).toBe(JSON.stringify(endZone(shared.zone,.1)));
 await page.reload();await expect(page.locator('.mh-map-legend')).toContainText('ENDZONE');expect((await event(request,gt,'lobby:sync')).activeZone).toEqual(endZone(shared.zone,.1));
 await page.goto('/zone');await expect(page.getByRole('button',{name:'Ecken zufällig ändern'})).toBeDisabled();await expect(page.getByRole('button',{name:'Schrumpfpunkt neu wählen'})).toBeDisabled();
});

test('ZONE-01 ZONE-02 ZONE-03 ZONE-04 ZONE-05: create, edit, move, disable and delete exclusions on the map',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 const original:Zone={feature:circle([13.405,52.52],.6),excluded:[],name:'AUTOMATED EXCLUSIONS',confirmed:false};
 await page.addInitScript(zone=>{if(!localStorage.getItem('manhunt:planned-zone'))localStorage.setItem('manhunt:planned-zone',JSON.stringify(zone));},original);await page.goto('/zone');
 const canvas=page.getByTestId('zone-map').locator('canvas');await expect(canvas).toBeVisible();
 for(const [index,shape] of ['circle','rectangle','polygon'].entries()){
  await page.getByLabel('Form des Sperrbereichs').selectOption(shape);await page.getByRole('button',{name:'Sperrbereich zeichnen',exact:true}).click();await canvas.scrollIntoViewIfNeeded();const b=(await canvas.boundingBox())!,cx=b.width/2,cy=b.height/2;
  const x=cx+(index===1?45:-65),y=cy+(index===2?60:-55);await canvas.click({position:{x,y}});await canvas.click({position:{x:x+18,y:y+15}});if(shape==='polygon')await canvas.click({position:{x:x-10,y:y+24}});await page.getByRole('button',{name:'Sperrzone übernehmen',exact:true}).click();await expect(page.getByRole('button',{name:`Bereich ${index+1} bearbeiten`,exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'Lokal speichern',exact:true}).click();const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt.saved-zones.v1')!)[0].zone);
 expect(before.excluded[0].geometry.coordinates[0].length).toBeGreaterThan(8);expect(before.excluded[1].geometry.coordinates[0]).toHaveLength(5);expect(before.excluded[2].geometry.coordinates[0]).toHaveLength(4);
 await page.getByRole('button',{name:'Bereich 2 bearbeiten',exact:true}).click();const vertex=page.getByRole('button',{name:'Sperrbereich Eckpunkt 1, mit Pfeiltasten verschieben',exact:true});await vertex.focus();await vertex.press('ArrowRight');
 const center=page.getByRole('button',{name:'Sperrbereich 2 verschieben',exact:true});await center.scrollIntoViewIfNeeded();const b=(await center.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+12,b.y+b.height/2+8,{steps:8});await page.mouse.up();
 await page.getByLabel('Sperrbereich 1 aktiv',{exact:true}).uncheck();await page.getByRole('button',{name:'Lokal speichern',exact:true}).click();const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('manhunt.saved-zones.v1')!)[0].zone);expect(after.disabledExcluded).toEqual([0]);expect(after.excluded[1].geometry).not.toEqual(before.excluded[1].geometry);
 await page.getByRole('button',{name:'Sperrbereich 3 entfernen',exact:true}).click();await expect(page.getByRole('button',{name:'Bereich 3 bearbeiten',exact:true})).toHaveCount(0);await page.getByRole('checkbox',{name:/Ich habe das Gebiet geprüft/}).check();await page.getByRole('button',{name:'Zone bestätigen & speichern',exact:true}).click();await page.reload();await expect(page.getByLabel('Sperrbereich 1 aktiv',{exact:true})).not.toBeChecked();await expect(page.getByRole('button',{name:'Bereich 2 bearbeiten',exact:true})).toBeVisible();
});
test('ZONE-06 ZONE-07: editor accepts thirty exclusions and prevents a thirty-first',async({page})=>{
 const z:Zone={feature:circle([13.405,52.52],1),excluded:Array.from({length:30},(_,i)=>circle([13.399+(i%6)*.0006,52.522+Math.floor(i/6)*.0004],.006)),confirmed:false,name:'AUTOMATED THIRTY ZONES'};
 await page.addInitScript(zone=>localStorage.setItem('manhunt:planned-zone',JSON.stringify(zone)),z);await page.goto('/zone');await expect(page.getByRole('button',{name:'Bereich 30 bearbeiten',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sperrbereich zeichnen',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Sperrbereich 30 entfernen',exact:true}).click();await expect(page.getByRole('button',{name:'Sperrbereich zeichnen',exact:true})).toBeEnabled();
});
