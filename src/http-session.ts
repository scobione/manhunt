import type { LobbyView } from '../shared/types';

interface Sync { lobby:LobbyView|null;socialRevision:number;serverTime:number }
interface Options {
  request:<T>(path:string,options?:RequestInit)=>Promise<T>;
  onState:(state:LobbyView|null)=>void;
  onSocial:()=>void;
  onConnection:(connected:boolean)=>void;
  onExpired:()=>void;
}
/** Commands and polls share one queue: an older poll cannot overwrite a later
 * leave/capture response. Mutations are never blindly retried after a timeout.
 */
export function httpSession({request,onState,onSocial,onConnection,onExpired}:Options){
  let closed=false,timer:ReturnType<typeof setTimeout>|undefined,social:number|undefined;
  let queue:Promise<unknown>=Promise.resolve();
  const accept=(result:Sync)=>{if(closed)return;onConnection(true);onState(result.lobby);if(social!==result.socialRevision){social=result.socialRevision;onSocial();}};
  const enqueue=<T>(fn:()=>Promise<T>)=>{const next=queue.then(()=>{if(closed)throw new Error('Verbindung beendet.');return fn();});queue=next.catch(()=>{});return next;};
  const failed=(error:unknown)=>{if(closed)return;onConnection(false);if((error as {status?:number}).status===401)onExpired();};
  const poll=async()=>{
    try{await enqueue(async()=>accept(await request<Sync>('/sync')));}catch(error){failed(error);}
    if(!closed)timer=setTimeout(poll,2000);
  };
  void poll();
  return {
    send:<T=LobbyView>(event:string,data:unknown={})=>enqueue(async()=>{
      try{const result=await request<Sync>('/events',{method:'POST',body:JSON.stringify({event,data})});accept(result);return result.lobby as T;}
      catch(error){failed(error);throw error;}
    }),
    close:()=>{closed=true;clearTimeout(timer);},
  };
}
