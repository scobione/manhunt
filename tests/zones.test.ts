/** Synthetic geometry in isolated automated tests; never live GPS. */
import {describe,it,expect} from 'vitest';
import {area,booleanPointInPolygon,circle,difference,featureCollection,kinks,point,polygon} from '@turf/turf';
import {endZone,isOctagon,randomOctagon,shrinkPlan,validShrinkTarget} from '../shared/zones';
import {validateZone} from '../server/validation';
import {GameEngine} from '../server/engine';
import type {Zone,Profile} from '../shared/types';
const target:[number,number]=[13.402,52.501];
const zone=():Zone=>({name:'ISOLATED ZONE TEST',feature:circle([13.4,52.5],.6,{steps:8}),excluded:[],confirmed:true,shrinkTarget:target,randomCorners:true});
const outsideArea=(a:any,b:any)=>{const diff=difference(featureCollection([a,b]));return diff?area(diff):0;};
const seeded=(seed=17)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
describe('random octagons and preserved end zones',()=>{
 it('produces eight distinct movable corners, closed rings and no crossed edges',()=>{const rng=seeded();const all=[];for(let i=0;i<30;i++){const shape=randomOctagon([13.4,52.5],600,18,rng);expect(isOctagon(shape)).toBe(true);expect(kinks(shape).features).toHaveLength(0);expect(new Set(shape.geometry.coordinates[0].slice(0,-1).map(p=>p.join(','))).size).toBe(8);expect(shape.geometry.coordinates[0][0]).toEqual(shape.geometry.coordinates[0].at(-1));all.push(JSON.stringify(shape));}expect(new Set(all).size).toBe(30);});
 it('rejects points outside, on the boundary, or inside excluded areas and accepts safe points',()=>{const z=zone();expect(validShrinkTarget(z,target)).toBe(true);for(const p of [[13.5,52.5],z.feature.geometry.coordinates[0][0],[NaN,52.5],[181,20],null])expect(validShrinkTarget(z,p)).toBe(false);z.excluded=[circle(target,.02)];expect(()=>validateZone(z)).toThrow(/Schrumpfpunkt/);});
 it('moves toward the chosen point and keeps every phase nested and the final preview exact',()=>{const z=zone(),scales=[1,.75,.5,.25,.1];for(let n=1;n<=12;n++){const plan=shrinkPlan(z,scales,seeded(n)),final=endZone(z,.1);expect(plan.at(-1)).toEqual(final);expect(booleanPointInPolygon(point(target),final,{ignoreBoundary:true})).toBe(true);for(let i=1;i<plan.length;i++){expect(outsideArea(plan[i],plan[i-1])).toBeLessThan(.01);expect(outsideArea(final,plan[i])).toBeLessThan(.01);expect(area(plan[i])).toBeLessThanOrEqual(area(plan[i-1])+.01);}expect(outsideArea(final,z.feature)).toBeLessThan(.01);}});
 it('changes intermediate corners with the server draw, never the selected final zone',()=>{const z=zone(),a=shrinkPlan(z,[1,.6,.1],seeded(1)),b=shrinkPlan(z,[1,.6,.1],seeded(2));expect(a[1]).not.toEqual(b[1]);expect(a[2]).toEqual(b[2]);expect(z.feature.geometry.coordinates[0]).toHaveLength(9);});
 it('clips concave zones and exclusions while retaining the selected target component',()=>{const z:Zone={name:'Concave safe zone',confirmed:true,feature:polygon([[[13.39,52.49],[13.41,52.49],[13.41,52.50],[13.40,52.50],[13.40,52.51],[13.39,52.51],[13.39,52.49]]]),excluded:[circle([13.397,52.494],.02)],shrinkTarget:[13.398,52.495]};const plan=shrinkPlan(z,[1,.7,.4,.1],seeded());for(let i=1;i<plan.length;i++){expect(outsideArea(plan[i],plan[i-1])).toBeLessThan(.01);expect(outsideArea(plan[i],z.feature)).toBeLessThan(.01);expect(booleanPointInPolygon(point([13.397,52.494]),plan[i])).toBe(false);expect(booleanPointInPolygon(point(z.shrinkTarget!),plan[i])).toBe(true);}});
 it('rejects random shrinking on other shapes',()=>{const z=zone();z.feature=circle([13.4,52.5],.6);expect(()=>validateZone(z)).toThrow(/Achteck/);});
 it('saves authoritative phase draws across reconnects, applies skipped phases and hides private plans',()=>{
  let now=1800000000000;const engine=new GameEngine({now:()=>now});
  const profiles:Profile[]=[1,2].map(n=>({id:`test${n}`,username:`Test${n}`,avatar_url:null,friend_code:`TEST${n}`,show_online:false}));
  const l=engine.create(profiles[0],{mode:'apocalypse',preparationSeconds:0,headStartSeconds:0,durationSeconds:600,randomRoles:false,phases:[{afterSeconds:0,scale:1},{afterSeconds:10,scale:.75},{afterSeconds:20,scale:.5},{afterSeconds:30,scale:.1}]});engine.join(l.code,profiles[1]);engine.command(l.id,'test1',{type:'zone',zone:zone()});engine.command(l.id,'test1',{type:'assign',playerId:'test1',role:'hunter',team:'A'});for(const p of profiles)engine.command(l.id,p.id,{type:'ready',ready:true});engine.command(l.id,'test1',{type:'start'});
  expect(engine.view(l.id,'test1')).not.toHaveProperty('_engine');expect(()=>engine.command(l.id,'test1',{type:'zone',zone:zone()})).toThrow(/Warteraum/);
  const snapshot=engine.snapshot();now+=25000;const restored=new GameEngine({now:()=>now,initial:snapshot});restored.tick();engine.tick();expect(restored.lobbies.get(l.id)?.activeZone).toEqual(l.activeZone);expect(l.status).toBe('active');
  now+=5000;restored.tick();expect(restored.lobbies.get(l.id)?.activeZone).toEqual(endZone(zone(),.1));expect(restored.lobbies.get(l.id)?.endsAt).toBe(l.endsAt);
 });
});
