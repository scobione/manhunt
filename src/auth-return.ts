// Keep only callback classification, never OAuth codes or raw provider errors.
export interface AuthReturn { callback:boolean; recovery:boolean; recoveryFragment:boolean; hasCode:boolean; problem:'cancelled'|'provider'|'other'|null }

export function readAuthReturn(href:string):AuthReturn {
 const url=new URL(href);
 const hash=new URLSearchParams(url.hash.slice(1));
 const value=(key:string)=>url.searchParams.get(key)||hash.get(key)||'';
 const recovery=value('type')==='recovery'||url.pathname.replace(/\/$/,'')==='/auth/recovery';
 const callback=recovery||url.pathname.replace(/\/$/,'')==='/auth/callback'||!!value('code')||!!value('error');
 const error=value('error'),code=value('error_code'),description=value('error_description');
 const problem=!callback||!(error||code||description)?null
  :/unable to exchange external code|invalid_client/i.test(description)||code==='provider_error'?'provider'
  :error==='access_denied'||code==='access_denied'?'cancelled':'other';
 return {callback,recovery,recoveryFragment:recovery&&!!value('access_token')&&!!value('refresh_token'),hasCode:callback&&!!value('code'),problem};
}

export function authInitializationMessage(result:AuthReturn,error:unknown,hasSession:boolean):string {
 if(result.problem==='provider')return 'Diese externe Anmeldung ist nicht verfügbar. Melde dich mit deiner bisherigen E-Mail-Adresse an.';
 if(result.problem==='cancelled')return 'Die Anmeldung wurde abgebrochen. Melde dich mit deiner E-Mail-Adresse an.';
 if(result.problem==='other')return 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte starte sie erneut oder fordere einen neuen Bestätigungslink an.';
 const code=error&&typeof error==='object'&&'code' in error?error.code:null;
 if(['flow_state_expired','flow_state_not_found','bad_code_verifier'].includes(String(code)))return 'Dieser Anmeldeversuch ist abgelaufen oder nicht mehr gültig. Bitte starte die Anmeldung erneut im selben Browser.';
 if(code==='pkce_code_verifier_not_found'||(result.hasCode&&!hasSession&&!error))return 'Der Anmeldenachweis fehlt in diesem Browser. Starte die Anmeldung erneut und schließe sie im selben Browser ab. Auf dem iPhone kannst du MANHUNT dafür direkt in Safari öffnen.';
 if(error)return 'Die Anmeldung konnte nicht überprüft werden. Prüfe deine Verbindung und starte sie erneut.';
 return '';
}

export function clearAuthReturn():void {
 const url=new URL(window.location.href);
 if(!readAuthReturn(url.href).callback)return;
 for(const key of ['code','sb_flow_id','error','error_code','error_description','type','access_token','refresh_token','expires_in','expires_at','token_type'])url.searchParams.delete(key);
 url.hash='';
 window.history.replaceState(window.history.state,'',url.toString());
}
