import { useState, type FormEvent } from 'react';
import { supabase, useApp } from './context';

function errorMessage(error:unknown):string {
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 const messages:Record<string,string>={
  invalid_credentials:'E-Mail-Adresse oder Passwort stimmen nicht.',
  email_not_confirmed:'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.',
  email_address_not_authorized:'Der E-Mail-Versand ist für diese Adresse noch nicht freigeschaltet. Bitte kontaktiere den Betreiber.',
  email_address_invalid:'Bitte prüfe deine E-Mail-Adresse.',
  over_email_send_rate_limit:'Es wurden zu viele E-Mails angefordert. Bitte warte etwas und versuche es später erneut.',
  over_request_rate_limit:'Zu viele Versuche. Bitte warte etwas und versuche es erneut.',
  weak_password:'Dieses Passwort ist zu schwach. Verwende ein längeres, eindeutiges Passwort.',
  same_password:'Bitte wähle ein anderes Passwort als bisher.',
  signup_disabled:'Neue Registrierungen sind derzeit nicht freigeschaltet.',
 };
 return messages[code]||'Die Anfrage konnte nicht abgeschlossen werden. Prüfe deine Verbindung und versuche es erneut.';
}

export function EmailAuthForm(){
 const {clearAuthError}=useApp();
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false);
 function switchMode(next:typeof mode){setMode(next);setPassword('');setRepeat('');setError('');setMessage('');setRegistered(false);clearAuthError();}
 async function submit(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;
  setError('');setMessage('');clearAuthError();
  if(mode==='signup'&&password!==repeat){setError('Die Passwörter stimmen nicht überein.');return;}
  setBusy(true);
  try{
   const address=email.trim();
   if(mode==='login'){
    const {error}=await supabase.auth.signInWithPassword({email:address,password});if(error)throw error;
    setPassword('');
   }else if(mode==='signup'){
    const {error}=await supabase.auth.signUp({email:address,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`}});if(error)throw error;
    setPassword('');setRepeat('');setRegistered(true);
    setMessage('Prüfe dein Postfach und bestätige deine E-Mail-Adresse. Danach kannst du dich hier mit E-Mail und Passwort anmelden.');
   }else{
    const {error}=await supabase.auth.resetPasswordForEmail(address,{redirectTo:`${window.location.origin}/auth/callback`});if(error)throw error;
    setMessage('Falls ein Konto zu dieser Adresse besteht, erhältst du eine E-Mail zum Zurücksetzen. Prüfe auch deinen Spam-Ordner. Öffne den Link möglichst in diesem Browser.');
   }
  }catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }
 async function resend(){
  if(!supabase||busy)return;setBusy(true);setError('');
  try{const {error}=await supabase.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/auth/callback`}});if(error)throw error;setMessage('Bestätigung erneut angefordert. Bitte prüfe dein Postfach und den Spam-Ordner.');}catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }
 return <section className="email-auth" aria-label="E-Mail-Anmeldung">
  <div className="auth-mode-buttons"><button type="button" className={`button ${mode==='login'?'primary':''}`} aria-pressed={mode==='login'} disabled={busy} onClick={()=>switchMode('login')}>Anmelden</button><button type="button" className={`button ${mode==='signup'?'primary':''}`} aria-pressed={mode==='signup'} disabled={busy} onClick={()=>switchMode('signup')}>Registrieren</button></div>
  {mode==='reset'&&<h3>Passwort vergessen?</h3>}
  <form onSubmit={submit}>
   <label>E-Mail-Adresse<input type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={event=>{setEmail(event.target.value);setRegistered(false);}} disabled={busy}/></label>
   {mode!=='reset'&&!registered&&<label>Passwort<input type="password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={mode==='signup'?8:undefined} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>}
   {mode==='signup'&&!registered&&<><label>Passwort wiederholen<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={repeat} onChange={event=>setRepeat(event.target.value)} disabled={busy}/></label><p className="muted">Mindestens 8 Zeichen. Verwende ein Passwort, das du nur hier nutzt.</p></>}
   {error&&<p className="inline-warning" role="alert">{error}</p>}
   {message&&<p className="auth-feedback" role="status">{message}</p>}
   {!registered&&<button className="button primary" disabled={busy||!supabase}>{busy?'Bitte warten…':mode==='login'?'Mit E-Mail anmelden':mode==='signup'?'Konto erstellen':'Link zum Zurücksetzen anfordern'}</button>}
  </form>
  {registered&&<div className="auth-mode-buttons"><button className="button" disabled={busy} onClick={resend}>Bestätigung erneut senden</button><button className="button" disabled={busy} onClick={()=>switchMode('login')}>Zur E-Mail-Anmeldung</button></div>}
  {mode==='login'&&<button className="text-link auth-forgot" type="button" disabled={busy} onClick={()=>switchMode('reset')}>Passwort vergessen?</button>}
 </section>;
}

export function PasswordChangeForm({onDone}:{onDone:()=>void}){
 const [password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;
  if(password!==repeat){setError('Die Passwörter stimmen nicht überein.');return;}
  setBusy(true);setError('');
  try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setPassword('');setRepeat('');onDone();}catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }
 return <form className="email-auth password-change" onSubmit={submit}><h3>Neues Passwort festlegen</h3><label>Neues Passwort<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label><label>Neues Passwort wiederholen<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={repeat} onChange={event=>setRepeat(event.target.value)} disabled={busy}/></label>{error&&<p role="alert" className="inline-warning">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Wird gespeichert…':'Neues Passwort speichern'}</button></form>;
}
