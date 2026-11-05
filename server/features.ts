import {z} from 'zod';
import type {FeatureStore} from './feature-store';
import type {ProfileCustomizationService} from './profile-customization';
import type {BadgeDefinition} from '../shared/achievements';
import {validateFeedback,type FeedbackQuestion} from '../shared/feedback';
import {HttpError,type Identity} from './auth';
const id=z.uuid(),page=z.coerce.number().int().min(0).max(10000),empty=z.object({}).strict();
export const badgeDefinitionSchema=z.object({
 id:z.enum(['beta-tester','hunter','hider','veteran','xp-scout','winner','survivor']),name:z.string().trim().min(2).max(40),description:z.string().trim().min(5).max(500),
 icon:z.enum(['flask','hunter','shield','trophy','pin']),metric:z.enum(['feedback','captures','hiderWins','games','huntPoints','wins','survivals']),
 thresholds:z.array(z.number().int().min(1).max(999999999)).min(1).max(10),stageNames:z.array(z.string().trim().min(1).max(40)).min(1).max(10),unit:z.string().trim().min(1).max(30),
}).strict().refine(d=>d.thresholds.length===(d.id==='beta-tester'?1:10)&&d.stageNames.length===d.thresholds.length&&d.thresholds.every((v,i)=>i===0||v>d.thresholds[i-1])&&(d.id!=='beta-tester'||d.thresholds[0]===1),'Stufen müssen vollständig und streng aufsteigend sein; Beta-Tester wird nach einem Feedback vergeben.');
export const questionSchema=z.object({id:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),label:z.string().trim().min(5).max(200),type:z.enum(['rating','choices','recommendation','text']),required:z.boolean(),feature:z.enum(['all','zombie','apocalypse','xpHunt']),options:z.array(z.string().trim().min(1).max(60)).min(2).max(12).optional()}).strict()
 .refine(q=>!['choices','recommendation'].includes(q.type)||!!q.options&&new Set(q.options).size===q.options.length,'Bitte eindeutige Antwortmöglichkeiten angeben.')
 .refine(q=>!q.required,'Einzelne Fragen müssen überspringbar bleiben.');
export const feedbackSettingsSchema=z.object({version:z.string().regex(/^[1-9][0-9]{0,14}$/),questions:z.array(questionSchema).min(2).max(20)}).strict()
 .refine(s=>new Set(s.questions.map(q=>q.id)).size===s.questions.length,'Fragen-IDs müssen eindeutig sein.')
 .refine(s=>s.questions.some(q=>q.id==='overall'&&q.type==='rating'&&q.feature==='all')&&s.questions.some(q=>q.id==='recommend'&&q.type==='recommendation'&&q.feature==='all'),'Gesamtbewertung und Weiterempfehlung bleiben im Fragebogen.');
export class FeatureService {
 constructor(readonly store:FeatureStore,private customization?:Pick<ProfileCustomizationService,'decorateFriend'>){}
 async player(identity:Identity,path:string,method:string,body:unknown,query:URLSearchParams){
  if(path==='/badges'&&method==='GET')return this.store.badges(identity.id);
  if(path==='/badges/visibility'&&method==='PATCH'){
   if(identity.isGuest)throw new HttpError(403,'Dauerhafte Badges benötigen ein registriertes Konto.');
   const {badgeId,visible}=z.object({badgeId:z.string().min(1).max(40),visible:z.boolean()}).strict().parse(body);
   return this.store.visibility(identity.id,badgeId,visible);
  }
  const profile=path.match(/^\/players\/([^/]+)\/profile$/);
  if(profile&&method==='GET'){const value=await this.store.profile(identity.id,id.parse(profile[1]));return this.customization?this.customization.decorateFriend(value):value;}
  if(path==='/badges/selected'&&method==='PATCH'){
   if(identity.isGuest)throw new HttpError(403,'Dauerhafte Badges benötigen ein registriertes Konto.');
   const {badgeId}=z.object({badgeId:z.string().min(1).max(40).nullable()}).strict().parse(body);return this.store.equip(identity.id,badgeId);
  }
  if(path==='/badges/seen'&&method==='POST'){const {ids}=z.object({ids:z.array(id).max(100)}).strict().parse(body);await this.store.seen(identity.id,ids);return{ok:true};}
  if(path==='/feedback'&&method==='GET')return{offer:await this.store.offer(identity.id,id.parse(query.get('matchId')))};
  const match=path.match(/^\/feedback\/([^/]+)\/(submit|skip)$/);
  if(match&&method==='POST'){
   const offerId=id.parse(match[1]),skip=match[2]==='skip';
   const offer=await this.store.offerById(identity.id,offerId);if(!offer)throw new HttpError(404,'Diese Feedback-Abfrage ist nicht verfügbar.');
   let answers={};
   if(skip)empty.parse(body);
   else{const parsed=z.object({version:z.string().max(30),answers:z.unknown()}).strict().parse(body);if(parsed.version!==offer.version)throw new HttpError(409,'Die Fragebogenversion stimmt nicht. Bitte lade die Abfrage erneut.');try{answers=validateFeedback(offer.questions,parsed.answers);}catch(e){throw new HttpError(400,e instanceof Error?e.message:'Ungültige Antworten.');}}
   return{ok:true,badges:await this.store.respond(identity.id,offerId,skip,answers)};
  }
  throw new HttpError(404,'Diese Funktion ist nicht verfügbar.');
 }
 /** Called only AFTER AccountService validates identity, live Auth session,
  * admin controls and the short-lived administrator ticket. */
 async admin(path:string,method:string,body:unknown,query:URLSearchParams){
  if(path==='/admin/feedback/settings'){
   if(method==='GET')return this.store.settings();
   if(method==='POST'){const settings=feedbackSettingsSchema.parse(body);return this.store.configure({...settings,questions:settings.questions as FeedbackQuestion[]});}
  }
  if(path==='/admin/feedback'&&method==='GET'){
   const from=z.iso.datetime().parse(query.get('from')??new Date(Date.now()-30*86400000).toISOString()),until=z.iso.datetime().parse(query.get('until')??new Date(Date.now()+86400000).toISOString());
   if(from>=until)throw new HttpError(400,'Das Enddatum muss nach dem Startdatum liegen.');
   const mode=query.get('mode')?z.enum(['normal','zombie','apocalypse','xpHunt','hide_seek','last_survivor','team_hunt','infection_rush','custom']).parse(query.get('mode')):null;
   const rating=query.get('rating')?z.coerce.number().int().min(1).max(5).parse(query.get('rating')):null;
   return this.store.feedbackReport({from,until,mode,rating,page:page.parse(query.get('page')??0)});
  }
  if(path==='/admin/badges'&&method==='GET')return this.store.badgeHolders(query.get('badge')?z.string().max(40).parse(query.get('badge')):null,page.parse(query.get('page')??0));
  if(path==='/admin/badges'&&method==='PATCH'){const def=badgeDefinitionSchema.parse(body) as BadgeDefinition;await this.store.updateDefinition(def);return{ok:true};}
  throw new HttpError(404,'Diese Verwaltungsfunktion existiert nicht.');
 }
}
