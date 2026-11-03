import {createContext,useContext,useEffect,useState} from 'react';
import type {useMatchLocation} from './useMatchLocation';
import type {AccountState} from '../shared/accounts';
import type {Command,LobbyView,Profile} from '../shared/types';
interface Config { configured:boolean; authConfigured:boolean; pushPublicKey?:string; transport?:'http'|'socket';accountControls?:boolean }
export interface AppContextValue {
  gps:ReturnType<typeof useMatchLocation>;
  account:AccountState|null;accountChecking:boolean;refreshAccount:()=>Promise<void>;profile:Profile|null; token:string|null; lobby:LobbyView|null; connected:boolean; loading:boolean; config:Config|null;
  identity:{id:string;email?:string;isGuest?:boolean}|null; authChecking:boolean; authError:string;authCallbackError:boolean;
  reauthenticateAfterPasswordChange:(email:string,password:string)=>Promise<boolean>; passwordRecovery:boolean; finishPasswordRecovery:()=>void; clearAuthError:()=>void;
  notice:string; clearNotice:()=>void; notify:(message:string)=>void; api:<T=any>(path:string,options?:RequestInit)=>Promise<T>;
  emit:<T=LobbyView>(event:string,data?:unknown)=>Promise<T>; command:(command:Command)=>Promise<LobbyView>;
  logout:()=>Promise<void>; refreshProfile:()=>Promise<void>; setTestSession:(id:string,name:string)=>void; socialRevision:number;
}
export const AppContext=createContext<AppContextValue|null>(null);
export function useApp(){const value=useContext(AppContext);if(!value)throw new Error('AppProvider missing');return value;}
export function useNow(){const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);return now;}
export const formatTime=(seconds:number)=>{const n=Math.max(0,Math.ceil(seconds));return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;};
