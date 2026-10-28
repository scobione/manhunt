import {useEffect,useState} from 'react';
import {TrafficDetailView} from '../shared/TrafficView';
import type {TrafficDetail} from '../shared/traffic';
import {useApp} from './context';
export default function TrafficPanel({matchId}:{matchId:string}){
 const {api}=useApp();const [open,setOpen]=useState(false),[data,setData]=useState<TrafficDetail|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!open)return;let alive=true;const load=()=>api<TrafficDetail>('/traffic?matchId='+encodeURIComponent(matchId)).then(v=>{if(alive){setData(v);setError('');}}).catch(e=>{if(alive)setError(e.message);});void load();const timer=setInterval(load,30000);return()=>{alive=false;clearInterval(timer);};},[open,matchId,api,revision]);
 return <details className="panel traffic-panel" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Datenverbrauch dieses Matches</summary>{open&&<>{error&&<p role="alert">{error}</p>}{data?<TrafficDetailView data={data}/>:!error&&<p role="status">Verbrauch wird geladen…</p>}<button className="button" onClick={()=>setRevision(v=>v+1)}>Verbrauch aktualisieren</button></>}</details>;
}
