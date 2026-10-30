import {useSyncExternalStore} from 'react';
import {cancelTraffic} from './traffic-meter';
const prefix='manhunt:traffic-consent:v1:',eventName='manhunt:traffic-consent-changed';
const denied=new Set<string>();
export function trafficAllowed(userId?:string):boolean{
 if(!userId||denied.has(userId))return false;
 try{return localStorage.getItem(prefix+userId)==='allowed';}catch{return false;}
}
export function setTrafficConsent(userId:string,allowed:boolean){
 // Stop synchronously, without a final report, before React processes the change.
 if(!allowed){denied.add(userId);cancelTraffic();}
 try{if(allowed)localStorage.setItem(prefix+userId,'allowed');else localStorage.removeItem(prefix+userId);denied.delete(userId);}
 catch{if(allowed)throw new Error('Deine Auswahl konnte auf diesem Gerät nicht gespeichert werden. Die Diagnose bleibt ausgeschaltet.');}
 window.dispatchEvent(new Event(eventName));
}
function subscribe(listener:()=>void){window.addEventListener(eventName,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(eventName,listener);window.removeEventListener('storage',listener);};}
export function useTrafficConsent(userId?:string){return useSyncExternalStore(subscribe,()=>trafficAllowed(userId),()=>false);}
