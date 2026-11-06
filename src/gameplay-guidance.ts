import type {LocationSample,Settings,Zone} from '../shared/types';
import {activeExclusions,DEFAULT_XP,rules} from '../shared/rules';

export function ruleDuration(seconds:number):string{
 const n=Math.max(0,Math.round(seconds));
 if(!n)return 'Keine';
 const hours=Math.floor(n/3600),minutes=Math.floor(n%3600/60),rest=n%60;
 return [hours?`${hours} Std.`:'',minutes?`${minutes} Min.`:'',rest?`${rest} Sek.`:''].filter(Boolean).join(' ');
}
export const CAPTURE_LABELS:Record<Settings['captureMethod'],string>={qr:'QR-Scan',confirmation:'Bestätigung durch den Hider',code:'Persönlicher Fangcode',proximity:'GPS-Abstand'};
/** Read-only presentation of the actual synchronized rules. Never changes defaults. */
export function matchRuleRows(settings:Settings,zone:Zone|null):{label:string;value:string}[]{
 const modules=rules(settings),xp={...DEFAULT_XP,...settings.xp};
 const rows=[{label:'Spielzeit',value:ruleDuration(settings.durationSeconds)},{label:'Hunter',value:String(settings.hunterCount)},
 {label:'Pin-Intervall',value:ruleDuration(settings.pinIntervalSeconds)},{label:'Fangen',value:CAPTURE_LABELS[settings.captureMethod]},
 {label:'Vorbereitung',value:ruleDuration(settings.preparationSeconds)},{label:'Hunter-Vorsprung',value:ruleDuration(settings.headStartSeconds)},
 {label:'Außerhalb der Zone',value:`${ruleDuration(settings.outsideGraceSeconds)} bis zum Ausscheiden bei bestätigtem GPS`},
 {label:'Spielzone',value:zone?.name??'Noch nicht festgelegt'}];
 if(zone)rows.push({label:'Aktive Sperrzonen',value:String(activeExclusions(zone).length)});
 if(modules.zombie)rows.push({label:'Infektion',value:`Hunter-Team nach Bestätigung · Verzögerung ${ruleDuration(settings.infectionDelaySeconds)}`});
 if(modules.apocalypse)rows.push({label:'Apokalypse',value:`${settings.phases.length} Phasen · Endgröße ${Math.round((settings.phases.at(-1)?.scale??1)*100)} %`});
 if(modules.xpHunt)rows.push({label:'XP-Ziel',value:`${xp.target} Punkte ${xp.goal==='team'?'gemeinsam':'pro Hider'} · ${xp.radiusMeters} m Radius`},
 {label:'XP bei Zeitablauf',value:xp.timeout==='draw'?'Unentschieden':xp.timeout==='hiders'?'Hider gewinnen':'Hunter gewinnen'});
 return rows;
}
export function xpCollectionAdvice({active,connected,sharing,location,now,maxAccuracyMeters,distanceMeters,radiusMeters}:{active:boolean;connected:boolean;sharing:boolean;location:LocationSample|null;now:number;maxAccuracyMeters:number;distanceMeters:number|null;radiusMeters:number}):string|null{
 if(!active)return 'Das Spiel ist noch nicht freigegeben oder gerade pausiert.';
 if(!connected)return 'Warte auf die Verbindung und einen synchronisierten Spielstand.';
 if(!sharing)return 'Aktiviere deine Standortfreigabe, bevor du den Punkt einsammelst.';
 if(!location)return 'Es fehlt eine aktuelle GPS-Messung. Prüfe deinen Standort.';
 if(now-location.timestamp>10000||location.timestamp>now+5000)return 'Deine Position ist zu alt. Prüfe den Standort und warte auf eine neue Messung.';
 if(!Number.isFinite(location.accuracy)||location.accuracy>maxAccuracyMeters)return 'GPS ist noch zu ungenau. Gehe bei sicherer Gelegenheit unter freien Himmel und warte auf eine genauere Messung.';
 if(distanceMeters!==null&&distanceMeters+location.accuracy>radiusMeters){
  if(distanceMeters<=radiusMeters)return 'Du bist nahe am Ziel, aber dein Genauigkeitskreis liegt noch außerhalb. Gehe sicher etwas näher heran oder warte auf genaueres GPS.';
  return `Du bist noch ${Math.max(1,Math.ceil(distanceMeters-radiusMeters))} m außerhalb des Sammelradius. Gehe über einen sicheren Weg näher heran.`;
 }
 return null;
}
