import type {LocationSample} from '../shared/types';

export type GpsQualityLevel='inactive'|'good'|'weak'|'stale';
export interface GpsQuality {
 level:GpsQualityLevel;label:string;detail:string;ageSeconds:number|null;accuracyMeters:number|null;
}
export function formatGpsAge(seconds:number|null){
 if(seconds===null)return 'Noch keine Position';
 if(seconds<1)return 'Gerade aktualisiert';
 if(seconds<60)return `Vor ${Math.floor(seconds)} s`;
 return `Vor ${Math.floor(seconds/60)} Min.`;
}
/** Display guidance only; the server remains responsible for every GPS rule. */
export function gpsQuality(sample:LocationSample|null|undefined,maxAccuracyMeters:number,now=Date.now()):GpsQuality{
 if(!sample)return{level:'inactive',label:'GPS wartet',detail:'Aktiviere die Standortfreigabe und lasse die App geöffnet.',ageSeconds:null,accuracyMeters:null};
 const validTime=Number.isFinite(sample.timestamp)&&sample.timestamp<=now+5000;
 const ageSeconds=validTime?Math.max(0,(now-sample.timestamp)/1000):null,accuracyMeters=Number.isFinite(sample.accuracy)&&sample.accuracy>0?Math.round(sample.accuracy):null;
 if(ageSeconds===null||ageSeconds>15)return{level:'stale',label:'Position veraltet',detail:'Öffne MANHUNT im Vordergrund und prüfe den Standort erneut. Bleibe bis zur frischen Ortung an einem sicheren Ort.',ageSeconds,accuracyMeters};
 if(accuracyMeters===null||sample.accuracy>maxAccuracyMeters)return{level:'weak',label:'GPS ungenau',detail:'Gehe nur auf einem sicheren Weg unter freien Himmel. Warte dort auf eine genauere Ortung; Gebäude und Bäume können den Empfang stören.',ageSeconds,accuracyMeters};
 return{level:'good',label:'GPS aktuell',detail:'Die Position ist aktuell und liegt innerhalb der erlaubten GPS-Genauigkeit.',ageSeconds,accuracyMeters};
}

/** Active games retain the existing freshness; standby needs fewer fallback fixes. */
export function gpsObservationInterval(status:string,hunterUpdateSeconds=3){
 if(status==='paused')return 0;
 if(status==='waiting')return 10000;
 return Math.max(1000,Math.min(3000,hunterUpdateSeconds*1000));
}
