import type {Settings} from './types';
import {rules} from './rules';
export type FeedbackFeature='all'|'zombie'|'apocalypse'|'xpHunt';
export interface FeedbackQuestion {id:string;label:string;type:'rating'|'choices'|'recommendation'|'text';required:boolean;feature:FeedbackFeature;options?:string[];}
export interface FeedbackSettings {questions:FeedbackQuestion[];version:string;introducedAt?:string;}
export type FeedbackAnswer=number|string|string[]|{rating:number;comment?:string};
export interface FeedbackOffer {id:string;matchId:string;version:string;questions:FeedbackQuestion[];status:'offered'|'completed'|'skipped';offeredAt:string;modes:string[];}
export const DEFAULT_QUESTIONS:FeedbackQuestion[]=[
 {id:'overall',label:'Wie hat dir das Spiel insgesamt gefallen?',type:'rating',required:false,feature:'all'},
 {id:'location',label:'Wie zuverlässig haben Karte und Standort funktioniert?',type:'rating',required:false,feature:'all'},
 {id:'clarity',label:'Wie verständlich waren Rollen, Regeln und Spielablauf?',type:'rating',required:false,feature:'all'},
 {id:'zombie',label:'Wie gut haben Infektion und Teamwechsel funktioniert?',type:'rating',required:false,feature:'zombie'},
 {id:'apocalypse',label:'Wie gut haben Schrumpfzonen und Zonenwarnungen funktioniert?',type:'rating',required:false,feature:'apocalypse'},
 {id:'xpHunt',label:'Wie gut haben XP-Punkte und das Einsammeln funktioniert?',type:'rating',required:false,feature:'xpHunt'},
 {id:'design',label:'Wie findest du Bedienung und Design?',type:'rating',required:false,feature:'all'},
 {id:'improve',label:'Was sollten wir verbessern?',type:'choices',required:false,feature:'all',options:['GPS / Standort','Karte','Fangen','Spielmodi','Rollen','Bedienung','Stabilität','Verbindung']},
 {id:'recommend',label:'Würdest du das Spiel weiterempfehlen?',type:'recommendation',required:false,feature:'all',options:['Ja','Vielleicht','Nein']},
 {id:'notes',label:'Möchtest du uns noch etwas mitteilen?',type:'text',required:false,feature:'all'},
];
export function questionsFor(settings:Settings,questions:FeedbackQuestion[]){const active=rules(settings);return questions.filter(q=>q.feature==='all'||active[q.feature]);}
export function validateFeedback(questions:FeedbackQuestion[],raw:unknown):Record<string,FeedbackAnswer>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Bitte fülle den Fragebogen aus.');
 const answers=raw as Record<string,unknown>;
 if(Object.keys(answers).some(id=>!questions.some(q=>q.id===id)))throw new Error('Die Antwort enthält unbekannte Fragen.');
 const result:Record<string,FeedbackAnswer>={};
 for(const q of questions){
  const answer=answers[q.id];
  if(answer===undefined||answer===''||Array.isArray(answer)&&!answer.length){continue;}
  if(q.type==='rating'){
   const obj=typeof answer==='number'?{rating:answer}:answer;
   if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!['rating','comment'].includes(k)))throw new Error('Ungültige Sternebewertung.');
   const {rating,comment}=obj as {rating:unknown;comment?:unknown};
   if(typeof rating!=='number'||!Number.isInteger(rating)||rating<1||rating>5)throw new Error('Wähle eine Bewertung von 1 bis 5 Sternen.');
   if(comment!==undefined&&(typeof comment!=='string'||comment.length>2000))throw new Error('Kommentare dürfen höchstens 2000 Zeichen haben.');
   result[q.id]={rating,...(typeof comment==='string'&&comment.trim()?{comment:comment.trim()}: {})};
  }else if(q.type==='choices'){
   if(!Array.isArray(answer)||answer.length>20||answer.some(v=>typeof v!=='string'||!q.options?.includes(v)))throw new Error('Ungültige Auswahl.');
   result[q.id]=[...new Set(answer)] as string[];
  }else if(q.type==='recommendation'){
   if(typeof answer!=='string'||!q.options?.includes(answer))throw new Error('Bitte wähle eine Weiterempfehlung.');result[q.id]=answer;
  }else{if(typeof answer!=='string'||answer.length>2000)throw new Error('Freitext darf höchstens 2000 Zeichen haben.');result[q.id]=answer.trim();}
 }
 return result;
}
export function feedbackRating(value:unknown):number|undefined{if(typeof value==='number')return value;if(value&&typeof value==='object'&&'rating'in value&&typeof value.rating==='number')return value.rating;}
