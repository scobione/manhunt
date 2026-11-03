import type {SupabaseClient} from '@supabase/supabase-js';
import type {BadgeDefinition,BadgeOverview} from '../shared/achievements';
import type {FeedbackOffer,FeedbackSettings,FeedbackAnswer} from '../shared/feedback';
import {HttpError} from './auth';
export interface FeedbackFilters {from:string;until:string;mode:string|null;rating:number|null;page:number;}
export interface FeatureStore {
 badges(user:string):Promise<BadgeOverview>;
 equip(user:string,badge:string|null):Promise<BadgeOverview>;
 seen(user:string,ids:string[]):Promise<void>;
 offer(user:string,match:string):Promise<FeedbackOffer|null>;
 offerById(user:string,id:string):Promise<FeedbackOffer|null>;
 respond(user:string,id:string,skip:boolean,answers:Record<string,FeedbackAnswer>):Promise<BadgeOverview>;
 settings():Promise<FeedbackSettings>;
 configure(settings:FeedbackSettings):Promise<unknown>;
 feedbackReport(filters:FeedbackFilters):Promise<unknown>;
 definitions():Promise<BadgeDefinition[]>;
 updateDefinition(definition:BadgeDefinition):Promise<void>;
 badgeHolders(badge:string|null,page:number):Promise<unknown>;
}
function checked(error:{code?:string;message?:string}|null){
 if(!error)return;
 const messages:Record<string,string>={registered_required:'Ein registriertes Konto ist erforderlich.',badge_locked:'Dieses Badge ist noch gesperrt.',feedback_not_found:'Diese Feedback-Abfrage ist nicht verfügbar.',feedback_closed:'Diese Abfrage wurde bereits abgeschlossen.',settings_changed:'Die Einstellungen wurden inzwischen geändert. Bitte lade sie erneut.',invalid_badge_definition:'Die Badge-Definition ist ungültig.'};
 const found=Object.entries(messages).find(([key])=>error.message?.includes(key));
 if(found)throw new HttpError(409,found[1]);
 throw new HttpError(503,'Feedback und Badges sind gerade nicht erreichbar. Bitte versuche es erneut.');
}
const offerColumns='id,matchId:match_id,version,questions,status,offeredAt:offered_at,modes';
function offerValue(value:any):FeedbackOffer|null{return value?{...value,version:String(value.version)}:null;}
export class SupabaseFeatureStore implements FeatureStore {
 constructor(private db:SupabaseClient){}
 private async rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const r=await this.db.rpc(name,args);checked(r.error);return r.data as T;}
 badges(user:string){return this.rpc<BadgeOverview>('read_player_badges',{p_user:user});}
 equip(user:string,badge:string|null){return this.rpc<BadgeOverview>('choose_profile_badge',{p_user:user,p_badge:badge});}
 async seen(user:string,ids:string[]){if(!ids.length)return;const r=await this.db.from('badge_notices').update({seen_at:new Date().toISOString()}).eq('user_id',user).in('id',ids).is('seen_at',null);checked(r.error);}
 async offer(user:string,match:string){const r=await this.db.from('feedback_offers').select(offerColumns).eq('user_id',user).eq('match_id',match).maybeSingle();checked(r.error);return offerValue(r.data);}
 async offerById(user:string,id:string){const r=await this.db.from('feedback_offers').select(offerColumns).eq('user_id',user).eq('id',id).maybeSingle();checked(r.error);return offerValue(r.data);}
 respond(user:string,id:string,skip:boolean,answers:Record<string,FeedbackAnswer>){return this.rpc<BadgeOverview>('respond_game_feedback',{p_user:user,p_offer:id,p_skip:skip,p_answers:answers});}
 async settings():Promise<FeedbackSettings>{const r=await this.db.from('feedback_settings').select('version,introduced_at,feedback_questionnaires(questions)').eq('id',1).single();checked(r.error);const v=r.data as any;return{version:String(v.version),introducedAt:v.introduced_at,questions:v.feedback_questionnaires.questions};}
 configure(settings:FeedbackSettings){return this.rpc('configure_feedback',{p_expected:Number(settings.version),p_questions:settings.questions});}
 feedbackReport(filters:FeedbackFilters){return this.rpc('read_feedback_report',{p_from:filters.from,p_until:filters.until,p_mode:filters.mode,p_rating:filters.rating,p_page:filters.page});}
 async definitions(){const r=await this.db.from('badge_definitions').select('definition').order('id');checked(r.error);return(r.data??[]).map(v=>v.definition as BadgeDefinition);}
 async updateDefinition(definition:BadgeDefinition){await this.rpc('update_badge_definition',{p_id:definition.id,p_definition:definition});}
 badgeHolders(badge:string|null,page:number){return this.rpc('read_badge_holders',{p_badge:badge,p_page:page});}
}
