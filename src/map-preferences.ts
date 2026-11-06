export interface MapPreferences {sunlight:boolean;accuracyCircle:boolean;}
export const MAP_PREFERENCES_KEY='manhunt:map-display:v1';
const DEFAULT_PREFERENCES:MapPreferences={sunlight:false,accuracyCircle:true};
type PreferenceStorage=Pick<Storage,'getItem'|'setItem'>;
/** Display choices only. Never persist GPS data or match state here. */
export function readMapPreferences(storage?:PreferenceStorage):MapPreferences {
 try {
  const value=JSON.parse((storage??localStorage).getItem(MAP_PREFERENCES_KEY)??'null');
  return {sunlight:typeof value?.sunlight==='boolean'?value.sunlight:false,accuracyCircle:typeof value?.accuracyCircle==='boolean'?value.accuracyCircle:true};
 }catch{return {...DEFAULT_PREFERENCES};}
}
export function saveMapPreferences(value:MapPreferences,storage?:PreferenceStorage):void {
 try{(storage??localStorage).setItem(MAP_PREFERENCES_KEY,JSON.stringify({sunlight:value.sunlight===true,accuracyCircle:value.accuracyCircle!==false}));}catch{/* Display controls still work when private browsing denies storage. */}
}
