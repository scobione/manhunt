import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Command, LobbyView, LocationSample } from '../shared/types';
import {observeGps} from './gps-observer';
import {gpsObservationInterval} from './gps-quality';

/** One explicit location grant per open lobby. It survives lobby → game navigation,
 * never a reload, account/lobby switch, elimination or leaving the playing screens. */
export function useMatchLocation(lobby: LobbyView | null, connected: boolean,
  command: (value: Command) => Promise<LobbyView>, notify: (message: string) => void) {
  const { pathname } = useLocation();
  const [sharing, setSharing] = useState(false), [consented, setConsented] = useState(false);
  const [location, setLocation] = useState<LocationSample | null>(null), [gpsError, setGpsError] = useState('');
  const observer = useRef<ReturnType<typeof observeGps>|null>(null), generation = useRef(0), sharingRef = useRef(false);
  const grantOwner=useRef('');
  const inFlight = useRef(false), pending = useRef<Promise<unknown> | null>(null), lastSent = useRef(0);
  const lastSample=useRef({owner:'',timestamp:0});
  const current = useRef({ lobby, connected, command, pathname });
  current.current = { lobby, connected, command, pathname };
  const allowed = !!lobby && !lobby.self.eliminated && lobby.self.role !== 'spectator'
    && ['waiting', 'preparing', 'active', 'paused'].includes(lobby.status)
    && ['/lobby', '/game', '/results'].includes(pathname);
  const allowedRef = useRef(allowed); allowedRef.current = allowed;
  const stopWatch = useCallback(() => {
    sharingRef.current = false; grantOwner.current=''; generation.current++;
    observer.current?.stop();observer.current=null;
    lastSample.current={owner:'',timestamp:0};
    setSharing(false); setLocation(null); setConsented(false);
  }, []);
  const revoke = useCallback(() => {
    const previous = current.current;
    stopWatch();
    if (previous.lobby && previous.connected && ['waiting', 'preparing', 'active', 'paused'].includes(previous.lobby.status)) {
      // If a position request is already in flight, revoke after it settles as well.
      // The stop command always belongs to this same lobby/identity, never a new one.
      const id = previous.lobby.id, user = previous.lobby.self.id;
      const send = () => {
        if (current.current.lobby?.id !== id || current.current.lobby.self.id !== user || sharingRef.current) return;
        return current.current.command({ type: 'stop_location' }).catch(() => {});
      };
      void send(); if (pending.current) void pending.current.finally(send);
    }
  }, [stopWatch]);
  const validCallback = (version: number) => sharingRef.current && version === generation.current && allowedRef.current && grantOwner.current===`${current.current.lobby?.id}:${current.current.lobby?.self.id}`;
  const onFix = useCallback((position: GeolocationPosition, force = false, version = generation.current) => {
    if (!validCallback(version)) return;
    const state = current.current, match = state.lobby;
    if (!match) return;
    const sample: LocationSample = { latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy, timestamp: position.timestamp };
    // Lobby positions are used only to check readiness, not displayed or retained.
    setLocation(match.status === 'waiting' ? null : sample);
    setGpsError(sample.accuracy > match.settings.maxAccuracyMeters ? `GPS ± ${Math.round(sample.accuracy)} m: zu ungenau. Warte auf eine genauere Ortung.` : '');
    const interval = match.status === 'waiting' ? 10000 : match.self.role === 'hunter' ? match.settings.hunterUpdateSeconds * 1000 : 3000;
    const owner=`${match.id}:${match.status==='waiting'?'lobby':'game'}`;
    if (!state.connected || inFlight.current || lastSample.current.owner===owner&&sample.timestamp<=lastSample.current.timestamp || (!force && Date.now() - lastSent.current < interval)) return;
    lastSent.current = Date.now(); inFlight.current = true;
    lastSample.current={owner,timestamp:sample.timestamp};
    const request = state.command(match.status === 'waiting' ? { type: 'location_check', location: sample }
      : { type: 'location', location: sample, publish: force });
    pending.current = request.catch(error => { if (validCallback(version)) setGpsError(error instanceof Error ? error.message : 'Der Standort konnte nicht übertragen werden.'); })
      .finally(() => { inFlight.current = false; pending.current = null; });
  }, []);
  const gpsFailed=useCallback((error:GeolocationPositionError,version:number)=>{
      if (!validCallback(version)) return;
      setGpsError(error.code === 1 ? 'Standortzugriff verweigert. Erlaube den Standort in den Browser-Einstellungen, um aktiv mitzuspielen.'
        : 'Keine aktuelle Ortung. Lass MANHUNT geöffnet und warte an einem sicheren Ort unter freiem Himmel auf besseren Empfang.');
      if (error.code === 1) revoke();
  },[revoke]);
  const locate = useCallback((force = false) => observer.current?.refresh(force),[]);
  function startSharing() {
    if (!consented) { setGpsError('Bitte bestätige zuerst die Standortfreigabe.'); return; }
    if (!allowedRef.current) return;
    if (!navigator.geolocation) { setGpsError('Dein Browser unterstützt keine Standortabfrage. Nutze einen aktuellen Browser.'); return; }
    if (!window.isSecureContext) { setGpsError('Standortfreigabe benötigt eine sichere HTTPS-Verbindung.'); return; }
    if (observer.current !== null) return;
    sharingRef.current = true; grantOwner.current=`${current.current.lobby?.id}:${current.current.lobby?.self.id}`; const version = ++generation.current;
    setSharing(true); setGpsError(''); lastSent.current = 0;
    observer.current=observeGps({position:(position,force)=>onFix(position,force,version),error:error=>gpsFailed(error,version),cadence:()=>{
      const match=current.current.lobby;
      return match?gpsObservationInterval(match.status,match.self.role==='hunter'?match.settings.hunterUpdateSeconds:3):0;
    }});
    if(!validCallback(version)){observer.current.stop();observer.current=null;}
  }
  function refreshLocation() { if (!sharingRef.current) startSharing(); else locate(true); }
  function endSharing() { revoke(); notify('Standortfreigabe beendet. Für die aktive Teilnahme musst du sie wieder aktivieren.'); }
  useEffect(() => {
    if (!allowed) revoke();
  }, [allowed, revoke]);
  useEffect(() => {
    stopWatch(); setGpsError('');
    return stopWatch;
  }, [lobby?.id, lobby?.self.id, stopWatch]);
  useEffect(() => {
    if (sharingRef.current) { observer.current?.reconfigure();lastSent.current = 0; locate(); }
  }, [lobby?.status, connected, locate]);
  useEffect(() => {
    let active = true, permission: PermissionStatus | undefined;
    const changed = () => { if (permission?.state === 'denied' && sharingRef.current) { revoke(); setGpsError('Standortberechtigung entzogen. Erlaube den Zugriff erneut, um aktiv mitzuspielen.'); } };
    void navigator.permissions?.query({ name: 'geolocation' }).then(value => {
      if (!active) return; permission = value; permission.addEventListener('change', changed); changed();
    }).catch(() => {});
    return () => { active = false; permission?.removeEventListener('change', changed); };
  }, [revoke]);
  return { sharing, consented, setConsented, location, gpsError, startSharing, refreshLocation, endSharing, stopWatch, inFlight };
}
