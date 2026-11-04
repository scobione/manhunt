import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {Check,Eye,EyeOff,Lock,Trophy,X} from 'lucide-react';
import {useApp} from './game-context';
import {badgeLabel,badgeProgress,ROMAN_LEVELS,type BadgeOverview,type EquippedBadge,type PlayerBadge} from '../shared/achievements';
import './features.css';
import './profile-badges.css';

type BadgeDisplay=EquippedBadge&{description?:string;unlockedAt?:string|null;progress?:number;thresholds?:number[];unit?:string;stageNames?:string[]};
const appearanceEvent='manhunt:badge-appearance';
const palettes={flask:['#b58aff','#6b38f0','#6df6ef'],hunter:['#ff9a66','#d43d63','#ffe093'],shield:['#62e6e5','#168dbb','#a4fff2'],trophy:['#ffe391','#cd7c21','#fff4cd'],pin:['#fd9cfa','#a748e1','#8be7ff']} as const;
function displayBadge(b:PlayerBadge):BadgeDisplay{return{...b,stageName:b.stageNames[b.level-1]??b.name};}
function visibleIds(data:BadgeOverview){return (data as BadgeOverview&{visibleBadgeIds?:string[]}).visibleBadgeIds??data.badges.filter(b=>b.level>0).map(b=>b.id);}

/** Original vector emblems: gradients live inside SVG, never in a remote image. */
export function BadgeArt({badge,locked=false}:{badge:Pick<EquippedBadge,'icon'|'level'>;locked?:boolean}){
 const uid=useId().replace(/:/g,''),[light,dark,accent]=palettes[badge.icon]??palettes.shield;
 return <svg className={`badge-art${locked?' badge-art-locked':''}`} viewBox="0 0 72 80" fill="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id={`${uid}-body`} x1="13" y1="6" x2="60" y2="76" gradientUnits="userSpaceOnUse"><stop stopColor={light}/><stop offset=".53" stopColor={dark}/><stop offset="1" stopColor={accent}/></linearGradient><linearGradient id={`${uid}-face`} x1="20" y1="12" x2="54" y2="68" gradientUnits="userSpaceOnUse"><stop stopColor="#26313e"/><stop offset="1" stopColor="#090d19"/></linearGradient><linearGradient id={`${uid}-shine`} x1="24" y1="20" x2="49" y2="55"><stop stopColor="#fff"/><stop offset="1" stopColor={accent}/></linearGradient></defs>
  <path d="M36 2 63 14 68 43 57 63 36 78 15 63 4 43 9 14Z" fill={`url(#${uid}-body)`}/>
  <path d="m36 7 23 10 5 25-10 18-18 13-18-13L8 42l5-25Z" fill={`url(#${uid}-face)`} stroke={light} strokeOpacity=".65"/>
  <path d="m15 20 21-9 21 9M13 41l8 16 15 11 15-11 8-16" stroke={accent} strokeOpacity=".25"/>
  <path d="m10 17 26-11 25 11-1 7-24-9-25 9Z" fill="#fff" fillOpacity=".1"/>
  <g stroke={`url(#${uid}-shine)`} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
   {badge.icon==='flask'&&<><path d="M29 23h14M32 24v11L22 50a5 5 0 0 0 4 8h20a5 5 0 0 0 4-8L40 35V24"/><path d="M27 45h18l5 9H22Z" fill={accent} fillOpacity=".7" stroke="none"/><circle cx="32" cy="50" r="2" fill="#fff" stroke="none"/><circle cx="39" cy="41" r="1.5" fill={accent} stroke="none"/><path d="m49 23 2-4 2 4 4 2-4 2-2 4-2-4-4-2Z" fill={accent} stroke="none"/></>}
   {badge.icon==='hunter'&&<><circle cx="36" cy="40" r="14"/><circle cx="36" cy="40" r="6" fill={accent} fillOpacity=".8"/><path d="M36 20v9m0 22v9M16 40h9m22 0h9"/><path d="m26 30 20 20" strokeWidth="1" strokeOpacity=".35"/></>}
   {badge.icon==='shield'&&<><path d="m36 22 15 6v12c0 10-8 17-15 21-7-4-15-11-15-21V28Z" fill={accent} fillOpacity=".08"/><path d="m36 28 10 4v8c0 6-4 11-10 15Z" fill={accent} fillOpacity=".45" stroke="none"/><path d="m28 40 5 5 11-12"/></>}
   {badge.icon==='trophy'&&<><path d="M27 25h18v14c0 7-4 11-9 11s-9-4-9-11ZM36 50v8m-8 2h16M27 29h-7v7c0 6 5 9 10 8m15-15h7v7c0 6-5 9-10 8"/><path d="m36 29 2 4 4 .6-3 3 .7 4.4-3.7-2-3.7 2 .7-4.4-3-3 4-.6Z" fill={accent} stroke="none"/></>}
   {badge.icon==='pin'&&<><path d="M50 36c0 11-14 24-14 24S22 47 22 36a14 14 0 0 1 28 0Z" fill={accent} fillOpacity=".08"/><path d="m36 26 3.1 6.3L46 33.3l-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2 1.2-6.8-5-4.9 6.9-1Z" fill={accent} fillOpacity=".75" strokeWidth="1.5"/></>}
  </g>
  {badge.level>0&&<><path d="M24 64h24l-3 9H27Z" fill={dark}/><text x="36" y="71" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="800" fontFamily="ui-sans-serif,system-ui">{ROMAN_LEVELS[badge.level-1]??''}</text></>}
 </svg>;
}

function BadgeDetails({badge,onClose,onEquip,selected,busy=false,error=''}:{badge:BadgeDisplay;onClose:()=>void;onEquip?:(id:string|null)=>void;selected?:boolean;busy?:boolean;error?:string}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
 useEffect(()=>{const element=dialog.current,opener=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';element?.showModal();return()=>{element?.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus({preventScroll:true});};},[]);
 const owned=badge.thresholds!==undefined&&badge.progress!==undefined;
 const next=owned?badge.thresholds![badge.level]:undefined;
 return <dialog ref={dialog} className={`badge-detail badge-theme-${badge.icon}`} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target!==event.currentTarget)return;const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();}}>
  <button className="badge-detail-close" aria-label="Badge-Details schließen" onClick={onClose} autoFocus><X size={20}/></button>
  <div className="badge-detail-hero"><span className="badge-halo"/><BadgeArt badge={badge} locked={badge.level===0}/></div>
  <div className="badge-detail-copy"><span className="badge-detail-eyebrow">{badge.level?badge.id==='beta-tester'?'Einmaliges Badge':`Stufe ${ROMAN_LEVELS[badge.level-1]??badge.level} / X`:'Noch gesperrt'}</span>
   <h2 id={titleId}>{badge.level?badgeLabel(badge):badge.name}</h2>
   {badge.level>0&&badge.stageName!==badge.name&&<p className="badge-stage-name">{badge.stageName}</p>}
   <p id={descriptionId}>{badge.description||badge.stageName}</p>
   {owned&&<div className="badge-detail-progress"><div><strong>{badge.level===10?'Maximale Stufe erreicht':badge.id==='beta-tester'&&badge.level?'Freigeschaltet':'Dein Fortschritt'}</strong>{next!==undefined&&<span>{badge.progress} / {next}</span>}</div><progress value={Math.min(badge.progress!,next??Math.max(1,badge.progress!))} max={next??Math.max(1,badge.progress!)}/>{next!==undefined&&<small>{badgeProgress({...badge,thresholds:badge.thresholds!,progress:badge.progress!,unit:badge.unit??''})}</small>}</div>}
   {badge.unlockedAt&&<p className="badge-unlocked-date"><Check size={14}/> Freigeschaltet am {new Date(badge.unlockedAt).toLocaleDateString('de-DE')}</p>}
   {badge.level===0&&<p className="badge-locked-explanation"><Lock size={16}/> Erfülle die Voraussetzung, um dieses Badge freizuschalten.</p>}
   {onEquip&&badge.level>0&&<button className={`button full ${selected?'':'primary'}`} disabled={busy} onClick={()=>onEquip(selected?null:badge.id)}>{selected?'Profil-Badge abwählen':'Als Profil-Badge verwenden'}</button>}
   {error&&<p role="alert" className="form-error">{error}</p>}
  </div>
 </dialog>;
}

export function BadgeStrip({badges,label='Badges'}:{badges:readonly BadgeDisplay[];label?:string}){
 const [opened,setOpened]=useState<string|null>(null);const badge=badges.find(b=>b.id===opened);
 return <><div className="profile-badge-strip" role="group" aria-label={label}>{badges.map(b=><button key={b.id} type="button" className={`badge-icon-button badge-theme-${b.icon}`} aria-label={badgeLabel(b)} title={badgeLabel(b)} onClick={()=>setOpened(b.id)}><BadgeArt badge={b}/></button>)}</div>{badge&&<BadgeDetails badge={badge} onClose={()=>setOpened(null)}/>}</>;
}

/** A single selected emblem remains available in compact lobby/player rows. */
export function ProfileBadge({badge}:{badge?:EquippedBadge|null}){
 const [opened,setOpened]=useState(false);if(!badge)return null;
 return <><button type="button" className={`profile-badge badge-theme-${badge.icon}`} title={badgeLabel(badge)} aria-label={badgeLabel(badge)} onClick={()=>setOpened(true)}><BadgeArt badge={badge}/><span>{badgeLabel(badge)}</span></button>{opened&&<BadgeDetails badge={badge} onClose={()=>setOpened(false)}/>}</>;
}

function useBadgeOverview(){
 const {api,profile}=useApp();const [data,setData]=useState<BadgeOverview|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener(appearanceEvent,refresh);window.addEventListener('manhunt:badges-changed',refresh);return()=>{window.removeEventListener(appearanceEvent,refresh);window.removeEventListener('manhunt:badges-changed',refresh);};},[]);
 useEffect(()=>{let active=true;setError('');void api<BadgeOverview>('/badges').then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,profile?.id,revision]);
 return{data,setData,error,setError,retry:()=>setRevision(v=>v+1)};
}
export function OwnProfileBadges(){
 const {data,error,retry}=useBadgeOverview();
 if(error)return <div className="badge-strip-error" role="status">Badges konnten nicht geladen werden. <button onClick={retry}>Erneut laden</button></div>;
 if(!data)return <span className="badge-strip-loading" role="status">Badges werden geladen…</span>;
 const shown=data.badges.filter(b=>b.level>0&&visibleIds(data).includes(b.id)).map(displayBadge);
 return shown.length?<BadgeStrip badges={shown}/>:<p className="badge-strip-empty">Noch keine sichtbaren Badges</p>;
}

export function BadgeBoard(){
 const {api,refreshProfile}=useApp();const {data,setData,error,setError,retry}=useBadgeOverview();const [opened,setOpened]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const badge=data?.badges.find(b=>b.id===opened);
 async function equip(id:string|null){if(busy)return;setBusy(true);try{setData(await api('/badges/selected',{method:'PATCH',body:JSON.stringify({badgeId:id})}));await refreshProfile();setError('');window.dispatchEvent(new Event(appearanceEvent));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="badge-collection"><div className="badge-collection-heading"><h3>Deine Sammlung</h3><span>{data?.badges.filter(b=>b.level>0).length??0} / {data?.badges.length??5}</span></div>
  {error&&<p role="alert" className="form-error">{error} <button className="text-link" onClick={retry}>Erneut laden</button></p>}
  {!data&&!error&&<p role="status">Badges werden geladen…</p>}
  {data&&!data.registered&&<p className="fineprint">Dauerhafte Badges benötigen ein registriertes Konto.</p>}
  <div className="badge-collection-grid">{data?.badges.map(b=><button type="button" key={b.id} className={`badge-collection-item badge-theme-${b.icon}${b.level?'':' is-locked'}`} aria-label={b.level?badgeLabel(b):`${b.name} – noch gesperrt`} onClick={()=>setOpened(b.id)}><span className="badge-collection-art"><BadgeArt badge={b} locked={b.level===0}/>{b.level===0&&<Lock size={13}/>}</span><span>{b.level?badgeLabel(b):b.name}</span></button>)}</div>
  <p className="badge-collection-hint">Tippe ein Badge an, um Stufe und Fortschritt anzusehen.</p>
  {badge&&<BadgeDetails badge={displayBadge(badge)} onClose={()=>setOpened(null)} onEquip={data?.registered?equip:undefined} selected={data?.selected?.id===badge.id} busy={busy} error={error}/>}
 </section>;
}

export function BadgeVisibilitySettings(){
 const {api,refreshProfile}=useApp();const {data,setData,error,setError,retry}=useBadgeOverview();const [saving,setSaving]=useState<string|null>(null),[status,setStatus]=useState('');
 async function toggle(id:string,visible:boolean){if(saving)return;setSaving(id);setStatus('');try{const updated=await api<BadgeOverview>('/badges/visibility',{method:'PATCH',body:JSON.stringify({badgeId:id,visible})});setData(updated);setError('');await refreshProfile();window.dispatchEvent(new Event(appearanceEvent));setStatus('Badge-Sichtbarkeit gespeichert.');}catch(e){setError((e as Error).message);}finally{setSaving(null);}}
 const unlocked=data?.badges.filter(b=>b.level>0)??[];
 return <section className="panel badge-visibility-panel"><div className="panel-heading"><div><h2>Badges im Profil</h2><p>Wähle aus, welche Badges deine Freunde sehen.</p></div><Eye size={21}/></div>
  {error&&<p role="alert" className="form-error">{error} <button className="text-link" onClick={retry}>Erneut laden</button></p>}
  {!data&&!error&&<p role="status">Badges werden geladen…</p>}
  {data&&!data.registered&&<p className="fineprint">Dauerhafte Badges benötigen ein registriertes Konto.</p>}
  {data&&data.registered&&!unlocked.length&&<p className="badge-visibility-empty"><Trophy size={18}/> Sobald du ein Badge freischaltest, kannst du es hier ein- und ausblenden.</p>}
  <div className="badge-visibility-list">{unlocked.map(b=>{const visible=visibleIds(data!).includes(b.id);return <div className={`badge-visibility-row badge-theme-${b.icon}`} key={b.id}><BadgeArt badge={b}/><div><strong>{badgeLabel(b)}</strong><span>{visible?<><Eye size={12}/> Sichtbar</>:<><EyeOff size={12}/> Ausgeblendet</>}</span></div><button type="button" role="switch" className="badge-visibility-switch" aria-label={`${badgeLabel(b)} im Profil anzeigen`} aria-checked={visible} disabled={saving!==null} onClick={()=>void toggle(b.id,!visible)}><span className="badge-switch-knob">{visible&&<Check size={12}/>}</span></button></div>;})}</div>
  <p className="badge-settings-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

export function BadgeNotifications(){const {api,profile,lobby,notify}=useApp();const [revision,setRevision]=useState(0);useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('manhunt:badges-changed',refresh);return()=>window.removeEventListener('manhunt:badges-changed',refresh);},[]);useEffect(()=>{if(!profile)return;let active=true;void api<BadgeOverview>('/badges').then(async v=>{if(!active||!v.notices.length)return;notify(v.notices.map(n=>badgeLabel({id:n.badgeId,name:n.name,level:n.level})+' freigeschaltet').join(' · '));await api('/badges/seen',{method:'POST',body:JSON.stringify({ids:v.notices.map(n=>n.id).slice(0,100)})});}).catch(()=>{});return()=>{active=false;};},[api,profile?.id,lobby?.status,revision,notify]);return null;}
