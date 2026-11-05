import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Bookmark,Save} from 'lucide-react';
import {useApp} from './game-context';
import type {Settings as GameSettings,Zone} from '../shared/types';
import type {SavedGameZone} from '../shared/community';
import './community.css';
export function SavedZonePicker({value,onSelect}:{value?:Zone|null;onSelect:(zone:Zone,settings?:GameSettings|null)=>void}){
 const {api,profile,identity,token}=useApp();const [zones,setZones]=useState<SavedGameZone[]>([]),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState('');
 const registered=!!profile&&!identity?.isGuest&&!!token;
 useEffect(()=>{if(!registered)return;let active=true;api<{zones:SavedGameZone[]}>('/library/zones').then(v=>{if(active)setZones(v.zones);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,registered,profile?.id]);
 if(!registered)return null;
 return <section className="saved-zone-picker"><div className="panel-heading"><h3><Bookmark size={16}/> Deine Bibliothek</h3><Link to="/library" className="text-link">Öffnen</Link></div>{error&&<p role="status" className="form-error">{error}</p>}<label>Zone aus Bibliothek<select value={selected} onChange={event=>{setSelected(event.target.value);const item=zones.find(z=>z.id===event.target.value);if(item){onSelect({...item.zone,confirmed:false},item.settings);setStatus('Zone geladen. Prüfe das Gebiet und bestätige die Sicherheit erneut.');}}}><option value="">Zone auswählen</option>{zones.map(z=><option key={z.id} value={z.id}>{z.favorite?'★ ':''}{z.name}</option>)}</select></label>{value&&<button type="button" className="button" disabled={busy} onClick={async()=>{setBusy(true);try{const existing=zones.find(z=>z.id===selected);const saved=await api<SavedGameZone>(existing?'/library/zones/'+existing.id:'/library/zones',{method:existing?'PATCH':'POST',body:JSON.stringify({id:existing?.id,name:value.name,zone:value,settings:existing?.settings??null,favorite:existing?.favorite??false,tags:existing?.tags??[]})});setZones(v=>[saved,...v.filter(z=>z.id!==saved.id)]);setSelected(saved.id);setStatus(existing?'Zone in deiner Bibliothek aktualisiert.':'Zone in deiner Bibliothek gespeichert.');setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><Save size={16}/> {selected?'Zone in Bibliothek aktualisieren':'In Bibliothek speichern'}</button>}<p role="status" className="fineprint">{status}</p></section>;
}
