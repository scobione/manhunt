import {trafficAllowed,useTrafficConsent} from './traffic-consent';
import {useMatchLocation} from './useMatchLocation';
import {beginTraffic,startTraffic,socketTraffic} from './traffic-meter';
import type {AccountState} from '../shared/accounts';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { io, type Socket } from 'socket.io-client';
import type { Command, LobbyView, Profile } from '../shared/types';
import publicConfig from './public-config.json';
import { readAuthReturn, authInitializationMessage, clearAuthReturn } from './auth-return';
import { httpSession } from './http-session';
// Capture only safe metadata before the SDK consumes the callback URL.
const authReturn=readAuthReturn(window.location.href);
const defaults = import.meta.env.MODE === 'production' ? publicConfig : null;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaults?.supabaseUrl;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (!import.meta.env.VITE_SUPABASE_URL ? defaults?.supabasePublishableKey : undefined);
export const supabase:SupabaseClient|null = supabaseUrl && supabaseKey ? createClient(supabaseUrl,supabaseKey,{auth:{flowType:authReturn.recoveryFragment?'implicit':'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:authReturn.callback}}) : null;
// Capture the SDK event even when it fires before React mounts. Store only a
// user-bound recovery intent, never a password or recovery token.
const recoveryKey='manhunt:password-recovery-user';
function writeRecoveryUser(id:string|null){try{if(id)sessionStorage.setItem(recoveryKey,id);else sessionStorage.removeItem(recoveryKey);}catch{/* Private browsing may deny storage. */}}
function readRecoveryUser(){try{return sessionStorage.getItem(recoveryKey);}catch{return null;}}
let recoveryUser:string|null=null;
supabase?.auth.onAuthStateChange((event,session)=>{
 if(event==='PASSWORD_RECOVERY'&&session){recoveryUser=session.user.id;writeRecoveryUser(recoveryUser);}
 if(event==='SIGNED_OUT'){recoveryUser=null;writeRecoveryUser(null);}
});
export const TEST_MODE = import.meta.env.MODE === 'test' && import.meta.env.VITE_TEST_AUTH === 'true';
const API_BASE = (import.meta.env.VITE_API_URL || defaults?.apiUrl || '').replace(/\/$/,'');
interface Config { configured:boolean; authConfigured:boolean; pushPublicKey?:string; transport?:'http'|'socket';accountControls?:boolean }
interface AppContextValue {
  gps:ReturnType<typeof useMatchLocation>;
  account:AccountState|null;accountChecking:boolean;refreshAccount:()=>Promise<void>;profile:Profile|null; token:string|null; lobby:LobbyView|null; connected:boolean; loading:boolean; config:Config|null;
  identity:{id:string;email?:string;isGuest?:boolean}|null; authChecking:boolean; authError:string;authCallbackError:boolean;
  reauthenticateAfterPasswordChange:(email:string,password:string)=>Promise<boolean>; passwordRecovery:boolean; finishPasswordRecovery:()=>void; clearAuthError:()=>void;
  notice:string; clearNotice:()=>void; notify:(message:string)=>void; api:<T=any>(path:string,options?:RequestInit)=>Promise<T>;
  emit:<T=LobbyView>(event:string,data?:unknown)=>Promise<T>; command:(command:Command)=>Promise<LobbyView>;
  logout:()=>Promise<void>; refreshProfile:()=>Promise<void>; setTestSession:(id:string,name:string)=>void; socialRevision:number;
}
const AppContext=createContext<AppContextValue|null>(null);
export function AppProvider({children}:{children:ReactNode}) {
 const [profile,setProfile]=useState<Profile|null>(null), [token,setToken]=useState<string|null>(TEST_MODE?sessionStorage.getItem('manhunt:test-token'):null);
 const [lobby,setLobby]=useState<LobbyView|null>(null),[connected,setConnected]=useState(false),[loading,setLoading]=useState(true),[config,setConfig]=useState<Config|null>(null),[notice,setNotice]=useState(''),[socialRevision,setSocialRevision]=useState(0);
 const [identity,setIdentity]=useState<{id:string;email?:string;isGuest?:boolean}|null>(null),[authChecking,setAuthChecking]=useState(false),[authError,setAuthError]=useState('');
 const [authCallbackError,setAuthCallbackError]=useState(false);
 const [passwordRecovery,setPasswordRecovery]=useState(authReturn.recovery);
 const [account,setAccount]=useState<AccountState|null>(null),[accountChecking,setAccountChecking]=useState(false);
 const accountRefreshPending=useRef(false);const initializationError=useRef('');
 const socketRef=useRef<Socket|null>(null);const lastEvent=useRef<string|null>(null); const tokenRef=useRef(token); tokenRef.current=token;
 const httpRef=useRef<ReturnType<typeof httpSession>|null>(null);
 const notify=useCallback((message:string)=>setNotice(message),[]);
 const api=useCallback(async <T,>(path:string,options:RequestInit={}):Promise<T>=>{
   const measured=beginTraffic(`${API_BASE}/api${path}`,options.body);
   const response=await fetch(`${API_BASE}/api${path}`,{signal:AbortSignal.timeout(15000),...options,headers:{'Content-Type':'application/json',...(tokenRef.current?{Authorization:`Bearer ${tokenRef.current}`} : {}),...options.headers}});
   const text=await response.text();measured(text);let body:any=null;try{body=JSON.parse(text);}catch{/* Keep the existing friendly API error. */}
   if(!response.ok&&[403,428].includes(response.status)&&tokenRef.current&&!accountRefreshPending.current){accountRefreshPending.current=true;void fetch(`${API_BASE}/api/account`,{headers:{Authorization:`Bearer ${tokenRef.current}`}}).then(r=>r.ok?r.json():null).then(v=>{if(v)setAccount(v);}).catch(()=>{}).finally(()=>{accountRefreshPending.current=false;});}
   if(!response.ok) throw Object.assign(new Error(body?.error||'Der Server ist gerade nicht erreichbar. Bitte versuche es erneut.'),{status:response.status});
   return body as T;
 },[]);
 const trafficConsent=useTrafficConsent(profile?.id);
 useEffect(()=>{
  if(!trafficConsent||!profile?.id||!lobby?.startedAt||!['active','preparing','paused'].includes(lobby.status))return;
  const userId=profile.id;
  const meter=startTraffic(lobby.id,API_BASE,(report,signal)=>api('/traffic',{method:'POST',body:JSON.stringify(report),signal}),()=>trafficAllowed(userId));
  return()=>meter?.cancel();
 },[trafficConsent,profile?.id,lobby?.id,!!lobby?.startedAt,lobby?.status==='finished'||lobby?.status==='closed',api]);
 const reauthenticateAfterPasswordChange=useCallback(async(email:string,password:string)=>{
  if(!supabase)return false;
  try{
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error||!data.session)throw error||new Error('No session');
   tokenRef.current=data.session.access_token;setToken(data.session.access_token);initializationError.current='';setAuthError('');setAuthCallbackError(false);
   recoveryUser=null;writeRecoveryUser(null);setPasswordRecovery(false);
   return true;
  }catch{
   await supabase.auth.signOut({scope:'local'}).catch(()=>{});
   tokenRef.current=null;setToken(null);setAccount(null);setIdentity(null);setProfile(null);setLobby(null);
   setAuthError('Dein neues Passwort ist gespeichert. Bitte melde dich damit erneut an.');
   notify('Dein neues Passwort ist gespeichert. Bitte melde dich damit erneut an.');
   return false;
  }
 },[notify]);
 const refreshAccount=useCallback(async()=>{if(tokenRef.current)setAccount(await api<AccountState>('/account'));},[api]);
 useEffect(()=>{setAccount(null);if(!token||!config?.accountControls){setAccountChecking(false);return;}let active=true;setAccountChecking(true);api<AccountState>('/account').then(v=>{if(active)setAccount(v);}).catch(e=>{if(active)notify(e.message);}).finally(()=>{if(active)setAccountChecking(false);});return()=>{active=false;};},[token,config?.accountControls,api,notify]);
 const refreshProfile=useCallback(async()=>{ if(tokenRef.current) setProfile(await api<Profile>('/profile')); },[api]);
 useEffect(()=>{
  fetch(`${API_BASE}/api/config`).then(r=>r.ok?r.json():Promise.reject()).then(setConfig).catch(()=>setConfig({configured:false,authConfigured:!!supabase}));
  if(TEST_MODE && sessionStorage.getItem('manhunt:test-token')) {setLoading(false);return;}
  if(!supabase){setLoading(false);return;}
  let active=true;
  // getSession() waits for initialization but does not return its OAuth error.
  // Read initialize() explicitly so provider and code-exchange failures survive.
  void (async()=>{
   const initialized=await supabase.auth.initialize();
   const {data,error}=await supabase.auth.getSession();
   if(!active)return;
   setToken(data.session?.access_token||null);
   initializationError.current=authInitializationMessage(authReturn,initialized.error||error,!!data.session);
   setAuthError(initializationError.current);
   if(data.session&&!initializationError.current&&(authReturn.recovery||recoveryUser===data.session.user.id||readRecoveryUser()===data.session.user.id)){writeRecoveryUser(data.session.user.id);setPasswordRecovery(true);}
   setAuthCallbackError(!!initializationError.current&&authReturn.callback);
   clearAuthReturn();setLoading(false);
  })().catch(()=>{if(active){setAuthError('Die Anmeldung konnte nicht überprüft werden. Prüfe deine Verbindung und versuche es erneut.');clearAuthReturn();setLoading(false);}});
  const {data}=supabase.auth.onAuthStateChange((event,session)=>{setToken(session?.access_token||null);if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true);if(event==='SIGNED_OUT')setPasswordRecovery(false);});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!token||!supabase){setIdentity(null);setAuthChecking(false);return;}
  let active=true;
  setAuthChecking(true);setIdentity(null);setAuthError(initializationError.current);
  supabase.auth.getUser(token).then(({data,error})=>{
   if(!active)return;
   if(error||!data.user){setAuthError('Deine Sitzung konnte nicht bestätigt werden. Bitte melde dich erneut an.');return;}
   setIdentity({id:data.user.id,email:data.user.email,isGuest:!!data.user.is_anonymous});
  }).catch(()=>{if(active)setAuthError('Die Sitzung konnte nicht überprüft werden. Prüfe deine Verbindung und versuche es erneut.');}).finally(()=>{if(active)setAuthChecking(false);});
  return()=>{active=false;};
 },[token]);
 useEffect(()=>{
  if(!token||!config?.configured||config.accountControls&&(!account||account.disabled||account.setupStage!==3)){setProfile(null);setLobby(null);setConnected(false);return;}
  let cancelled=false;
  refreshProfile().catch(e=>!cancelled&&notify(e.message));
  if(config.transport==='http'){
   let refreshing=false;
   const session=httpSession({request:api,onConnection:setConnected,onSocial:()=>setSocialRevision(v=>v+1),onState:state=>{
    setLobby(state?.status==='closed'?null:state);
    const latest=state?.events.at(-1);if(latest&&latest.id!==lastEvent.current){if(lastEvent.current&&state?.settings.notifications&&['capture','infection','match_finished'].includes(latest.type))notify(latest.message);lastEvent.current=latest.id;}
   },onExpired:()=>{if(refreshing||!supabase)return;refreshing=true;void supabase.auth.refreshSession().then(({data,error})=>{if(cancelled)return;if(error||!data.session){setToken(null);notify('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');}else setToken(data.session.access_token);}).finally(()=>{refreshing=false;});}});
   httpRef.current=session;
   return()=>{cancelled=true;session.close();httpRef.current=null;};
  }
  const socket=io(API_BASE||window.location.origin,{auth:{token},reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:10000,timeout:20000});socketRef.current=socket;
  socket.onAny((event,...args)=>socketTraffic({event,args},'down'));
  socket.onAnyOutgoing((event,...args)=>socketTraffic({event,args},'up'));
  socket.on('connect',()=>{setConnected(true);socket.emit('lobby:sync',{},(response:any)=>{if(response?.ok)setLobby(response.data??null);});});
  socket.on('disconnect',()=>setConnected(false));
  socket.on('connect_error',(error)=>{setConnected(false);notify(`Verbindung unterbrochen: ${error.message}`);});
  socket.on('auth:expired',()=>{setConnected(false);if(supabase)void supabase.auth.refreshSession().then(({data,error})=>{if(error||!data.session){setToken(null);notify('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');}else setToken(data.session.access_token);});else setToken(null);});
  socket.on('account:deleted',()=>{sessionStorage.removeItem('manhunt:test-token');setToken(null);setProfile(null);setLobby(null);});
  socket.on('lobby:state',(state:LobbyView|null)=>{setLobby(state?.status==='closed'?null:state);const latest=state?.events.at(-1);if(latest&&latest.id!==lastEvent.current){if(lastEvent.current&&state?.settings.notifications&&['capture','infection','match_finished'].includes(latest.type))notify(latest.message);lastEvent.current=latest.id;}});
  socket.on('lobby:left',()=>setLobby(null));
  socket.on('social:changed',()=>setSocialRevision(v=>v+1));
  socket.on('notice',(data:{message:string})=>notify(data.message));
  return()=>{cancelled=true;socket.disconnect();socketRef.current=null;};
 },[token,refreshProfile,notify,api,config?.configured,config?.transport,config?.accountControls,account?.setupStage,account?.disabled,!!account]);
 const emit=useCallback(<T,>(event:string,data:unknown={}):Promise<T>=>new Promise((resolve,reject)=>{
  if(httpRef.current){httpRef.current.send<T>(event,data).then(resolve,reject);return;}
  const socket=socketRef.current;if(!socket?.connected){reject(new Error('Keine Serververbindung. Warte auf die Wiederverbindung.'));return;}
  socket.timeout(15000).emit(event,data,(timeout:Error|null,result:any)=>{
   if(!timeout)socketTraffic(result,'down');
   if(timeout){reject(new Error('Der Server antwortet noch nicht. Bei einem kostenlosen Server kann der Start etwa eine Minute dauern.'));return;}
   if(!result?.ok){reject(new Error(result?.error||'Aktion konnte nicht ausgeführt werden.'));return;}
   if(event==='lobby:command' && ['leave','close'].includes((data as any).command?.type))setLobby(null);
   else if(result.data?.code&&result.data?.self)setLobby(result.data);
   resolve(result.data as T);
  });
 }),[]);
 const command=useCallback((command:Command)=>emit<LobbyView>('lobby:command',{command}),[emit]);
 const gps=useMatchLocation(lobby,connected,command,notify);

 async function logout(){if(tokenRef.current&&profile){const {detachPush}=await import('./push-client');await detachPush(api);}if(lobby && lobby.status!=='finished')await command({type:'leave'});if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}sessionStorage.removeItem('manhunt:test-token');setToken(null);setIdentity(null);setProfile(null);setLobby(null);setAccount(null);initializationError.current='';setAuthError('');setAuthCallbackError(false);}
 function setTestSession(id:string,name:string){if(!TEST_MODE)return;const value=`test:${id}:${name}`;sessionStorage.setItem('manhunt:test-token',value);setToken(value);}
 return <AppContext.Provider value={{gps,account,accountChecking,refreshAccount,reauthenticateAfterPasswordChange,profile,token,lobby,connected,loading,identity,authChecking,authError,authCallbackError,passwordRecovery,finishPasswordRecovery:()=>{recoveryUser=null;writeRecoveryUser(null);setPasswordRecovery(false);},clearAuthError:()=>{initializationError.current='';setAuthError('');setAuthCallbackError(false);},config,notice,clearNotice:()=>setNotice(''),notify,api,emit,command,logout,refreshProfile,setTestSession,socialRevision}}>{children}</AppContext.Provider>;
}
export function useApp(){const value=useContext(AppContext);if(!value)throw new Error('AppProvider missing');return value;}
export function useNow(){const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);return now;}
export const formatTime=(seconds:number)=>{const n=Math.max(0,Math.ceil(seconds));return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;};
