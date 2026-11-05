import {useEffect,useState} from 'react';
import {ArrowRight,Check,MapPin,Radio,Shield,Users,X} from 'lucide-react';
import {useApp} from './game-context';
import './community.css';
const INTRO_VERSION='1';
const steps=[
 {title:'Deine Crew, eure Runde',body:'Erstelle eine private Lobby oder tritt mit Code beziehungsweise QR-Code bei. Der Host legt Spielmodus und Regeln fest.',icon:Users},
 {title:'Zone prüfen, Standort freigeben',body:'Bestätigt ein sicheres, öffentlich zugängliches Spielfeld. Aktive Spieler geben ihren Standort in der Lobby frei. Push ist freiwillig.',icon:MapPin},
 {title:'Rolle kennen, fair spielen',body:'Hider senden regelmäßig Pins. Hunter bestätigen einen echten Fang mit dem vereinbarten Nachweis. Halte die App offen; Hintergrund-GPS ist auf Handys eingeschränkt.',icon:Shield},
];
/** This optional inline guide never overlays or blocks authentication, results or play. */
export function Onboarding(){
 const {profile}=useApp();const [user,setUser]=useState(''),[shown,setShown]=useState(false),[expanded,setExpanded]=useState(false),[step,setStep]=useState(0);
 useEffect(()=>{if(!profile){setShown(false);setUser('');return;}setUser(profile.id);try{setShown(localStorage.getItem(`manhunt:intro:${INTRO_VERSION}:${profile.id}`)!=='done');}catch{setShown(true);}setExpanded(false);setStep(0);},[profile?.id]);
 useEffect(()=>{const open=()=>{if(profile){setUser(profile.id);setShown(true);setExpanded(true);setStep(0);}};window.addEventListener('manhunt:open-intro',open);return()=>window.removeEventListener('manhunt:open-intro',open);},[profile?.id]);
 function finish(){try{localStorage.setItem(`manhunt:intro:${INTRO_VERSION}:${user}`,'done');}catch{}setShown(false);}
 if(!profile||user!==profile.id||!shown)return null;
 const item=steps[step],Icon=item.icon;
 return <section className={`intro-card ${expanded?'expanded':''}`} aria-label="Kurze Spieleinführung"><div className="intro-card-top"><Radio size={18}/><div><strong>So funktioniert MANHUNT</strong>{!expanded&&<span>Die wichtigsten Schritte kurz erklärt.</span>}</div><button type="button" className="icon-button" aria-label="Einführung überspringen" onClick={finish}><X size={17}/></button></div>{expanded?<><div className="intro-step" aria-live="polite"><Icon size={24}/><div><h2>{item.title}</h2><p>{item.body}</p></div></div><div className="intro-card-bottom"><span aria-label={`Schritt ${step+1} von ${steps.length}`}>{steps.map((_,i)=><i key={i} className={i<=step?'active':''}/>)}</span><button type="button" className="button subtle" onClick={finish}>Einführung überspringen</button><button type="button" className="button primary" onClick={()=>step===steps.length-1?finish():setStep(v=>v+1)}>{step===steps.length-1?<><Check size={15}/> Los geht’s</>:<>Nächster Tipp <ArrowRight size={15}/></>}</button></div></>:<button type="button" className="text-link" onClick={()=>setExpanded(true)}>Kurzanleitung öffnen <ArrowRight size={15}/></button>}</section>;
}
export function openOnboarding(){window.dispatchEvent(new Event('manhunt:open-intro'));}
