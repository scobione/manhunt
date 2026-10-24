import { z } from 'zod';
import { area, booleanWithin, kinks, polygon } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { Settings, Zone, Command } from '../shared/types.js';

const boundedInt = (min:number,max:number) => z.number().int().min(min).max(max);
const settingsObject = z.object({
  mode:z.enum(['normal','zombie','apocalypse','hide_seek','last_survivor','team_hunt','infection_rush','custom']),
  hunterVisible:z.boolean().default(true), hunterUpdateSeconds:boundedInt(3,30).default(3), fallbackPins:z.boolean().default(true), fallbackPinMaxAgeSeconds:boundedInt(30,3600).default(600),
  durationSeconds:boundedInt(60,21600), maxPlayers:boundedInt(2,40), hunterCount:boundedInt(1,20), randomRoles:z.boolean(),
  preparationSeconds:boundedInt(0,600), headStartSeconds:boundedInt(0,900), pinIntervalSeconds:boundedInt(10,3600),
  pinLifetimeSeconds:boundedInt(10,7200), pinVisibilitySeconds:boundedInt(5,600), showOldPins:z.boolean(),
  maxAccuracyMeters:z.number().min(3).max(150), gpsToleranceSeconds:boundedInt(10,300),
  captureMethod:z.enum(['confirmation','code','proximity']), captureRadiusMeters:z.number().min(5).max(100),
  infectionDelaySeconds:boundedInt(0,300), zombieVisible:z.boolean(), zombieGps:z.boolean(), allowHealing:z.boolean(),
  outsideGraceSeconds:boundedInt(15,600), outsideReset:z.boolean(), spectatorsAllowed:z.boolean(),
  disconnectGraceSeconds:boundedInt(15,900), disconnectBehavior:z.enum(['pause','eliminate']), notifications:z.boolean(),
  phases:z.array(z.object({afterSeconds:boundedInt(0,21600),scale:z.number().min(.05).max(1)}).strict()).min(1).max(20),
  winCondition:z.enum(['survival','last_hider','infection']),
}).strict();
export const partialSettingsSchema=settingsObject.partial();
export const settingsSchema=settingsObject.superRefine((s,ctx)=>{
  if(s.hunterCount>=s.maxPlayers)ctx.addIssue({code:'custom',message:'Mindestens ein Platz muss für Hider frei bleiben.',path:['hunterCount']});
  if(s.phases[0].afterSeconds!==0||s.phases[0].scale!==1)ctx.addIssue({code:'custom',message:'Die erste Phase beginnt bei 0 mit Größe 100 %.',path:['phases']});
  for(let i=1;i<s.phases.length;i++)if(s.phases[i].afterSeconds<=s.phases[i-1].afterSeconds||s.phases[i].scale>=s.phases[i-1].scale)
    ctx.addIssue({code:'custom',message:'Phasen müssen zeitlich ansteigen und kleiner werden.',path:['phases',i]});
});
const coordinate=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-85).max(85)]);
const polygonSchema=z.object({type:z.literal('Feature'),properties:z.record(z.string(),z.unknown()).nullable().optional(),geometry:z.object({type:z.literal('Polygon'),coordinates:z.array(z.array(coordinate).min(4).max(130)).min(1).max(10)}).strict()}).strip();
export const locationSchema=z.object({latitude:z.number().finite().min(-85).max(85),longitude:z.number().finite().min(-180).max(180),accuracy:z.number().finite().positive().max(10000),timestamp:z.number().finite().positive()}).strict();
export const zoneSchema=z.object({feature:polygonSchema,excluded:z.array(polygonSchema).max(12),confirmed:z.boolean(),name:z.string().trim().min(1).max(60)}).strict();
const userId=z.string().min(1).max(80);
export const commandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('ready'),ready:z.boolean()}).strict(),z.object({type:z.literal('settings'),settings:settingsSchema}).strict(),
 z.object({type:z.literal('zone'),zone:zoneSchema}).strict(),z.object({type:z.literal('assign'),playerId:userId,role:z.enum(['hunter','hider','zombie','spectator']),team:z.enum(['A','B'])}).strict(),
 z.object({type:z.literal('kick'),playerId:userId}).strict(),z.object({type:z.literal('transfer'),playerId:userId}).strict(),
 ...(['start','leave','close','pause','resume','infection_ack','stop_location','zone_return_ack'] as const).map(type=>z.object({type:z.literal(type)}).strict()),
 z.object({type:z.literal('location'),location:locationSchema,publish:z.boolean().optional()}).strict(),
 z.object({type:z.literal('capture'),targetId:userId,code:z.string().regex(/^[0-9]{6}$/).optional()}).strict(),
 z.object({type:z.literal('confirm_capture'),captureId:userId,accept:z.boolean()}).strict(),
 z.object({type:z.literal('heal'),playerId:userId}).strict(),
] as [z.ZodObject<any>,...z.ZodObject<any>[]]);

export function validateSettings(value:unknown):Settings{return settingsSchema.parse(value) as Settings;}
export function validateCommand(value:unknown):Command{return commandSchema.parse(value) as Command;}
function validPolygon(value:Feature<Polygon>, minArea:number):void {
  for(const ring of value.geometry.coordinates){
    if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])throw new Error('Die Zonengrenze muss geschlossen sein.');
    if(new Set(ring.slice(0,-1).map(p=>p.join(','))).size<3)throw new Error('Die Zone benötigt mindestens drei verschiedene Punkte.');
  }
  if(kinks(value).features.length)throw new Error('Zonengrenzen dürfen sich nicht überschneiden.');
  const size=area(value);
  if(size<minArea||size>50_000_000)throw new Error('Die Zone muss zwischen 100 m² und 50 km² groß sein.');
  const outer=polygon([value.geometry.coordinates[0]]);
  for(const ring of value.geometry.coordinates.slice(1))if(!booleanWithin(polygon([ring]),outer))throw new Error('Aussparungen müssen innerhalb der Zone liegen.');
}
export function validateZone(value:unknown):Zone {
  const data=zoneSchema.parse(value) as Zone;
  // Coordinates and geometry are retained; arbitrary GeoJSON properties never enter persistence or views.
  data.feature.properties={};data.excluded.forEach(x=>{x.properties={};});
  validPolygon(data.feature,100);
  for(const exclusion of data.excluded){validPolygon(exclusion,1);if(!booleanWithin(exclusion,data.feature))throw new Error('Sperrbereiche müssen vollständig innerhalb der Spielzone liegen.');}
  return data;
}
