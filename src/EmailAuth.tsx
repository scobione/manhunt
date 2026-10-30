import {PasswordField} from '../admin/shared/PasswordField';
import { useState, useEffect, type FormEvent } from 'react';
import {UsernameInput} from './AccountSetup';
import {USERNAME_PATTERN} from '../shared/accounts';
import { supabase, useApp } from './context';

function errorMessage(error:unknown):string {
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 const messages:Record<string,string>={
  user_banned:'Dieses Konto ist deaktiviert. Bitte wende dich an den Administrator.',
  invalid_credentials:'E-Mail-Adresse oder Passwort stimmen nicht.',
  email_not_confirmed:'Bitte bestätige zuerst deine E-Mail-Adresse mit dem Code aus deinem Postfach.',
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

export function EmailAuthForm({resetOnly=false}:{resetOnly?:boolean}){
 const {clearAuthError}=useApp();
 const [mode,setMode]=useState<'login'|'signup'|'reset'>(resetOnly?'reset':'login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [username,setUsername]=useState('');
 const [resendAt,setResendAt]=useState(0),[verifyAt,setVerifyAt]=useState(0),[attempts,setAttempts]=useState(0),[now,setNow]=useState(Date.now());
 const [otp,setOtp]=useState(''),[verifyEmail,setVerifyEmail]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false);
 useEffect(()=>{if(!registered&&!verifyEmail)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[registered,verifyEmail]);
 function switchMode(next:typeof mode){setMode(next);setPassword('');setRepeat('');setError('');setMessage('');setRegistered(false);setVerifyEmail(false);setOtp('');clearAuthError();}
 async function submit(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;
  setError('');setMessage('');clearAuthError();
  if(mode==='signup'&&!USERNAME_PATTERN.test(username)){setError('Wähle einen Benutzernamen mit 3–20 Buchstaben, Zahlen, Punkten oder Unterstrichen.');return;}
  if(mode==='signup'&&password!==repeat){setError('Die Passwörter stimmen nicht überein.');return;}
  setBusy(true);
  try{
   const address=email.trim();
   if(mode==='login'){
    const {error}=await supabase.auth.signInWithPassword({email:address,password});if(error)throw error;
    setPassword('');
   }else if(mode==='signup'){
    const {error}=await supabase.auth.signUp({email:address,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`,data:{username}}});if(error)throw error;
    setPassword('');setRepeat('');setRegistered(true);setResendAt(Date.now()+60000);setNow(Date.now());
    setMessage('Prüfe dein Postfach und bestätige deine E-Mail-Adresse mit dem sechsstelligen Code. Er ist nur begrenzte Zeit gültig und kann einmal verwendet werden.');
   }else{
    const {error}=await supabase.auth.resetPasswordForEmail(address,{redirectTo:`${window.location.origin}/auth/callback`});if(error)throw error;
    setMessage('Falls ein Konto zu dieser Adresse besteht, erhältst du eine E-Mail zum Zurücksetzen. Prüfe auch deinen Spam-Ordner. Öffne den Link möglichst in diesem Browser.');
   }
  }catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='email_not_confirmed')setVerifyEmail(true);setError(errorMessage(error));}finally{setBusy(false);}
 }
 async function verifyCode(event:FormEvent){event.preventDefault();if(!supabase||busy||Date.now()<verifyAt||!/^\d{6}$/.test(otp))return;setBusy(true);setError('');try{const {error}=await supabase.auth.verifyOtp({email:email.trim(),token:otp.trim(),type:'email'});if(error)throw error;setOtp('');setRegistered(false);setVerifyEmail(false);setAttempts(0);}catch{setAttempts(v=>v+1);if(attempts>=4){setVerifyAt(Date.now()+60000);setAttempts(0);}setError('Der Code ist ungültig oder abgelaufen. Prüfe ihn oder fordere eine neue Bestätigung an.');}finally{setBusy(false);}}
 async function resend(){
  if(!supabase||busy||Date.now()<resendAt)return;setBusy(true);setError('');
  try{const {error}=await supabase.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/auth/callback`}});if(error)throw error;setResendAt(Date.now()+60000);setNow(Date.now());setMessage('Bestätigung erneut angefordert. Bitte prüfe dein Postfach und den Spam-Ordner.');}catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }
 return <section className="email-auth" aria-label="E-Mail-Anmeldung">
  {!resetOnly&&<div className="auth-mode-buttons"><button type="button" className={`button ${mode==='login'?'primary':''}`} aria-pressed={mode==='login'} disabled={busy} onClick={()=>switchMode('login')}>Anmelden</button><button type="button" className={`button ${mode==='signup'?'primary':''}`} aria-pressed={mode==='signup'} disabled={busy} onClick={()=>switchMode('signup')}>Registrieren</button></div>}
  {mode==='reset'&&<h3>Passwort vergessen?</h3>}
  <form onSubmit={submit}>
   <label>E-Mail-Adresse<input type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={event=>{setEmail(event.target.value);setRegistered(false);}} disabled={busy}/></label>
   {mode==='signup'&&!registered&&<UsernameInput value={username} onChange={setUsername} disabled={busy}/>}
   {mode!=='reset'&&!registered&&<PasswordField label="Passwort" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={mode==='signup'?12:undefined} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/>}
   {mode==='signup'&&!registered&&<><PasswordField label="Passwort wiederholen" autoComplete="new-password" minLength={mode==='signup'?12:8} maxLength={128} required value={repeat} onChange={event=>setRepeat(event.target.value)} disabled={busy}/><p className="muted">Mindestens 12 Zeichen. Verwende ein Passwort, das du nur hier nutzt.</p></>}
   {error&&<p className="inline-warning" role="alert">{error}</p>}
   {message&&<p className="auth-feedback" role="status">{message}</p>}
   {!registered&&<button className="button primary" disabled={busy||!supabase}>{busy?'Bitte warten…':mode==='login'?'Mit E-Mail anmelden':mode==='signup'?'Konto erstellen':'Link zum Zurücksetzen anfordern'}</button>}
  </form>
  {(registered||verifyEmail)&&<form onSubmit={verifyCode} className="email-code-form"><label>Bestätigungscode<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/></label><button className="button primary" disabled={busy||otp.length!==6||now<verifyAt}>E-Mail bestätigen</button><p className="fineprint">{now<verifyAt?`Bitte warte ${Math.ceil((verifyAt-now)/1000)} Sekunden vor dem nächsten Versuch. `:''}Alternativ kannst du den Bestätigungslink aus deiner E-Mail öffnen.</p></form>}
  {(registered||verifyEmail)&&<div className="auth-mode-buttons"><button className="button" disabled={busy||now<resendAt} onClick={resend}>{now<resendAt?`Erneut senden in ${Math.ceil((resendAt-now)/1000)} s`:'Bestätigung erneut senden'}</button><button className="button" disabled={busy} onClick={()=>switchMode('login')}>Zur E-Mail-Anmeldung</button></div>}
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
 return <form className="email-auth password-change" onSubmit={submit}><h3>Neues Passwort festlegen</h3><PasswordField label="Neues Passwort" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/><PasswordField label="Neues Passwort wiederholen" autoComplete="new-password" minLength={8} maxLength={128} required value={repeat} onChange={event=>setRepeat(event.target.value)} disabled={busy}/>{error&&<p role="alert" className="inline-warning">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Wird gespeichert…':'Neues Passwort speichern'}</button></form>;
}
