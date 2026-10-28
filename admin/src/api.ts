import {createClient} from '@supabase/supabase-js';
import config from './public-config.json';
const defaults=import.meta.env.MODE==='production'?config:null;
const url=import.meta.env.VITE_SUPABASE_URL||defaults?.supabaseUrl;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY||defaults?.supabasePublishableKey;
export const auth=url&&key?createClient(url,key,{auth:{persistSession:true,storage:sessionStorage,storageKey:'manhunt-admin-auth',autoRefreshToken:true,detectSessionInUrl:false}}):null;
const base=(import.meta.env.VITE_API_URL||defaults?.apiUrl||'').replace(/\/$/,'');
export async function api<T=any>(path:string,ticket:string|null,options:RequestInit={}):Promise<T>{
 const {data}=auth?await auth.auth.getSession():{data:{session:null}};
 const r=await fetch(`${base}/api/admin${path}`,{...options,cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(data.session?{Authorization:`Bearer ${data.session.access_token}`} :{}),...(ticket?{'x-manhunt-admin-session':ticket}:{}),...options.headers}});
 const body=await r.json().catch(()=>null);
 if(!r.ok)throw Object.assign(new Error(body?.error||'Der Verwaltungsserver ist nicht erreichbar.'),{status:r.status});
 return body as T;
}
export type Status='active'|'email_pending'|'setup_pending'|'disabled';
export interface UserAccount{id:string;email:string;username:string;role:'administrator'|'player';status:Status;setup_stage:number;source:string;created_at:string;last_sign_in_at:string|null;email_verified_at:string|null;admin_approved_at:string|null;}
export interface Directory{counts:Record<Status|'total',number>;users:UserAccount[];total:number;page:number;}
export const STATUS:Record<Status,string>={active:'Aktiv',email_pending:'E-Mail ausstehend',setup_pending:'Einrichtung ausstehend',disabled:'Deaktiviert'};
