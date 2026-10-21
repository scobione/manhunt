import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Crosshair, DoorOpen, Eye, Flag, LocateFixed, MapPin, Pause, Play, Radio, Shield, Skull, Timer, Trophy, Users, X } from 'lucide-react';
import type { Command, LocationSample, Role } from '../shared/types';
import { MODES } from '../shared/types';
import { Avatar, EmptyState, PageHeader } from './App';
import { formatTime, useApp, useNow } from './context';
import MapView from './MapView';

const ROLE_LABELS: Record<Role, string> = { hunter: 'HUNTER', hider: 'HIDER', zombie: 'ZOMBIE', spectator: 'ZUSCHAUER' };
const ROLE_INFO: Record<Role, string> = {
  hunter: 'Lies die Signale. Suche die Hider. Bestätige einen Fang erst nach tatsächlichem Kontakt.',
  hider: 'Bleib in der sicheren Zone. Melde rechtzeitig deinen GPS-Pin und halte die App geöffnet.',
  zombie: 'Du bist infiziert. Nach der Infektionszeit unterstützt du die Hunter bei der Suche.',
  spectator: 'Du beobachtest die Match-Ereignisse. Versteckte Spielerstandorte bleiben geschützt.',
};

export default function GamePage() {
  const { lobby, profile, connected, command, notify } = useApp();
  const navigate = useNavigate();
  const clock = useNow();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [consented, setConsented] = useState(false);
  const [location, setLocation] = useState<LocationSample | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [hidden, setHidden] = useState(document.hidden);
  const [targetId, setTargetId] = useState('');
  const [captureCode, setCaptureCode] = useState('');
  const [infectionSwipe, setInfectionSwipe] = useState(0);
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);
  const [showCode, setShowCode] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef(0);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const syncRef = useRef({ lobby, connected, command });
  syncRef.current = { lobby, connected, command };
  const serverClock = useRef({ serverTime: Date.now(), receivedAt: Date.now() });
  useEffect(() => { if (lobby) serverClock.current = { serverTime: lobby.serverTime, receivedAt: Date.now() }; }, [lobby]);
  const now = serverClock.current.serverTime + clock - serverClock.current.receivedAt;

  const stopWatch = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    setSharing(false);
    setLocation(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false;
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!lobby || lobby.self.eliminated || lobby.self.role === 'spectator' || ['waiting', 'paused', 'finished', 'closed'].includes(lobby.status)) stopWatch();
  }, [lobby?.id, lobby?.status, lobby?.self.eliminated, lobby?.self.role, stopWatch]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); } catch (error) { notify(error instanceof Error ? error.message : 'Aktion konnte nicht ausgeführt werden.'); }
    finally { if (alive.current) setBusy(false); }
  }
  const onFix = useCallback((position: GeolocationPosition, force = false) => {
    const current = syncRef.current;
    if (!current.lobby || !['active', 'preparing'].includes(current.lobby.status) || current.lobby.self.eliminated || current.lobby.self.role === 'spectator') return;
    const sample: LocationSample = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp };
    setLocation(sample);
    if (sample.accuracy > current.lobby.settings.maxAccuracyMeters) {
      setGpsError(`GPS ± ${Math.round(sample.accuracy)} m: zu ungenau. Der Server darf daraus keine ungeprüfte Zoneneliminierung ableiten.`);
    } else setGpsError('');
    if (!current.connected || inFlight.current || (!force && Date.now() - lastSent.current < 3000)) return;
    lastSent.current = Date.now();
    inFlight.current = true;
    current.command({ type: 'location', location: sample, publish: force }).catch(error => {
      if (alive.current) setGpsError(error instanceof Error ? error.message : 'Der Standort konnte nicht übertragen werden.');
    }).finally(() => { inFlight.current = false; });
  }, []);
  useEffect(() => {
    if (!sharing) return;
    let locating = false;
    const timer = window.setInterval(() => {
      if (document.hidden || locating || !syncRef.current.connected) return;
      locating = true;
      navigator.geolocation.getCurrentPosition(position => {
        locating = false;
        if (alive.current && watchRef.current !== null) onFix(position);
      }, () => {
        locating = false;
        if (alive.current) setGpsError('Die GPS-Ortung ist unterbrochen. Öffne die App im Vordergrund und prüfe die Standortberechtigung.');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [sharing, onFix]);

  function startSharing() {
    if (!consented) { setGpsError('Bitte bestätige zuerst die Standortfreigabe.'); return; }
    if (!navigator.geolocation) { setGpsError('Dein Browser unterstützt keine Standortabfrage. Nutze ein aktuelles Gerät.'); return; }
    if (!window.isSecureContext) { setGpsError('Standortfreigabe benötigt eine sichere HTTPS-Verbindung.'); return; }
    if (watchRef.current !== null) return;
    setGpsError('');
    setSharing(true);
    lastSent.current = 0;
    watchRef.current = navigator.geolocation.watchPosition(position => onFix(position), error => {
      setGpsError(error.code === 1 ? 'Standortzugriff verweigert. Erlaube ihn in den Browser-Einstellungen, wenn du teilnehmen möchtest.' : 'Keine zuverlässige Ortung. Bleib an einem sicheren Ort und versuche es erneut.');
      if (error.code === 1) stopWatch();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  function refreshLocation() {
    if (!sharing) { startSharing(); return; }
    navigator.geolocation.getCurrentPosition(position => onFix(position, true), () => setGpsError('Kein frischer GPS-Standort verfügbar. Die Meldung wurde nicht gesendet.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  function endSharing() {
    stopWatch();
    setConsented(false);
    // The watch stops immediately even if the network request fails.
    if (lobby && ['active', 'preparing'].includes(lobby.status) && connected) {
      void command({ type: 'pause' }).then(() => notify('Standortfreigabe beendet. Das Match ist zur Sicherheit pausiert.')).catch(() => notify('Standortfreigabe auf diesem Gerät beendet. Der Server konnte die Pause noch nicht bestätigen.'));
    } else notify('Standortfreigabe auf diesem Gerät beendet.');
  }

  if (!lobby) return <EmptyState icon={Radio} title="Aktuell läuft kein Match." action={<Link className="button primary" to="/create">Lobby erstellen <ArrowRight size={16}/></Link>}>Verbinde dich mit deiner Crew, um die Jagd zu starten.</EmptyState>;
  if (lobby.status === 'waiting') return <EmptyState icon={Users} title="Deine Crew sammelt sich noch." action={<Link className="button primary" to="/lobby">Zum Warteraum</Link>}>Der Host startet, sobald alle bereit sind und die Spielzone bestätigt ist.</EmptyState>;

  const self = lobby.self;
  const host = lobby.hostId === profile?.id;
  const effectiveNow = lobby.status === 'paused' ? lobby.pausedAt ?? now : now;
  const preparing = lobby.status === 'preparing';
  const headStartEnd = (lobby.startedAt ?? now) + lobby.settings.headStartSeconds * 1000;
  const headStart = !preparing && effectiveNow < headStartEnd;
  const role = self.role;
  const hunter = role === 'hunter' || role === 'zombie';
  const infectionRemaining = self.infectedAt ? Math.max(0, (self.infectedAt + lobby.settings.infectionDelaySeconds * 1000 - effectiveNow) / 1000) : 0;
  const infectionPending = role === 'zombie' && self.infectedAt !== undefined && acknowledgedAt !== self.infectedAt && !lobby.events.some(event => event.type === 'infection_ack' && event.actorId === self.id && event.at >= self.infectedAt!);
  const targets = lobby.players.filter(player => player.role === 'hider' && !player.eliminated && player.id !== self.id && (lobby.settings.mode !== 'team_hunt' || player.team !== self.team));
  const pendingCaptures = lobby.captures.filter(capture => capture.targetId === self.id && now - capture.createdAt < 30000);
  const requestingCaptures = lobby.captures.filter(capture => capture.hunterId === self.id && now - capture.createdAt < 30000);
  const outsideFresh = self.outsideSince !== undefined && self.location && effectiveNow - self.location.timestamp < Math.min(15, lobby.settings.gpsToleranceSeconds) * 1000;
  const pinDue = (self.nextPinAt ?? Infinity) - effectiveNow;
  const activePlayers = lobby.players.filter(player => !player.eliminated && player.role !== 'spectator');
  const nextPhase = lobby.settings.phases.find(phase => (lobby.startedAt ?? Infinity) + phase.afterSeconds * 1000 > effectiveNow);
  const modeName = MODES.find(mode => mode.id === lobby.settings.mode)?.name ?? lobby.settings.mode;
  const leave = () => run(async () => { stopWatch(); await command({ type: 'leave' }); navigate('/'); });

  if (lobby.status === 'finished' && lobby.result) return <>
    <PageHeader eyebrow="MISSION ABGESCHLOSSEN" title="Die Jagd ist vorbei." description="Gute Runde. Kommt sicher zurück und sammelt eure Crew."/>
    <section className="panel result-panel"><Trophy size={56} className="accent"/><span className="eyebrow">{modeName} / ERGEBNIS</span><h2>{({ hunters: 'DIE HUNTER GEWINNEN', hiders: 'DIE HIDER GEWINNEN', infected: 'DIE INFEKTION GEWINNT', zombies: 'DIE INFEKTION GEWINNT', draw: 'UNENTSCHIEDEN', A: 'TEAM A GEWINNT', B: 'TEAM B GEWINNT', team_A: 'TEAM A GEWINNT', team_B: 'TEAM B GEWINNT' } as Record<string, string>)[lobby.result.winner] || `${(lobby.players.find(p=>p.id===lobby.result!.winner)?.username??lobby.result.winner).toUpperCase()} GEWINNT`}</h2><p>{lobby.result.reason}</p><div className="result-stats"><div><strong>{lobby.players.length}</strong><span>SPIELER</span></div><div><strong>{lobby.result.survivors.length}</strong><span>ÜBERLEBENDE</span></div><div><strong>{formatTime((lobby.result.endedAt - (lobby.startedAt ?? lobby.createdAt)) / 1000)}</strong><span>GESPIELT</span></div></div><p className="fineprint">Die Standortfreigabe ist beendet. GPS-Pins und Fangcodes werden aus dem Matchzustand entfernt.</p><div className="button-row"><button className="button primary" disabled={busy} onClick={leave}>Zur Übersicht <ArrowRight size={16}/></button><Link className="button" to="/history">Matchhistorie</Link></div></section>
    <div className="panel"><h3>Deine Crew</h3>{lobby.players.map(player => <div className="player-row" key={player.id}><Avatar name={player.username} url={player.avatar_url}/><div className="player-info"><strong>{player.username}</strong><span>{ROLE_LABELS[player.role]}</span></div><span className={lobby.result!.survivors.includes(player.id) ? 'ready-badge' : 'waiting-badge'}>{lobby.result!.survivors.includes(player.id) ? 'ÜBERLEBT' : player.eliminated ? 'AUSGESCHIEDEN' : 'MATCH BEENDET'}</span></div>)}</div>
  </>;

  return <>
    <PageHeader eyebrow={`${modeName} / LOBBY ${lobby.code}`} title={self.eliminated ? 'Für dich ist die Jagd vorbei.' : role === 'spectator' ? 'Dein Blick aufs Spielfeld.' : 'Die Jagd läuft.'} description={self.eliminated ? 'Du bist ausgeschieden. Deine Standortfreigabe ist beendet; du kannst die Ereignisse weiterverfolgen.' : 'Achte auf deine Umgebung. Sicherheit geht vor Geschwindigkeit.'} action={<span className={`tag role-${role}`} data-testid="role-label">{self.eliminated ? 'ELIMINIERT' : ROLE_LABELS[role]}</span>}/>
    {hidden && <div className="connection-banner" role="status">Die App ist im Hintergrund. GPS-Meldungen sind hier nicht zuverlässig. Öffne MANHUNT wieder im Vordergrund.</div>}
    {preparing && <section className={`panel role-reveal role-${role}`} aria-live="polite"><span className="eyebrow">ROLLE ZUGEWIESEN / SERVER BESTÄTIGT</span><h2>DU BIST {ROLE_LABELS[role]}</h2><p>{ROLE_INFO[role]}</p><div className="game-countdown">{formatTime(((lobby.startedAt ?? effectiveNow) - effectiveNow) / 1000)}</div><span className="eyebrow">VORBEREITUNGSZEIT</span></section>}
    {headStart && !self.eliminated && role !== 'spectator' && <div className="panel game-status"><Timer size={23}/><div><strong>{hunter ? 'HUNTER WARTEN' : 'DEIN VORSPRUNG LÄUFT'}</strong><p>{hunter ? 'Bleibe am vereinbarten Startpunkt. Fangaktionen sind noch gesperrt.' : 'Nutze den Vorsprung und bleibe innerhalb der sicheren Zone.'}</p></div><strong className="game-countdown">{formatTime((headStartEnd - effectiveNow) / 1000)}</strong></div>}
    {lobby.status === 'paused' && <section className="panel pause-screen" role="status"><Pause size={36}/><h2>NOTFALL-PAUSE</h2><p>Bleibt an einem sicheren Ort. Countdown und Fangaktionen sind pausiert. Die Standortfreigabe auf diesem Gerät wurde beendet.</p>{host ? <button className="button primary" disabled={busy || !connected} onClick={() => run(() => command({ type: 'resume' }))}><Play size={17}/> Match fortsetzen</button> : <p>Der Host kann das Match fortsetzen, sobald die Crew bereit ist.</p>}</section>}
    {outsideFresh && !self.eliminated && lobby.status === 'active' && <section className="warning-screen" role="alert"><AlertTriangle size={40}/><div><h2>ACHTUNG! AUSSERHALB DER SPIELZONE</h2><p>KEHRE IN DIE SPIELZONE ZURÜCK</p><small>Wähle einen sicheren Weg. Straßen und Sperrflächen haben Vorrang.</small></div><strong className="game-countdown">{formatTime(lobby.settings.outsideGraceSeconds - (effectiveNow - self.outsideSince!) / 1000)}</strong></section>}
    {infectionPending && <section className="infection-screen" role="alert"><Skull size={42}/><span className="eyebrow">INFEKTION SERVERSEITIG REGISTRIERT</span><h2>DU WURDEST INFIZIERT.</h2><p>Du bist bereits ein Zombie. Bestätige die Meldung, um dich neu zu orientieren.</p><label className="swipe-control">Nach rechts wischen, um zu bestätigen<input aria-label="Infektion bestätigen" type="range" min="0" max="100" value={infectionSwipe} onChange={event => { const value = Number(event.target.value); setInfectionSwipe(value); if (value === 100 && !busy) void run(async () => { await command({ type: 'infection_ack' }); setAcknowledgedAt(self.infectedAt ?? null); setInfectionSwipe(0); }); }}/></label><p className="fineprint">Auch mit Pfeiltasten und Ende-Taste bedienbar. Die Bestätigung verändert deine Rolle nicht.</p></section>}
    <div className="game-layout"><div className="game-map-panel"><MapView zone={lobby.zone} activeZone={lobby.activeZone} pins={lobby.pins} location={location} role={role} onLocationRequest={!self.eliminated && role !== 'spectator' ? refreshLocation : undefined}/><div className="game-map-summary"><span><Users size={15}/>{activePlayers.filter(player => player.role === 'hider').length} HIDER AKTIV</span><span><MapPin size={15}/>{lobby.pins.length} SICHTBARE PINS</span><span><Timer size={15}/>{formatTime(((lobby.endsAt ?? effectiveNow) - effectiveNow) / 1000)}</span></div>{lobby.settings.mode === 'apocalypse' && <div className="inline-info"><Radio size={18}/><p>{nextPhase ? <>Nächste Zonenphase in <strong>{formatTime(((lobby.startedAt ?? effectiveNow) + nextPhase.afterSeconds * 1000 - effectiveNow) / 1000)}</strong>. Größe: {Math.round(nextPhase.scale * 100)} % der Startzone.</> : 'Finale Zone erreicht. Bleibe innerhalb der markierten Grenze.'}</p></div>}</div>
    <aside className="game-sidebar">
      <section className={`panel role-panel role-${role}`}><div className="panel-heading"><h3>{self.eliminated ? 'Zuschaueransicht' : ROLE_LABELS[role]}</h3>{hunter ? <Crosshair size={22}/> : role === 'spectator' || self.eliminated ? <Eye size={22}/> : <Shield size={22}/>}</div><p>{self.eliminated ? 'Du siehst Ereignisse, aber keine geschützten Spielerstandorte.' : ROLE_INFO[role]}</p>{lobby.settings.mode === 'team_hunt' && <span className="tag">TEAM {self.team}</span>}{role === 'zombie' && infectionRemaining > 0 && <p>Infektionszeit: <strong>{formatTime(infectionRemaining)}</strong></p>}</section>
      {!self.eliminated && role !== 'spectator' && <section className="panel gps-consent"><div className="panel-heading"><h3>Standortfreigabe</h3><LocateFixed size={20} className={sharing ? 'accent' : ''}/></div>{!sharing ? <><label className="check-row"><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)}/><span>Ich teile meinen Standort während dieses Matches. Hider-Pins werden nach den Regeln an berechtigte Mitspieler weitergegeben.</span></label><button className="button primary full" disabled={!consented || !connected || !['preparing', 'active'].includes(lobby.status)} onClick={startSharing}><LocateFixed size={16}/> GPS aktivieren</button></> : <><div className="gps-status"><span className="live-dot"/><strong>FREIGABE AKTIV</strong><span>{location ? `± ${Math.round(location.accuracy)} m` : 'Ortung läuft…'}</span></div>{(role === 'hider' || role === 'zombie' && lobby.settings.zombieGps) && <div className="pin-countdown"><span className="eyebrow">{pinDue <= 0 ? 'GPS-PIN FÄLLIG' : 'NÄCHSTER GPS-PIN'}</span><strong className="game-countdown">{formatTime(pinDue / 1000)}</strong></div>}<button className="button full" disabled={!connected || inFlight.current} onClick={refreshLocation}><MapPin size={16}/> Standort jetzt prüfen</button><button className="button subtle full danger-text" onClick={endSharing}>Standortfreigabe beenden</button></>}{gpsError && <p className="form-error" role="status">{gpsError}</p>}<p className="fineprint">Die App muss geöffnet bleiben. Hintergrund-GPS auf iPhone und Android ist nicht dauerhaft zuverlässig. Bei ausgeschaltetem Bildschirm kann der Pin ausbleiben.</p></section>}
      {self.captureCode && lobby.settings.captureMethod === 'code' && !self.eliminated && role === 'hider' && <section className="panel"><h3>Dein Fangcode</h3><p>Zeige ihn ausschließlich dem Hunter, der dich tatsächlich gefangen hat.</p><button className="button full" onClick={() => setShowCode(value => !value)}>{showCode ? self.captureCode : 'Fangcode anzeigen'}<Eye size={16}/></button></section>}
      {hunter && !self.eliminated && <form className="panel capture-panel" onSubmit={event => { event.preventDefault(); void run(async () => { await command({ type: 'capture', targetId, ...(lobby.settings.captureMethod === 'code' ? { code: captureCode } : {}) }); setCaptureCode(''); notify(lobby.settings.captureMethod === 'confirmation' ? 'Fangbestätigung angefragt.' : 'Fang wurde serverseitig geprüft.'); }); }}><div className="panel-heading"><h3>Spieler fangen</h3><Crosshair size={21}/></div><label>Hider auswählen<select required value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">Spieler auswählen</option>{targets.map(player => <option value={player.id} key={player.id}>{player.username}{lobby.settings.mode === 'team_hunt' ? ` · Team ${player.team}` : ''}</option>)}</select></label>{lobby.settings.captureMethod === 'code' && <label>Fangcode des Hiders<input required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" value={captureCode} onChange={event => setCaptureCode(event.target.value.replace(/\D/g, ''))}/></label>}<button className="button primary full" disabled={busy || !targetId || !targets.some(player => player.id === targetId) || !connected || lobby.status !== 'active' || headStart || infectionRemaining > 0}><Flag size={16}/>{lobby.settings.captureMethod === 'confirmation' ? 'Fang anfragen' : 'Gefangen nehmen'}</button><p className="fineprint">Keine riskanten Verfolgungen oder Berührungen. GPS allein ist kein fälschungssicherer Fangnachweis.</p>{requestingCaptures.map(capture => <p className="inline-info" key={capture.id}>Warte auf Bestätigung von {lobby.players.find(player => player.id === capture.targetId)?.username}. {formatTime((capture.createdAt + 30000 - now) / 1000)}</p>)}</form>}
      {pendingCaptures.map(capture => <section className="panel capture-request" key={capture.id} role="alert"><Crosshair size={26}/><h3>Wurdest du gefangen?</h3><p>{lobby.players.find(player => player.id === capture.hunterId)?.username} hat einen Fang angefragt. Bestätige nur einen tatsächlichen Fang.</p><p>{formatTime((capture.createdAt + 30000 - now) / 1000)} verbleibend</p><div className="button-row"><button className="button primary" disabled={busy || !connected} onClick={() => run(() => command({ type: 'confirm_capture', captureId: capture.id, accept: true }))}><Check size={16}/> Fang bestätigen</button><button className="button" disabled={busy || !connected} onClick={() => run(() => command({ type: 'confirm_capture', captureId: capture.id, accept: false }))}><X size={16}/> Ablehnen</button></div></section>)}
      {host && lobby.settings.allowHealing && lobby.players.some(player => player.role === 'zombie' && !player.eliminated) && <section className="panel"><h3>Heilung</h3>{lobby.players.filter(player => player.role === 'zombie' && !player.eliminated).map(player => <button key={player.id} className="button full" disabled={busy || lobby.status !== 'active'} onClick={() => run(() => command({ type: 'heal', playerId: player.id }))}>{player.username} heilen</button>)}</section>}
    </aside></div>
    <div className="game-actions"><button className="button danger" disabled={busy || !connected || lobby.status === 'paused'} onClick={() => { stopWatch(); void run(() => command({ type: 'pause' })); }}><Pause size={17}/> Notfall-Pause</button><button className="button subtle" disabled={busy} onClick={leave}><DoorOpen size={17}/> Match verlassen</button><Link className="text-link" to="/safety"><Shield size={15}/> Outdoor-Kodex</Link></div>
    <section className="panel game-events"><div className="panel-heading"><h3>Live-Protokoll</h3><Radio size={18}/></div>{lobby.events.length ? [...lobby.events].reverse().slice(0, 15).map(event => <div className="game-event" key={event.id}><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.message}</span></div>) : <p>Noch keine Match-Ereignisse.</p>}</section>
  </>;
}
