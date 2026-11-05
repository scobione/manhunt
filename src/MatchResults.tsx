import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowRight,Flag,History,RefreshCw,Shield,Trophy} from 'lucide-react';
import {useApp,formatTime} from './game-context';
import {Avatar,PageHeader} from './UI';
import {ProfileBadge} from './Badges';
import FeedbackPanel from './FeedbackPanel';
import {personalResult} from '../shared/results';
import {modeLabel} from '../shared/rules';
import './experience.css';
const roles={hunter:'Hunter',hider:'Hider',zombie:'Zombie',spectator:'Zuschauer'};
export default function MatchResults(){const {lobby,profile,command,notify,config}=useApp(),navigate=useNavigate(),[busy,setBusy]=useState(false);if(!lobby?.result)return null;
 const result=lobby.result,outcome=personalResult(lobby),host=profile?.id===lobby.hostId;
 const winner=({hunters:'Die Hunter gewinnen',hiders:'Die Hider gewinnen',infected:'Die Infektion gewinnt',zombies:'Die Infektion gewinnt',draw:'Unentschieden',aborted:'Match ohne Wertung beendet',deleted_player:'Der Sieger hat sein Konto gelöscht',A:'Team A gewinnt',B:'Team B gewinnt',team_A:'Team A gewinnt',team_B:'Team B gewinnt'} as Record<string,string>)[result.winner]??`${lobby.players.find(p=>p.id===result.winner)?.username??'Ein Spieler'} gewinnt`;
 async function run(action:()=>Promise<unknown>){if(busy)return;setBusy(true);try{await action();}catch(error){notify(error instanceof Error?error.message:'Die Aktion konnte nicht abgeschlossen werden.');}finally{setBusy(false);}}
 return <><PageHeader title="Die Jagd ist vorbei." description="Kehrt auf einem sicheren Weg zum vereinbarten Treffpunkt zurück."/>
 <section className={`mh-result-hero result-${outcome}`}><div className="mh-result-heading"><span className="mh-result-medal"><Trophy size={46}/></span><div><span className="mh-result-status">{outcome==='won'?'GEWONNEN':outcome==='lost'?'RUNDE BEENDET':'ERGEBNIS'} · {modeLabel(lobby.settings)}{lobby.round&&lobby.round>1?` · RUNDE ${lobby.round}`:''}</span><h2>{winner}</h2><p>{result.reason}</p></div></div>
 <div className="mh-result-meta"><div><strong>{lobby.players.length}</strong><span>Spieler</span></div><div><strong>{result.survivors.length}</strong><span>Überlebende</span></div><div><strong>{formatTime((result.endedAt-(lobby.startedAt??lobby.createdAt))/1000)}</strong><span>Spielzeit</span></div></div>
 <div className="mh-result-actions">{host?<button className="button primary" disabled={busy} onClick={()=>void run(async()=>{await command({type:'rematch',matchId:lobby!.id});navigate('/lobby');})}><RefreshCw size={17}/> Revanche starten</button>:<span className="tag">Auf Revanche warten</span>}<button className="button" disabled={busy} onClick={()=>void run(async()=>{await command({type:'leave'});navigate('/');})}>Zur Übersicht <ArrowRight size={16}/></button><Link className="button" to="/history"><History size={16}/> Matchhistorie</Link></div>
 <p className="mh-result-note">Standortfreigabe beendet. Die Revanche übernimmt Code, Crew und Regeln; alle geben ihren Standort erneut frei und bestätigen ihre Bereitschaft.</p></section>
 {result.winner!=='aborted'&&<FeedbackPanel key={lobby.id} matchId={lobby.id}/>}
 <h3 className="mh-result-section-heading">Deine Crew</h3><div className="mh-result-crew">{lobby.players.map(player=><article className="mh-result-player" key={player.id}><Avatar name={player.username} url={player.avatar_url}/><div><strong>{player.username}{player.id===profile?.id?' · Du':''}</strong><ProfileBadge badge={player.badge}/><small>{roles[player.role]}</small></div><span className={result.survivors.includes(player.id)?'ready-badge':'waiting-badge'}>{result.survivors.includes(player.id)?'ÜBERLEBT':player.eliminated?'AUSGESCHIEDEN':'BEENDET'}</span></article>)}</div>
 <div className="mh-result-linkrow">{!config?.simulation&&<Link to={`/report?match=${lobby.id}`}><Flag size={15}/> Fehler melden</Link>}<Link to="/safety"><Shield size={15}/> Outdoor-Kodex</Link></div></>;
}
