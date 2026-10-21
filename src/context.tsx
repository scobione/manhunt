import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { io, type Socket } from 'socket.io-client';
import type { Command, LobbyView, Profile } from '../shared/types';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase:SupabaseClient|null = supabaseUrl && supabaseKey ? createClient(supabaseUrl,supabaseKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
export const TEST_MODE = import.meta.env.MODE === 'test' && import.meta.env.VITE_TEST_AUTH === 'true';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/,'');
interface Config { configured:boolean; authConfigured:boolean; pushPublicKey?:string }
interface AppContextValue {
  profile:Profile|null; token:string|null; lobby:LobbyView|null; connected:boolean; loading:boolean; config:Config|null;
  notice:string; clearNotice:()=>void; notify:(message:string)=>void; api:<T=any>(path:string,options?:RequestInit)=>Promise<T>;
  emit:<T=LobbyView>(event:string,data?:unknown)=>Promise<T>; command:(command:Command)=>Promise<LobbyView>;
  login:()=>Promise<void>; logout:()=>Promise<void>; refreshProfile:()=>Promise<void>; setTestSession:(id:string,name:string)=>void; socialRevision:number;
}
const AppContext=createContext<AppContextValue|null>(null);
export function AppProvider({children}:{children:ReactNode}) {
 const [profile,setProfile]=useState<Profile|null>(null), [token,setToken]=useState<string|null>(TEST_MODE?sessionStorage.getItem('manhunt:test-token'):null);
 const [lobby,setLobby]=useState<LobbyView|null>(null),[connected,setConnected]=useState(false),[loading,setLoading]=useState(true),[config,setConfig]=useState<Config|null>(null),[notice,setNotice]=useState(''),[socialRevision,setSocialRevision]=useState(0);
 const socketRef=useRef<Socket|null>(null);const lastEvent=useRef<string|null>(null); const tokenRef=useRef(token); tokenRef.current=token;
 const notify=useCallback((message:string)=>setNotice(message),[]);
 const api=useCallback(async <T,>(path:string,options:RequestInit={}):Promise<T>=>{
   const response=await fetch(`${API_BASE}/api${path}`,{...options,headers:{'Content-Type':'application/json',...(tokenRef.current?{Authorization:`Bearer ${tokenRef.current}`} : {}),...options.headers}});
   const body=await response.json().catch(()=>null);
   if(!response.ok) throw new Error(body?.error||'Der Server ist gerade nicht erreichbar. Bitte versuche es erneut.');
   return body as T;
 },[]);
 const refreshProfile=useCallback(async()=>{ if(tokenRef.current) setProfile(await api<Profile>('/profile')); },[api]);
 useEffect(()=>{
  fetch(`${API_BASE}/api/config`).then(r=>r.ok?r.json():Promise.reject()).then(setConfig).catch(()=>setConfig({configured:false,authConfigured:!!supabase}));
  if(TEST_MODE && sessionStorage.getItem('manhunt:test-token')) {setLoading(false);return;}
  if(!supabase){setLoading(false);return;}
  supabase.auth.getSession().then(({data})=>{setToken(data.session?.access_token||null);setLoading(false);});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setToken(session?.access_token||null);setLoading(false);});
  return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{
  if(!token){setProfile(null);setLobby(null);setConnected(false);return;}
  let cancelled=false;
  refreshProfile().catch(e=>!cancelled&&notify(e.message));
  const socket=io(API_BASE||window.location.origin,{auth:{token},reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:10000,timeout:20000});socketRef.current=socket;
  socket.on('connect',()=>{setConnected(true);socket.emit('lobby:sync',{},(response:any)=>{if(response?.ok)setLobby(response.data??null);});});
  socket.on('disconnect',()=>setConnected(false));
  socket.on('connect_error',(error)=>{setConnected(false);notify(`Verbindung unterbrochen: ${error.message}`);});
  socket.on('auth:expired',()=>{setConnected(false);if(supabase)void supabase.auth.refreshSession().then(({data,error})=>{if(error||!data.session){setToken(null);notify('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');}else setToken(data.session.access_token);});else setToken(null);});
  socket.on('account:deleted',()=>{sessionStorage.removeItem('manhunt:test-token');setToken(null);setProfile(null);setLobby(null);});
  socket.on('lobby:state',(state:LobbyView|null)=>{setLobby(state?.status==='closed'?null:state);const latest=state?.events.at(-1);if(latest&&latest.id!==lastEvent.current){if(lastEvent.current&&state?.settings.notifications&&['capture','infection','match_finished','emergency_pause','disconnect_pause'].includes(latest.type))notify(latest.message);lastEvent.current=latest.id;}});
  socket.on('lobby:left',()=>setLobby(null));
  socket.on('social:changed',()=>setSocialRevision(v=>v+1));
  socket.on('notice',(data:{message:string})=>notify(data.message));
  return()=>{cancelled=true;socket.disconnect();socketRef.current=null;};
 },[token,refreshProfile,notify]);
 const emit=useCallback(<T,>(event:string,data:unknown={}):Promise<T>=>new Promise((resolve,reject)=>{
  const socket=socketRef.current;if(!socket?.connected){reject(new Error('Keine Serververbindung. Warte auf die Wiederverbindung.'));return;}
  socket.timeout(15000).emit(event,data,(timeout:Error|null,result:any)=>{
   if(timeout){reject(new Error('Der Server antwortet noch nicht. Bei einem kostenlosen Server kann der Start etwa eine Minute dauern.'));return;}
   if(!result?.ok){reject(new Error(result?.error||'Aktion konnte nicht ausgeführt werden.'));return;}
   if(event==='lobby:command' && ['leave','close'].includes((data as any).command?.type))setLobby(null);
   else if(result.data?.code&&result.data?.self)setLobby(result.data);
   resolve(result.data as T);
  });
 }),[]);
 const command=useCallback((command:Command)=>emit<LobbyView>('lobby:command',{command}),[emit]);
 async function login(){if(!supabase)throw new Error('Google-Anmeldung ist noch nicht eingerichtet. Supabase und Google OAuth müssen verbunden werden.');const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/auth/callback`}});if(error)throw error;}
 async function logout(){if(lobby && lobby.status!=='finished')await command({type:'leave'});if(supabase)await supabase.auth.signOut();sessionStorage.removeItem('manhunt:test-token');setToken(null);setProfile(null);setLobby(null);}
 function setTestSession(id:string,name:string){if(!TEST_MODE)return;const value=`test:${id}:${name}`;sessionStorage.setItem('manhunt:test-token',value);setToken(value);}
 return <AppContext.Provider value={{profile,token,lobby,connected,loading,config,notice,clearNotice:()=>setNotice(''),notify,api,emit,command,login,logout,refreshProfile,setTestSession,socialRevision}}>{children}</AppContext.Provider>;
}
export function useApp(){const value=useContext(AppContext);if(!value)throw new Error('AppProvider missing');return value;}
export function useNow(){const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);return now;}
export const formatTime=(seconds:number)=>{const n=Math.max(0,Math.ceil(seconds));return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;};
