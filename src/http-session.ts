import type { LobbyView } from '../shared/types';

interface Sync { lobby:LobbyView|null;socialRevision:number;serverTime:number }
interface Options {
  request:<T>(path:string,options?:RequestInit)=>Promise<T>;
  onState:(state:LobbyView|null)=>void;
  onSocial:()=>void;
  onConnection:(connected:boolean)=>void;
  onExpired:()=>void;
  onResynced?:()=>void;
}
/** Commands and polls share one queue: an older poll cannot overwrite a later
 * leave/capture response. Mutations are never blindly retried after a timeout.
 */
export function httpSession({request,onState,onSocial,onConnection,onExpired,onResynced}:Options){
  let closed=false,timer:ReturnType<typeof setTimeout>|undefined,social:number|undefined;
  let synchronized=false,interrupted=false;
  let online=typeof navigator==='undefined'||navigator.onLine!==false,generation=0,needsSync=false,polling=false,pollAgain=false;
  let queue:Promise<unknown>=Promise.resolve();
  const accept=(result:Sync,version:number,isSync=false)=>{
    if(closed||!online||version!==generation||needsSync&&!isSync)return false;
    if(isSync)needsSync=false;
    onState(result.lobby);onConnection(true);if(social!==result.socialRevision){social=result.socialRevision;onSocial();}if(synchronized&&interrupted){interrupted=false;onResynced?.();}synchronized=true;return true;
  };
  const enqueue=<T>(fn:()=>Promise<T>)=>{const next=queue.then(()=>{if(closed)throw new Error('Verbindung beendet.');return fn();});queue=next.catch(()=>{});return next;};
  const failed=(error:unknown,version:number)=>{
    if(closed||version!==generation)return;
    const status=(error as {status?:number}).status;
    // Rejected game actions do not mean the network connection was lost.
    if(status&&status>=400&&status<500&&![401,408].includes(status))return;
    if(synchronized)interrupted=true;needsSync=true;generation++;onConnection(false);if(status===401)onExpired();
  };
  const poll=async()=>{
    if(closed||!online)return;
    if(polling){pollAgain=true;return;}
    polling=true;clearTimeout(timer);
    try{await enqueue(async()=>{
      const version=generation;
      try{if(accept(await request<Sync>('/sync'),version,true))pollAgain=false;}catch(error){failed(error,version);}
    });}catch{/* A closed session cannot schedule more work. */}
    finally{
      polling=false;
      if(!closed&&online){if(pollAgain){pollAgain=false;void poll();}else timer=setTimeout(poll,2000);}
    }
  };
  const offline=()=>{if(closed||!online)return;online=false;generation++;needsSync=true;if(synchronized)interrupted=true;clearTimeout(timer);onConnection(false);};
  const restored=()=>{if(closed||online)return;online=true;generation++;needsSync=true;clearTimeout(timer);void poll();};
  if(typeof window!=='undefined'){window.addEventListener('offline',offline);window.addEventListener('online',restored);}
  if(!online)onConnection(false);
  void poll();
  return {
    send:<T=LobbyView>(event:string,data:unknown={})=>enqueue(async()=>{
      const version=generation;
      try{if(!online)throw new Error('Keine Serververbindung. Warte auf die Wiederverbindung.');const result=await request<Sync>('/events',{method:'POST',body:JSON.stringify({event,data})});accept(result,version);return result.lobby as T;}
      catch(error){failed(error,version);throw error;}
    }),
    close:()=>{closed=true;generation++;clearTimeout(timer);if(typeof window!=='undefined'){window.removeEventListener('offline',offline);window.removeEventListener('online',restored);}},
  };
}
