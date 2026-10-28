import {useEffect,useState,type FormEvent} from 'react';
import {Check,ShieldCheck,LockKeyhole,UserRound,ImagePlus,LogOut} from 'lucide-react';
import {supabase,useApp} from './context';
import {prepareAvatar} from './avatar';
import {USERNAME_PATTERN} from '../shared/accounts';

export function UsernameInput({value,onChange,disabled=false}:{value:string;onChange:(v:string)=>void;disabled?:boolean}){
 const {api}=useApp();const [status,setStatus]=useState('');
 useEffect(()=>{
  if(!USERNAME_PATTERN.test(value)){setStatus(value?'3–20 Buchstaben, Zahlen, Punkte oder Unterstriche.':'');return;}
  let active=true;setStatus('Verfügbarkeit wird geprüft…');
  const timer=setTimeout(()=>{api<{available:boolean}>(`/account/username?name=${encodeURIComponent(value)}`).then(r=>{if(active)setStatus(r.available?'Benutzername ist verfügbar.':'Dieser Benutzername ist bereits vergeben.');}).catch(()=>{if(active)setStatus('Verfügbarkeit derzeit nicht prüfbar. Der Server prüft den Namen beim Speichern.');});},350);
  return()=>{active=false;clearTimeout(timer);};
 },[value,api]);
 return <label>Benutzername<input autoComplete="username" required value={value} onChange={e=>onChange(e.target.value)} minLength={3} maxLength={20} pattern="[A-Za-z0-9_.]{3,20}" disabled={disabled}/><small className="fineprint" aria-live="polite">{status}</small></label>;
}
export default function AccountSetup(){
 const {account,api,refreshAccount,logout}=useApp();
 const [password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[username,setUsername]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(task:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await task();await refreshAccount();}catch(e){setError(e instanceof Error?e.message:'Die Einrichtung konnte nicht gespeichert werden.');}finally{setBusy(false);}}
 function submit(e:FormEvent){e.preventDefault();void run(async()=>{
  if(account?.setupStage===0){await api('/account/setup/password',{method:'POST',body:JSON.stringify({password,confirmation:repeat})});setPassword('');setRepeat('');}
  if(account?.setupStage===1)await api('/account/setup/username',{method:'POST',body:JSON.stringify({username})});
  if(account?.setupStage===2)await api('/account/setup/complete',{method:'POST',body:JSON.stringify({acknowledged:ack})});
 });}
 if(!account)return null;
 return <main className="account-setup"><a href="/" className="brand"><ShieldCheck size={28}/> MANHUNT</a><section className="panel">
  <span className="eyebrow">DEIN KONTO / {account.disabled?'ZUGANG GESPERRT':'ERSTEINRICHTUNG'}</span>
  <h1>{account.disabled?'Dieses Konto ist deaktiviert.':'Mach MANHUNT zu deinem Spiel.'}</h1>
  {account.disabled?<p>Wende dich an den Administrator, um den Zugang wieder freizugeben.</p>:<>
   <p>Richte dein Konto vollständig ein, bevor du einer Lobby beitrittst.</p>
   <ol className="setup-steps">{[{name:'Passwort',icon:LockKeyhole},{name:'Benutzername',icon:UserRound},{name:'Profil',icon:ImagePlus}].map(({name,icon:Icon},i)=><li key={name} aria-current={account.setupStage===i?'step':undefined} className={account.setupStage>i?'complete':account.setupStage===i?'current':''}>{account.setupStage>i?<Check size={18}/>:<Icon size={18}/>}<span>{name}</span></li>)}</ol>
   <form onSubmit={submit}>
    {account.setupStage===0&&<><h2>Dein eigenes Passwort</h2><p>Ersetze das vorläufige Passwort. Andere Sitzungen werden dabei abgemeldet.</p><label>Neues Passwort<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Passwort bestätigen<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><p className="fineprint">Mindestens 12 Zeichen, mit Groß- und Kleinbuchstaben sowie einer Zahl.</p></>}
    {account.setupStage===1&&<><h2>So kennt dich deine Crew</h2><UsernameInput value={username} onChange={setUsername} disabled={busy}/></>}
    {account.setupStage===2&&<><h2>Bereit für deine erste Runde</h2><p><strong>{account.username}</strong> · {account.email}</p><div className="setup-avatar">{account.avatarUrl?<img src={account.avatarUrl} alt="Dein Profilbild"/>:<UserRound size={42}/>}</div><label>Profilbild auswählen (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!supabase} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file||!supabase)return;void run(async()=>{const blob=await prepareAvatar(file);const {data}=await supabase!.auth.getUser();if(!data.user)throw new Error('Bitte erneut anmelden.');const path=`${data.user.id}/${crypto.randomUUID()}.webp`;const upload=await supabase!.storage.from('avatars').upload(path,blob,{contentType:'image/webp'});if(upload.error)throw new Error('Das Profilbild konnte nicht hochgeladen werden.');try{await api('/account/setup/avatar',{method:'POST',body:JSON.stringify({path})});}catch(error){await supabase!.storage.from('avatars').remove([path]);throw error;}});}}/></label><label className="toggle-row"><input type="checkbox" required checked={ack} onChange={e=>setAck(e.target.checked)}/><span>Ich habe die <a href="/privacy" target="_blank" rel="noopener">Datenschutzhinweise</a> und den <a href="/safety" target="_blank" rel="noopener">Outdoor-Kodex</a> gelesen. Standortfreigabe bleibt freiwillig.</span></label></>}
    {error&&<p role="alert" className="inline-warning">{error}</p>}
    <button className="button primary" disabled={busy}>{busy?'Wird gespeichert…':account.setupStage===2?'Einrichtung abschließen':'Speichern & weiter'}</button>
   </form>
   {account.source==='admin'&&!account.emailVerified&&<p className="fineprint">Administrativ freigegeben. Der Besitz dieser E-Mail-Adresse wurde nicht durch einen E-Mail-Code bestätigt.</p>}
  </>}
  <button className="button subtle" onClick={()=>void logout().catch(e=>setError(e.message))}><LogOut size={16}/> Abmelden</button>
 </section></main>;
}
