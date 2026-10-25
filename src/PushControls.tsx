import {detachPush} from './push-client';
import {useEffect,useState} from 'react';
import {Bell,BellOff} from 'lucide-react';
import {useApp} from './context';
const preference='manhunt:push-enabled';
const supported=()=> 'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
const bytes=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
async function subscribe(key:string){
 const registration=await navigator.serviceWorker.ready;
 let subscription=await registration.pushManager.getSubscription();
 const current=subscription?.options.applicationServerKey;
 if(current&&String(new Uint8Array(current))!==String(bytes(key))){await subscription!.unsubscribe();subscription=null;}
 return subscription??registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(key)});
}
export function PushRegistration(){
 const {profile,config,api}=useApp();
 useEffect(()=>{if(!profile||!config?.pushPublicKey||!supported()||Notification.permission!=='granted'||localStorage.getItem(preference)==='off')return;let cancelled=false;void subscribe(config.pushPublicKey).then(subscription=>{if(!cancelled)return api('/push/subscribe',{method:'POST',body:JSON.stringify(subscription.toJSON())});}).catch(()=>{/* The visible controls offer an explicit retry. */});return()=>{cancelled=true;};},[profile?.id,config?.pushPublicKey,api]);
 return null;
}
export default function PushControls(){
 const {profile,config,api}=useApp();const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(supported())void navigator.serviceWorker.getRegistration().then(r=>r?.pushManager.getSubscription()).then(s=>setEnabled(!!s&&Notification.permission==='granted'&&localStorage.getItem(preference)!=='off')).catch(()=>{});},[]);
 async function toggle(){setBusy(true);setMessage('');try{if(enabled){await detachPush(api);localStorage.setItem(preference,'off');setEnabled(false);setMessage('Push auf diesem Gerät deaktiviert.');return;}if(!supported())throw new Error('Installiere MANHUNT auf dem iPhone zuerst über Safari → Teilen → Zum Home-Bildschirm und öffne die installierte App.');if(!config?.pushPublicKey)throw new Error('Push ist vorübergehend nicht verfügbar. Öffne die App erneut.');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Erlaube Mitteilungen für MANHUNT in deinen Geräte- oder Browser-Einstellungen.');const sub=await subscribe(config.pushPublicKey);try{await api('/push/subscribe',{method:'POST',body:JSON.stringify(sub.toJSON())});}catch(error){await sub.unsubscribe();throw error;}localStorage.setItem(preference,'on');setEnabled(true);setMessage('Aktiv: Pin-Erinnerungen, neue Pins, Fänge, Zonen und Einladungen.');}catch(e){setMessage(e instanceof Error?e.message:'Push konnte nicht eingerichtet werden.');}finally{setBusy(false);}}
 if(!profile)return null;
 return <section className="panel push-controls"><div className="panel-heading"><h3><Bell size={19}/> Spielhinweise als Push</h3><span className="tag">{enabled?'AKTIV':'FREIGABE NÖTIG'}</span></div><p>Erhalte Pin-Erinnerungen und wichtige Spielereignisse auch bei geschlossener Webapp. Auf dem iPhone muss MANHUNT zum Home-Bildschirm hinzugefügt sein.</p><div className="button-row"><button className="button" disabled={busy} onClick={toggle}>{enabled?<BellOff size={17}/>:<Bell size={17}/>} {enabled?'Push deaktivieren':'Push aktivieren'}</button>{enabled&&<button className="button" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/push/test',{method:'POST',body:'{}'});setMessage('Test-Push eingeplant. Die Zustellung kann einige Sekunden dauern.');}catch(e){setMessage(e instanceof Error?e.message:'Test fehlgeschlagen.');}finally{setBusy(false);}}}>Test-Push senden</button>}</div>{message&&<p role="status">{message}</p>}<p className="fineprint">Mitteilungen ersetzen keine GPS-Ortung. Zustellung und Ton hängen von Verbindung, Fokusmodus und Geräteeinstellungen ab.</p></section>;
}
