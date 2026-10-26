import {activeExclusions} from './rules.js';
import {area, booleanPointInPolygon, centroid, difference, featureCollection, intersect, kinks, point, polygon, rhumbBearing, rhumbDestination, rhumbDistance, transformScale, union} from '@turf/turf';
import type {Feature, MultiPolygon, Polygon} from 'geojson';
import type {Zone} from './types';

export const isOctagon=(feature:Feature<Polygon>)=>feature.geometry.coordinates.length===1&&feature.geometry.coordinates[0].length===9;
export function validShrinkTarget(zone:Zone, target:unknown):target is [number,number]{
 if(!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite)||Math.abs(target[0])>180||Math.abs(target[1])>85)return false;
 const p=point(target);
 return booleanPointInPolygon(p,zone.feature,{ignoreBoundary:true})&&!activeExclusions(zone).some(excluded=>booleanPointInPolygon(p,excluded));
}
function targetFor(zone:Zone):[number,number]{
 const target=zone.shrinkTarget??centroid(zone.feature).geometry.coordinates as [number,number];
 if(!validShrinkTarget(zone,target))throw new Error('Wähle den Schrumpfpunkt innerhalb der Spielzone und außerhalb aller Sperrbereiche.');
 return target;
}
function componentAt(feature:Feature<Polygon|MultiPolygon>|null,target:[number,number]):Feature<Polygon>{
 if(!feature)throw new Error('An diesem Punkt entsteht keine sichere Endzone. Wähle einen anderen Schrumpfpunkt.');
 const components=feature.geometry.type==='Polygon'?[feature as Feature<Polygon>]:feature.geometry.coordinates.map(rings=>polygon(rings));
 const result=components.find(p=>booleanPointInPolygon(point(target),p,{ignoreBoundary:true}));
 if(!result||area(result)<1)throw new Error('Die Endzone ist zu klein oder vom Schrumpfpunkt getrennt. Verschiebe den Punkt oder vergrößere die letzte Phase.');
 return result;
}
function safeArea(zone:Zone){
 const exclusions=activeExclusions(zone);return exclusions.length?difference(featureCollection([zone.feature,...exclusions])):zone.feature;
}
/** Exact final-phase geometry, shared by editor, map and authoritative engine. */
export function endZone(zone:Zone,scale:number):Feature<Polygon>{
 if(!Number.isFinite(scale)||scale<=0||scale>1)throw new Error('Ungültige Größe der Endzone.');
 const target=targetFor(zone),safe=safeArea(zone);
 if(!safe)throw new Error('Die Spielzone enthält keine freie Fläche.');
 return componentAt(intersect(featureCollection([transformScale(zone.feature,scale,{origin:target}),safe])),target);
}
/** Generated only once by the server at match start; persisted in its private checkpoint.
 * Every intermediate zone contains the exact final zone and is a subset of its predecessor.
 * Clipping may add vertices around concave boundaries and exclusions. */
export function shrinkPlan(zone:Zone,scales:number[],random:()=>number):Feature<Polygon>[] {
 const target=targetFor(zone),final=endZone(zone,scales.at(-1)!),safe=safeArea(zone)!;
 const plan:Feature<Polygon>[]=[structuredClone(zone.feature)];
 for(let index=1;index<scales.length;index++){
  if(index===scales.length-1){plan.push(structuredClone(final));continue;}
  const scale=scales[index];let candidate=transformScale(zone.feature,scale,{origin:target});
  if(zone.randomCorners&&isOctagon(zone.feature)){
   const ring=zone.feature.geometry.coordinates[0].slice(0,-1).map(vertex=>{
    const factor=scale+(scales[index-1]-scale)*.6*random();
    return rhumbDestination(target,rhumbDistance(target,vertex)*factor,rhumbBearing(target,vertex)).geometry.coordinates;
   });
   candidate=polygon([[...ring,[...ring[0]]]]);
   if(kinks(candidate).features.length)candidate=transformScale(zone.feature,scale,{origin:target});
  }
  // Preserve the agreed final area even when an irregular edge would cut into it.
  const withFinal=union(featureCollection([candidate,final]))!;
  const withinPrevious=intersect(featureCollection([withFinal,plan.at(-1)!]));
  plan.push(componentAt(withinPrevious?intersect(featureCollection([withinPrevious,safe])):null,target));
 }
 return plan;
}
/** Explicit editor action; never changes geometry during render or on reconnect. */
export function randomOctagon(origin:[number,number],radiusMeters:number,rotation:number,random:()=>number):Feature<Polygon>{
 const ring=Array.from({length:8},(_,i)=>rhumbDestination(origin,radiusMeters/1000*(.72+.28*random()),-rotation-i*45+(random()-.5)*12).geometry.coordinates);
 return polygon([[...ring,[...ring[0]]]]);
}
