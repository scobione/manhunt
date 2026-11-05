import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {BugReport,BugReportInput,SaveZoneInput,SavedGameZone} from '../shared/community';
import {HttpError,type Identity} from './auth';
import {validateSettings,validateZone} from './validation';

export interface CommunityStore {
 zones(user:string):Promise<SavedGameZone[]>;
 saveZone(user:string,input:SaveZoneInput):Promise<SavedGameZone>;
 deleteZone(user:string,id:string):Promise<void>;
 favoriteRules(user:string):Promise<string[]>;
 favoriteRule(user:string,id:string,favorite:boolean):Promise<void>;
 reports(user:string):Promise<BugReport[]>;
 screenshot(user:string,path:string):Promise<void>;
 submit(user:string,input:BugReportInput):Promise<BugReport>;
 adminReports(page:number):Promise<{reports:BugReport[]}>;
 quota(user:string):Promise<void>;
}
const uuid=z.uuid(),tags=z.array(z.string().trim().min(1).max(24)).max(5);
const zoneInput=z.object({id:uuid.optional(),name:z.string().trim().min(1).max(60),zone:z.unknown(),settings:z.unknown().nullable().optional(),favorite:z.boolean().optional(),tags:tags.optional()}).strict();
const reportInput=z.object({id:uuid,category:z.enum(['gameplay','gps','map','account','other']),description:z.string().trim().min(10).max(3000),build:z.string().trim().min(1).max(40),matchId:uuid.nullable().optional(),screenshotPath:z.string().max(200).nullable().optional()}).strict();
/** Caller validates the live authenticated game session before dispatch. */
export class CommunityService {
 constructor(readonly store:CommunityStore){}
 async player(identity:Identity,path:string,method:string,body:unknown={}){
  if(path.startsWith('/library/')){
   if(identity.isGuest)throw new HttpError(403,'Die geräteübergreifende Bibliothek benötigt ein registriertes Konto. Lokale Zonen bleiben verfügbar.');
   if(path==='/library/zones'&&method==='GET')return{zones:await this.store.zones(identity.id)};
   const zonePath=path.match(/^\/library\/zones\/([^/]+)$/);
   if(path==='/library/zones'&&method==='POST'||zonePath&&method==='PATCH'){
    const parsed=zoneInput.parse(body);if(zonePath&&parsed.id&&parsed.id!==zonePath[1])throw new HttpError(400,'Die Zonen-ID stimmt nicht.');
    const zone=validateZone(parsed.zone);zone.confirmed=false;
    const settings=parsed.settings==null?null:validateSettings(parsed.settings);
    await this.store.quota(identity.id);
    return this.store.saveZone(identity.id,{...parsed,id:zonePath?uuid.parse(zonePath[1]):parsed.id??randomUUID(),zone,settings,tags:[...new Set(parsed.tags??[])]});
   }
   if(zonePath&&method==='DELETE'){await this.store.quota(identity.id);await this.store.deleteZone(identity.id,uuid.parse(zonePath[1]));return{ok:true};}
   if(path==='/library/favorites'&&method==='GET')return{presetIds:await this.store.favoriteRules(identity.id)};
   const favorite=path.match(/^\/library\/favorites\/([^/]+)$/);
   if(favorite&&method==='PATCH'){const value=z.object({favorite:z.boolean()}).strict().parse(body);await this.store.quota(identity.id);await this.store.favoriteRule(identity.id,uuid.parse(favorite[1]),value.favorite);return{ok:true};}
  }
  if(path==='/reports'&&method==='GET')return{reports:await this.store.reports(identity.id)};
  if(path==='/reports'&&method==='POST'){
   const input=reportInput.parse(body);
   if(input.screenshotPath){if(!new RegExp(`^${identity.id}/[a-f0-9-]{36}\\.webp$`,'i').test(input.screenshotPath))throw new HttpError(400,'Der Screenshot gehört nicht zu deinem Konto.');await this.store.screenshot(identity.id,input.screenshotPath);}
   // The database owns the rolling-hour limit and match-membership validation.
   return this.store.submit(identity.id,input);
  }
  throw new HttpError(404,'Diese Funktion ist nicht verfügbar.');
 }
 /** Dispatch only after the existing administrator identity AND fresh ticket checks. */
 async admin(path:string,method:string,query:URLSearchParams){
  if(path==='/admin/reports'&&method==='GET')return this.store.adminReports(z.coerce.number().int().min(0).max(10000).parse(query.get('page')??0));
  throw new HttpError(404,'Diese Verwaltungsfunktion existiert nicht.');
 }
}
