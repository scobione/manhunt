import {useEffect,useRef,useState} from 'react';
import {useApp} from './game-context';
import {DEFAULT_PROFILE_CUSTOMIZATION,type ProfileCustomization} from '../shared/profiles';
export const customizationEvent='manhunt:profile-customization';
export function customizationChanged(user:string,value:ProfileCustomization){window.dispatchEvent(new CustomEvent(customizationEvent,{detail:{user,value}}));}
export function useProfileCustomization(){
 const {api,profile}=useApp(),[data,setData]=useState<{user:string;value:ProfileCustomization}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),generation=useRef(0);
 useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent<{user:string;value:ProfileCustomization}>).detail;if(detail?.user===profile?.id){generation.current++;setData({user:detail.user,value:detail.value});setError('');}else if(!detail){generation.current++;setRevision(v=>v+1);}};window.addEventListener(customizationEvent,changed);return()=>window.removeEventListener(customizationEvent,changed);},[profile?.id]);
 useEffect(()=>{if(!profile)return;let active=true;const startedAt=generation.current;setError('');void api<ProfileCustomization>('/profile/customization').then(value=>{if(active&&startedAt===generation.current)setData({user:profile.id,value});}).catch(e=>{if(active&&startedAt===generation.current)setError(e.message);});return()=>{active=false;};},[api,profile?.id,revision]);
 return{value:data?.user===profile?.id?data!.value:DEFAULT_PROFILE_CUSTOMIZATION,loading:!data||data.user!==profile?.id,error,retry:()=>setRevision(v=>v+1)};
}
