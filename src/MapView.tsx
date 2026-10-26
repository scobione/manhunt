import {activeExclusions} from '../shared/rules';
import type {XpPoint} from '../shared/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// Explicitly bundle the matching worker; MapLibre 6's default sibling URL is not valid after Vite chunking.
maplibregl.setWorkerUrl(mapWorkerUrl);
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { bbox, circle, distance, featureCollection } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { Crosshair, Expand, LocateFixed, Radio, WifiOff } from 'lucide-react';
import {endZone} from '../shared/zones';
import type { LocationSample, Pin, Role, Zone } from '../shared/types';
import 'maplibre-gl/dist/maplibre-gl.css';
import './maps.css';

export interface MapViewProps {
  zone?: Zone | null;
  activeZone?: Feature<Polygon>;
  finalScale?: number;
  showEndZone?: boolean;
  pins?: Pin[];
  xpPoint?:XpPoint;
  location?: LocationSample | null;
  className?: string;
  role?: Role;
  onLocationRequest?: () => void;
}

/** Visible viewport tiles only; the browser honours the tile server's cache headers. */
export function tacticalStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.75, 'raster-brightness-max': 0.65 } }],
  };
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export default function MapView({ zone, activeZone, finalScale=.1, showEndZone=true, pins = [], xpPoint, location, role = 'hider', className = '', onLocationRequest }: MapViewProps) {
  const finalZone=useMemo(()=>{if(!showEndZone||!zone||!zone.shrinkTarget&&!zone.randomCorners)return null;try{return endZone(zone,finalScale);}catch{return null;}},[zone,finalScale,showEndZone]);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const initiallyFitted = useRef(false);
  const latest = useRef({ zone, activeZone, location });
  latest.current = { zone, activeZone, location };
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [following, setFollowing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    let map: maplibregl.Map;
    let resize: ResizeObserver | undefined;
    try {
      map = new maplibregl.Map({
        container: hostRef.current,
        style: tacticalStyle(),
        center: [10.45, 51.16],
        zoom: 5,
        attributionControl: { compact: false },
        maxZoom: 19,
        renderWorldCopies: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 100 }), 'bottom-left');
      map.on('dragstart', () => setFollowing(false));
      map.on('error', (event) => {
        if (event.error?.message && !event.error.message.includes('abort')) {
          setMapError('Kartenkacheln konnten nicht vollständig geladen werden. Prüfe deine Verbindung.');
        }
      });
      map.on('idle', () => { if (navigator.onLine && map.areTilesLoaded()) setMapError(''); });
      map.on('style.load', () => {
        for (const name of ['safe-zone', 'active-zone', 'end-zone', 'excluded', 'accuracy', 'xp-radius']) {
          map.addSource(name, { type: 'geojson', data: featureCollection([]) });
        }
        map.addLayer({ id: 'safe-zone-fill', type: 'fill', source: 'safe-zone', paint: { 'fill-color': '#00FF9C', 'fill-opacity': 0.08 } });
        map.addLayer({ id: 'safe-zone-line', type: 'line', source: 'safe-zone', paint: { 'line-color': '#00FF9C', 'line-width': 2, 'line-dasharray': [3, 2] } });
        map.addLayer({ id: 'active-zone-fill', type: 'fill', source: 'active-zone', paint: { 'fill-color': '#00FF9C', 'fill-opacity': 0.1 } });
        map.addLayer({ id: 'active-zone-line', type: 'line', source: 'active-zone', paint: { 'line-color': '#00FF9C', 'line-width': 3 } });
        map.addLayer({id:'end-zone-fill',type:'fill',source:'end-zone',paint:{'fill-color':'#00B8FF','fill-opacity':.16}});
        map.addLayer({id:'end-zone-line',type:'line',source:'end-zone',paint:{'line-color':'#00B8FF','line-width':2,'line-dasharray':[2,1]}});
        map.addLayer({ id: 'excluded-fill', type: 'fill', source: 'excluded', paint: { 'fill-color': '#FF3B45', 'fill-opacity': 0.3 } });
        map.addLayer({ id: 'excluded-line', type: 'line', source: 'excluded', paint: { 'line-color': '#FF3B45', 'line-width': 2 } });
        map.addLayer({id:'xp-radius-fill',type:'fill',source:'xp-radius',paint:{'fill-color':'#00b8ff','fill-opacity':.2}});
        map.addLayer({id:'xp-radius-line',type:'line',source:'xp-radius',paint:{'line-color':'#00b8ff','line-width':2}});
        map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#00B8FF', 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': '#00B8FF', 'line-width': 1, 'line-opacity': 0.5 } });
        setLoaded(true);
        const initialZone = latest.current.activeZone ?? latest.current.zone?.feature;
        if (initialZone) {
          const bounds = bbox(initialZone);
          map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 48, maxZoom: 17, duration: 0 });
          initiallyFitted.current = true;
        }
      });
      resize = new ResizeObserver(() => map.resize());
      resize.observe(hostRef.current);
    } catch {
      setMapError('Dein Browser kann die interaktive Karte nicht darstellen. Aktiviere WebGL oder nutze einen aktuellen Browser.');
    }
    return () => {
      resize?.disconnect();
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      initiallyFitted.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    (map.getSource('safe-zone') as GeoJSONSource)?.setData(zone?.feature ?? featureCollection([]));
    (map.getSource('active-zone') as GeoJSONSource)?.setData(activeZone ?? featureCollection([]));
    (map.getSource('end-zone') as GeoJSONSource)?.setData(finalZone??featureCollection([]));
    (map.getSource('excluded') as GeoJSONSource)?.setData(featureCollection(activeExclusions(zone)));
    const currentZone = activeZone ?? zone?.feature;
    if (currentZone && !initiallyFitted.current) {
      const bounds = bbox(currentZone);
      map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 48, maxZoom: 17, duration: 0 });
      initiallyFitted.current = true;
    }
  }, [loaded, zone, activeZone, finalZone]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = window.setInterval(() => {
      if (!map.getLayer('active-zone-line') || document.hidden) return;
      map.setPaintProperty('active-zone-line', 'line-opacity', 0.65 + Math.sin(Date.now() / 900) * 0.3);
    }, 200);
    return () => window.clearInterval(animation);
  }, [loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    (map.getSource('xp-radius') as GeoJSONSource)?.setData(xpPoint?circle([xpPoint.longitude,xpPoint.latitude],xpPoint.radiusMeters/1000):featureCollection([]));
    if(xpPoint){const el=document.createElement('div');el.className='mh-xp-pin';el.textContent=xpPoint.confirmed?'XP':'?';el.setAttribute('aria-label',`XP-Punkt ${xpPoint.id}`);markersRef.current.push(new maplibregl.Marker({element:el}).setLngLat([xpPoint.longitude,xpPoint.latitude]).addTo(map));}
    if (location) {
      const element = document.createElement('div');
      element.className = `mh-pin mh-pin-own mh-pin-${role}`;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', `Dein Standort, Genauigkeit ${Math.round(location.accuracy)} Meter`);
      markersRef.current.push(new maplibregl.Marker({ element }).setLngLat([location.longitude, location.latitude]).addTo(map));
      const accuracy = Number.isFinite(location.accuracy) && location.accuracy > 0 && location.accuracy <= 10000
        ? circle([location.longitude, location.latitude], location.accuracy / 1000, { steps: 48 })
        : featureCollection([]);
      (map.getSource('accuracy') as GeoJSONSource)?.setData(accuracy);
    } else {
      (map.getSource('accuracy') as GeoJSONSource)?.setData(featureCollection([]));
    }
    for (const pin of pins.filter(pin => pin.expiresAt > now)) {
      const element = document.createElement('button');
      element.type = 'button';
      const observedAt=pin.observedAt??pin.createdAt;const stale=!!pin.stale||now-observedAt>15000;
      element.className = `mh-pin mh-pin-${pin.role} ${stale?'mh-pin-old':''} ${pin.kind==='live'?'mh-pin-live':''}`;
      element.dataset.testid='map-player-pin';element.dataset.playerId=pin.playerId;
      const time = new Date(observedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      element.setAttribute('aria-label', `${pin.username}, ${pin.role}, ${stale?'letzter bekannter Standort':pin.kind==='live'?'Live-Position':'Standortmeldung'} ${time}`);
      const popup = document.createElement('div');
      popup.className = 'mh-map-popup';
      const name = document.createElement('strong');
      name.textContent = pin.username;
      const detail = document.createElement('p');
      detail.textContent = `${time} · ± ${Math.round(pin.accuracy)} m`;
      const caveat = document.createElement('small');
      caveat.textContent = stale?`Letzter bekannter Standort · vor ${Math.max(0,Math.floor((now-observedAt)/1000))} s`:pin.kind==='live'?'Neueste Team-Position':'Intervall-Pin';
      const label=document.createElement('span');label.className='mh-pin-label';label.textContent=`${pin.username}${stale?' · ALT':pin.kind==='live'?' · LIVE':''}`;element.append(label);
      if(pin.avatar_url){const img=document.createElement('img');img.src=pin.avatar_url;img.alt='';img.referrerPolicy='no-referrer';img.width=30;img.height=30;img.style.borderRadius='50%';element.append(img);}
      popup.append(name, detail, caveat);
      if (location) {
        const range = document.createElement('p');
        range.textContent = `${formatDistance(distance([location.longitude, location.latitude], [pin.longitude, pin.latitude], { units: 'meters' }))} Luftlinie`;
        popup.append(range);
      }
      const marker = new maplibregl.Marker({ element }).setLngLat([pin.longitude, pin.latitude])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: true }).setDOMContent(popup)).addTo(map);
      markersRef.current.push(marker);
    }
  // Rebuild only when pin membership/data or own GPS changes, not once every second.
  }, [loaded, pins, xpPoint, location, role, Math.floor(now / 30_000)]);

  useEffect(() => {
    if (following && location && mapRef.current) {
      mapRef.current.easeTo({ center: [location.longitude, location.latitude], zoom: Math.max(15, mapRef.current.getZoom()), duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 });
    }
  }, [following, location]);

  const fitZone = () => {
    const feature = activeZone ?? zone?.feature;
    if (!feature || !mapRef.current) return;
    const bounds = bbox(feature);
    setFollowing(false);
    mapRef.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 48, maxZoom: 17, duration: 0 });
  };
  const freshLocation = location && now - location.timestamp < 30_000;

  return <section className={`mh-map-wrap ${className}`} aria-label="Taktische Spielkarte">
    <div ref={hostRef} className="mh-map-canvas" data-testid="game-map" />
    <div className="mh-map-status"><Radio size={13} /><span>{!online ? 'OFFLINE' : freshLocation ? `GPS ± ${Math.round(location.accuracy)} M` : location ? 'GPS VERALTET' : 'GPS INAKTIV'}</span></div>
    <div className="mh-map-tools">
      <button type="button" title="Spielzone anzeigen" aria-label="Spielzone anzeigen" disabled={!zone && !activeZone} onClick={fitZone}><Expand size={18} /></button>
      <button type="button" title={following ? 'Automatische Zentrierung beenden' : 'Eigenen Standort zentrieren'} aria-label={following ? 'Automatische Zentrierung beenden' : 'Eigenen Standort zentrieren'} aria-pressed={following} onClick={() => location ? setFollowing(value => !value) : onLocationRequest?.()} disabled={!location && !onLocationRequest}>{following ? <LocateFixed size={18} /> : <Crosshair size={18} />}</button>
    </div>
    <div className="mh-map-legend"><span><i className="mh-legend-dot own" />DU</span><span><i className="mh-legend-dot hider" />HIDER</span><span><i className="mh-legend-dot hunter" />HUNTER</span><span><i className="mh-legend-dot zombie" />ZOMBIE</span>{finalZone&&<span><i className="mh-legend-dot end"/>ENDZONE</span>}</div>
    {(!online || mapError) && <div className="mh-map-error" role="status"><WifiOff size={16} />{!online ? 'Offline. Karten, Standortmeldungen und Spielstand werden erst nach Wiederverbindung aktualisiert.' : mapError}</div>}
  </section>;
}
