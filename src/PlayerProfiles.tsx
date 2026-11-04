import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,Check,Copy,History,ImagePlus,Save,Settings,Trophy,Users} from 'lucide-react';
import {BadgeBoard,BadgeStrip,BadgeVisibilitySettings,OwnProfileBadges} from './Badges';
import {Avatar,EmptyState,PageHeader} from './UI';
import {supabase} from './context';
import {useApp} from './game-context';
import {prepareAvatar} from './avatar';
import {levelProgress} from '../shared/rules';
import {MODES,type AccountProgress,type MatchResult} from '../shared/types';
import type {FriendProfile} from '../shared/profiles';
import './player-profiles.css';

interface HistoryItem {id:string;mode:string;role:string;result:MatchResult;played_at:string;won?:boolean}
function useProfileTask(){const {notify}=useApp();const [busy,setBusy]=useState(false);return{busy,run:async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();}catch(error){notify(error instanceof Error?error.message:'Die Änderung konnte nicht gespeichert werden.');}finally{setBusy(false);}}};}
function ProfileHero({username,avatar,createdAt,xp,badges,action}:{username:string;avatar:string|null;createdAt?:string;xp:number;badges:ReactNode;action?:ReactNode}){
 const level=levelProgress(xp);
 return <section className="mh-profile-hero" aria-label={`Profil von ${username}`}>
  <div className="mh-profile-banner" aria-hidden="true"><span className="mh-profile-banner-orbit"/><span className="mh-profile-banner-orbit second"/><span className="mh-profile-banner-word">MANHUNT</span></div>
  <div className="mh-profile-identity"><div className="mh-profile-avatar"><Avatar name={username} url={avatar} size="large"/></div><div className="mh-profile-name"><span className="mh-profile-level">LEVEL {level.level}</span><h2>{username}</h2>{badges}</div>{action&&<div className="mh-profile-action">{action}</div>}</div>
  <div className="mh-profile-bottom"><div className="mh-profile-xp"><div><span>{xp.toLocaleString('de-DE')} Account-XP</span><span>{level.remaining.toLocaleString('de-DE')} bis Level {level.level+1}</span></div><progress aria-label={`Fortschritt zu Level ${level.level+1}`} max={100} value={level.percent}/></div>{createdAt&&<span className="mh-profile-since">Dabei seit {new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(createdAt))}</span>}</div>
 </section>;
}
function ProfileStats({progress}:{progress:AccountProgress}){return <section className="mh-profile-stats" aria-label="Spielstatistiken">{Object.entries({Spiele:progress.games,Siege:progress.wins,Fänge:progress.captures,'XP-Jagd-Punkte':progress.hunt_points}).map(([label,value])=><div key={label}><strong>{value.toLocaleString('de-DE')}</strong><span>{label}</span></div>)}</section>;}
function ProfileEditor(){
 const {profile,api,refreshProfile,notify}=useApp();const {busy,run}=useProfileTask();const navigate=useNavigate();const [username,setUsername]=useState(profile?.username??''),[online,setOnline]=useState(!!profile?.show_online);
 useEffect(()=>{if(profile){setUsername(profile.username);setOnline(profile.show_online);}},[profile]);
 if(!profile)return null;
 function save(event:FormEvent){event.preventDefault();void run(async()=>{await api('/profile',{method:'PATCH',body:JSON.stringify({username,show_online:online})});await refreshProfile();notify('Profil gespeichert.');navigate('/profile');});}
 return <div className="mh-profile-edit-grid"><form className="panel" onSubmit={save}>
  <h2>Dein Profil</h2><label htmlFor="username">Benutzername</label><input id="username" value={username} required minLength={3} maxLength={Math.max(20,profile.username.length)} pattern="[A-Za-z0-9_.]{3,24}" onChange={event=>setUsername(event.target.value)}/><p className="fineprint">3–20 Buchstaben, Zahlen, Punkte oder Unterstriche. Jeder Name ist eindeutig.</p>
  <label className="toggle-row"><span><strong>Online-Status mit Freunden teilen</strong></span><input type="checkbox" checked={online} onChange={event=>setOnline(event.target.checked)}/></label>
  <div className="avatar-upload"><label className="button" htmlFor="avatar-file"><ImagePlus size={17}/> Profilbild auswählen</label><input className="sr-only" type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp" disabled={busy||!supabase} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file||!supabase)return;void run(async()=>{const blob=await prepareAvatar(file),path=`${profile.id}/${crypto.randomUUID()}.webp`;const {error}=await supabase!.storage.from('avatars').upload(path,blob,{contentType:'image/webp',cacheControl:'3600',upsert:false});if(error)throw error;try{await api('/profile/avatar',{method:'POST',body:JSON.stringify({path})});await refreshProfile();notify('Profilbild aktualisiert.');}catch(error){await supabase!.storage.from('avatars').remove([path]);throw error;}});}}/>{profile.avatar_url&&<button type="button" className="button subtle" disabled={busy} onClick={()=>void run(async()=>{await api('/profile',{method:'PATCH',body:JSON.stringify({avatar_url:null})});await refreshProfile();notify('Profilbild entfernt.');})}>Bild entfernen</button>}<p className="fineprint">JPEG, PNG oder WebP bis 2 MB.</p></div>
  <button className="button primary" disabled={busy}><Save size={17}/>{busy?'Speichert…':'Profil speichern'}</button>
 </form><BadgeVisibilitySettings/></div>;
}
export function ProfilePage({edit=false}:{edit?:boolean}){
 const {profile,api,notify}=useApp(),{busy,run}=useProfileTask();const [history,setHistory]=useState<{user:string;items:HistoryItem[]}|null>(null);
 useEffect(()=>{if(!profile||edit)return;let live=true;api<HistoryItem[]>('/history').then(items=>{if(live)setHistory({user:profile.id,items});}).catch(error=>{if(live)notify(error.message);});return()=>{live=false;};},[api,profile?.id,edit,notify]);
 if(!profile)return null;
 const items=history?.user===profile.id?history.items:[];
 return <>
  <PageHeader title={edit?'Profil bearbeiten':'Dein Profil'} action={<Link className="button" to={edit?'/profile':'/profile/edit'}>{edit?<ArrowLeft size={16}/>:<Settings size={16}/>}{edit?'Zum Profil':'Profil bearbeiten'}</Link>}/>
  <ProfileHero username={profile.username} avatar={profile.avatar_url} createdAt={profile.created_at} xp={profile.progress?.total_xp??0} badges={<OwnProfileBadges/>}/>
  {edit?<ProfileEditor/>:<>
   {profile.progress&&<><ProfileStats progress={profile.progress}/><details className="mh-profile-extra-stats"><summary>Weitere Statistiken</summary><dl>{Object.entries({Niederlagen:profile.progress.losses,Unentschieden:profile.progress.draws,'Als Hider überlebt':profile.progress.survivals}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toLocaleString('de-DE')}</dd></div>)}</dl></details></>}
   <div className="mh-profile-content-grid"><section className="panel mh-profile-history"><div className="panel-heading"><h3>Letzte Spiele</h3><Link className="text-link" to="/history">Alle Spiele <ArrowRight size={15}/></Link></div>{items.length?items.slice(0,3).map(item=><div className="history-row" key={item.id}><History size={18}/><div className="grow"><strong>{MODES.find(mode=>mode.id===item.mode)?.name??item.mode}</strong><small>{new Date(item.played_at).toLocaleDateString('de-DE')}</small></div><span className="tag">{item.role.toUpperCase()}</span></div>):<EmptyState icon={Trophy} title="Noch keine abgeschlossenen Spiele."/>}</section><section className="panel mh-profile-code"><div className="panel-heading"><h3>Freundescode</h3><Users size={18}/></div><strong className="friend-code">{profile.friend_code}</strong><button className="button" disabled={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(profile.friend_code);notify('Freundescode kopiert.');})}><Copy size={16}/> Code kopieren</button><Link to="/friends" className="text-link">Freunde öffnen <ArrowRight size={15}/></Link></section></div>
   <details className="mh-profile-collection"><summary>Badge-Sammlung <span>Freischaltungen & Fortschritt</span></summary><BadgeBoard/></details>
  </>}
 </>;
}
export function FriendProfilePage(){
 const {playerId=''}=useParams(),{api,profile,socialRevision}=useApp();const [result,setResult]=useState<{id:string;data:FriendProfile|null;error:string}|null>(null);
 useEffect(()=>{let live=true;const refresh=async()=>{try{const data=await api<FriendProfile>(`/players/${encodeURIComponent(playerId)}/profile`);if(live)setResult({id:playerId,data,error:''});}catch(error){if(live)setResult({id:playerId,data:null,error:error instanceof Error?error.message:'Dieses Profil ist nicht verfügbar.'});}};void refresh();const onVisible=()=>{if(!document.hidden)void refresh();};const interval=window.setInterval(onVisible,20000);window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);return()=>{live=false;clearInterval(interval);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);};},[api,playerId,socialRevision]);
 if(playerId===profile?.id)return <ProfilePage/>;
 const current=result?.id===playerId?result:null;
 return <><PageHeader title="Spielerprofil" action={<Link className="button" to="/friends"><ArrowLeft size={16}/> Freunde</Link>}/>{!current?<p className="terminal-loader" role="status">Profil wird geladen…</p>:current.data?<><ProfileHero username={current.data.username} avatar={current.data.avatar_url} createdAt={current.data.created_at} xp={current.data.progress?.total_xp??0} badges={<BadgeStrip badges={current.data.badges}/>}/>{current.data.progress&&<ProfileStats progress={current.data.progress}/>}<p className="mh-profile-friend-note"><Check size={15}/> Mit dir befreundet</p></>:<section className="panel" role="status"><h2>Profil nicht verfügbar</h2><p>{current.error}</p><Link to="/friends" className="button">Zu deinen Freunden</Link></section>}</>;
}
