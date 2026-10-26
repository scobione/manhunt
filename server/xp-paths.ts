import {bbox,booleanPointInPolygon,distance,lineString,point,pointToLineDistance,polygon} from '@turf/turf';
import type {Feature,Polygon} from 'geojson';
import type {Zone,Settings} from '../shared/types.js';
import {activeExclusions,DEFAULT_XP} from '../shared/rules.js';
export interface PathCandidate {longitude:number;latitude:number;pathId:string;label:string}
export function safeXpPosition(c:PathCandidate,zone:Zone,active:Feature<Polygon>,settings:Settings,previous?:PathCandidate):boolean{
 const pos=point([c.longitude,c.latitude]),xp={...DEFAULT_XP,...settings.xp};
 if(!booleanPointInPolygon(pos,active))return false;
 const near=(poly:Feature<Polygon>,meters:number)=>poly.geometry.coordinates.some(ring=>pointToLineDistance(pos,lineString(ring),{units:'meters'})<meters);
 if(near(active,xp.radiusMeters+xp.boundaryBufferMeters))return false;
 if(activeExclusions(zone).some(z=>booleanPointInPolygon(pos,z)||near(z,xp.radiusMeters+xp.exclusionBufferMeters)))return false;
 return !previous||distance([previous.longitude,previous.latitude],pos,{units:'meters'})>=xp.minDistanceMeters;
}
interface OsmWay {type:string;id:number;tags?:Record<string,string>;geometry?:{lat:number;lon:number}[]}
/** Conservative map-data screening. Every point still requires host confirmation on site. */
export function candidatesFromOsm(data:{elements?:OsmWay[]}):PathCandidate[]{
 const ways=(data.elements??[]).filter(w=>w.type==='way'&&w.geometry&&w.geometry.length>=2);
 const hazards=ways.filter(w=>w.tags&&(w.tags.water||w.tags.waterway||w.tags.natural==='water'||w.tags.railway||w.tags.building||['motorway','motorway_link','trunk','trunk_link'].includes(w.tags.highway)||['private','no','customers','permit'].includes(w.tags.access)||w.tags.landuse==='military'));
 const candidates:PathCandidate[]=[];
 for(const way of ways){const t=way.tags??{};
  if(!['footway','pedestrian','path'].includes(t.highway)||['private','no','customers','permit'].includes(t.access)||t.foot==='no'||t.construction||t.indoor==='yes'||t.tunnel==='yes'||t.bridge==='yes')continue;
  for(const v of way.geometry!){if(!Number.isFinite(v.lon)||!Number.isFinite(v.lat)||Math.abs(v.lat)>85||Math.abs(v.lon)>180)continue;const pos=point([v.lon,v.lat]);
   const unsafe=hazards.some(h=>{const coords=h.geometry!.map(p=>[p.lon,p.lat]);try{if(coords.length>=4&&coords[0][0]===coords.at(-1)![0]&&coords[0][1]===coords.at(-1)![1]&&booleanPointInPolygon(pos,polygon([coords])))return true;return pointToLineDistance(pos,lineString(coords),{units:'meters'})<20;}catch{return true;}});
   if(!unsafe)candidates.push({longitude:v.lon,latitude:v.lat,pathId:`osm-way-${way.id}`,label:(t.name??'Öffentlicher Fußweg').slice(0,100)});
   if(candidates.length>=1500)return candidates;
  }
 }
 return candidates;
}
export async function loadXpPaths(zone:Zone,fetcher:typeof fetch=fetch):Promise<PathCandidate[]>{
 const [west,south,east,north]=bbox(zone.feature);const box=`${south},${west},${north},${east}`;
 // Fixed endpoint and numeric server-validated bounds: no arbitrary network destinations.
 const query=`[out:json][timeout:12];(way[highway~"^(footway|pedestrian|path|motorway|motorway_link|trunk|trunk_link)$"](${box});way[railway](${box});way[waterway](${box});way[natural=water](${box});way[water](${box});way[building](${box});way[access~"^(private|no|customers|permit)$"](${box});way[landuse=military](${box}););out tags geom;`;
 const response=await fetcher('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Wegdaten sind gerade nicht verfügbar. Der Host kann die Punktprüfung erneut starten.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Keine Wegdaten erhalten.');let bytes=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4_000_000){await reader.cancel();throw new Error('Zu viele Wegdaten. Verkleinere die Spielzone.');}chunks.push(value);}
 const joined=new Uint8Array(bytes);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}
 const data=JSON.parse(new TextDecoder().decode(joined));if(data.remark)throw new Error('Die Wegprüfung wurde nicht vollständig ausgeführt. Bitte erneut versuchen.');
 return candidatesFromOsm(data);
}
