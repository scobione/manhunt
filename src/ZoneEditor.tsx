import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { area, bbox, bearing, center, circle, distance, featureCollection, lineString, polygon } from '@turf/turf';
import type { Feature, Polygon, Position } from 'geojson';
import { Check, Circle, Crosshair, Download, MapPin, Octagon, Plus, RotateCcw, Save, ShieldAlert, Square, Trash2, Undo2, Upload, X } from 'lucide-react';
import type { Zone } from '../shared/types';
import { tacticalStyle } from './MapView';
import './maps.css';
import { MAX_ZONE_FILE_BYTES, parseZoneFile, serializeZone, validZone } from './zoneFiles';

type Shape = 'circle' | 'rectangle' | 'octagon' | 'custom';
interface SavedZone { id: string; zone: Zone }
export interface ZoneEditorProps {
  value?: Zone | null;
  onChange?: (zone: Zone) => void;
  onSave?: (zone: Zone) => void | Promise<void>;
  readOnly?: boolean;
}
const STORAGE_KEY = 'manhunt.saved-zones.v1';
const empty = featureCollection([]);

function zoneControls(zone: Zone) {
  const origin = center(zone.feature).geometry.coordinates as [number, number];
  const points = zone.feature.geometry.coordinates[0];
  const shape: Shape = points.length === 5 ? 'rectangle' : points.length === 9 ? 'octagon' : points.length === 65 ? 'circle' : 'custom';
  return { origin, shape, radius: Math.max(20, Math.min(10000, Math.round(distance(origin, points[0], { units: 'meters' })))), rotation: Math.round((360 - bearing(origin, points[0])) % 360) };
}

function regularZone(origin: [number, number], radius: number, shape: Shape, rotation: number): Feature<Polygon> {
  const result = circle(origin, radius / 1000, { steps: shape === 'circle' ? 64 : shape === 'rectangle' ? 4 : 8 });
  if (shape !== 'circle' && rotation !== 0) {
    // The first Turf circle vertex points north. Rotating bearings keeps distances on the sphere.
    const radians = rotation * Math.PI / 180;
    const latitudeScale = Math.cos(origin[1] * Math.PI / 180);
    const coords = result.geometry.coordinates[0].map(([lng, lat]) => {
      const x = (lng - origin[0]) * latitudeScale;
      const y = lat - origin[1];
      return [origin[0] + (x * Math.cos(radians) - y * Math.sin(radians)) / latitudeScale, origin[1] + x * Math.sin(radians) + y * Math.cos(radians)];
    });
    result.geometry.coordinates = [coords];
  }
  return result;
}

function loadPresets(): SavedZone[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is SavedZone => typeof item?.id === 'string' && validZone(item.zone)).slice(0, 20);
  } catch { return []; }
}

export default function ZoneEditor({ value = null, onChange, onSave, readOnly = false }: ZoneEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [draft, setDraft] = useState<Zone | null>(value);
  const [shape, setShape] = useState<Shape>(() => value ? zoneControls(value).shape : 'circle');
  const [origin, setOrigin] = useState<[number, number] | null>(value ? center(value.feature).geometry.coordinates as [number, number] : null);
  const [radius, setRadius] = useState(() => value ? zoneControls(value).radius : 500);
  const [unit, setUnit] = useState<'m' | 'km'>('m');
  const [rotation, setRotation] = useState(() => value ? zoneControls(value).rotation : 0);
  const [placingCenter, setPlacingCenter] = useState(!value);
  const [drawingExclusion, setDrawingExclusion] = useState(false);
  const [exclusionPoints, setExclusionPoints] = useState<Position[]>([]);
  const [selectedExclusion, setSelectedExclusion] = useState<number | null>(null);
  const [safetyChecked, setSafetyChecked] = useState(value?.confirmed ?? false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedZone[]>(loadPresets);
  const [selectedPreset, setSelectedPreset] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const controls = useRef({ shape, origin, radius, rotation, placingCenter, drawingExclusion, exclusionPoints, readOnly });
  controls.current = { shape, origin, radius, rotation, placingCenter, drawingExclusion, exclusionPoints, readOnly };
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };

  const updateDraft = (next: Zone, changedGeometry = true) => {
    const updated = { ...next, confirmed: changedGeometry ? false : next.confirmed };
    draftRef.current = updated;
    setDraft(updated);
    if (changedGeometry) setSafetyChecked(false);
    setMessage('');
    callbacks.current.onChange?.(updated);
  };

  useEffect(() => {
    if (JSON.stringify(value) === JSON.stringify(draftRef.current)) return;
    setDraft(value);
    draftRef.current = value;
    setSafetyChecked(value?.confirmed ?? false);
    if (value) {
      const settings = zoneControls(value);
      setOrigin(settings.origin); setShape(settings.shape); setRadius(settings.radius); setRotation(settings.rotation);
      setPlacingCenter(false); setDrawingExclusion(false); setExclusionPoints([]); setSelectedExclusion(null);
      if (mapRef.current && loaded) fitZone(mapRef.current, value);
    }
  }, [value]);

  useEffect(() => {
    if (!hostRef.current) return;
    let resize: ResizeObserver | undefined;
    try {
      const map = new maplibregl.Map({ container: hostRef.current, style: tacticalStyle(), center: [10.45, 51.16], zoom: 5, maxZoom: 19, renderWorldCopies: false, attributionControl: { compact: false } });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('style.load', () => {
        map.addSource('editor-zone', { type: 'geojson', data: empty });
        map.addSource('editor-excluded', { type: 'geojson', data: empty });
        map.addSource('editor-drawing', { type: 'geojson', data: empty });
        map.addLayer({ id: 'editor-zone-fill', type: 'fill', source: 'editor-zone', paint: { 'fill-color': '#00FF9C', 'fill-opacity': 0.14 } });
        map.addLayer({ id: 'editor-zone-line', type: 'line', source: 'editor-zone', paint: { 'line-color': '#00FF9C', 'line-width': 2 } });
        map.addLayer({ id: 'editor-excluded-fill', type: 'fill', source: 'editor-excluded', paint: { 'fill-color': '#FF3B45', 'fill-opacity': 0.3 } });
        map.addLayer({ id: 'editor-excluded-line', type: 'line', source: 'editor-excluded', paint: { 'line-color': '#FF3B45', 'line-width': 2, 'line-dasharray': [2, 1] } });
        map.addLayer({ id: 'editor-drawing-line', type: 'line', source: 'editor-drawing', paint: { 'line-color': '#FF3B45', 'line-width': 3, 'line-dasharray': [2, 1] } });
        setLoaded(true);
        if (draftRef.current) fitZone(map, draftRef.current);
      });
      map.on('click', event => {
        const state = controls.current;
        if (state.readOnly) return;
        if (state.drawingExclusion) {
          setExclusionPoints(points => points.length < 32 ? [...points, [event.lngLat.lng, event.lngLat.lat]] : points);
          return;
        }
        if (state.placingCenter) {
          const newCenter: [number, number] = [event.lngLat.lng, event.lngLat.lat];
          if (Math.abs(newCenter[1]) > 85) { setError('Wähle einen Mittelpunkt zwischen 85° Süd und 85° Nord.'); return; }
          const feature = regularZone(newCenter, state.radius, state.shape, state.rotation);
          setOrigin(newCenter);
          setPlacingCenter(false);
          updateDraft({ feature, excluded: [], name: draftRef.current?.name ?? 'Mein Revier', confirmed: false });
          setError('');
          map.fitBounds(new maplibregl.LngLatBounds([bbox(feature)[0], bbox(feature)[1]], [bbox(feature)[2], bbox(feature)[3]]), { padding: 70, maxZoom: 17, duration: 0 });
        }
      });
      map.on('error', event => { if (event.error?.message && !event.error.message.includes('abort')) setError('Einige Kartenkacheln sind nicht verfügbar. Prüfe deine Verbindung.'); });
      resize = new ResizeObserver(() => map.resize());
      resize.observe(hostRef.current);
    } catch {
      setError('Interaktive Karte nicht verfügbar. WebGL wird von diesem Browser nicht unterstützt.');
    }
    return () => {
      resize?.disconnect();
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    (map.getSource('editor-zone') as GeoJSONSource)?.setData(draft?.feature ?? empty);
    (map.getSource('editor-excluded') as GeoJSONSource)?.setData(featureCollection(draft?.excluded ?? []));
    (map.getSource('editor-drawing') as GeoJSONSource)?.setData(exclusionPoints.length >= 2 ? lineString(exclusionPoints) : empty);
    map.getCanvas().style.cursor = placingCenter || drawingExclusion ? 'crosshair' : '';
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    if (!draft || readOnly) return;
    const editingExclusion = selectedExclusion !== null ? draft.excluded[selectedExclusion] : undefined;
    const points = editingExclusion?.geometry.coordinates[0].slice(0, -1) ?? (shape !== 'circle' ? draft.feature.geometry.coordinates[0].slice(0, -1) : []);
    points.forEach((point, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `mh-zone-handle ${editingExclusion ? 'danger' : ''}`;
      element.setAttribute('aria-label', `${editingExclusion ? 'Sperrbereich' : 'Spielzone'} Eckpunkt ${index + 1}, mit Pfeiltasten verschieben`);
      element.textContent = String(index + 1);
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat([point[0], point[1]]).addTo(map);
      const move = (coordinates: [number, number]) => {
        const current = draftRef.current;
        if (!current) return;
        const target = selectedExclusion !== null ? current.excluded[selectedExclusion] : current.feature;
        if (!target) return;
        const ring = target.geometry.coordinates[0].map(position => [...position]);
        ring[index] = coordinates;
        ring[ring.length - 1] = [...ring[0]];
        const nextPolygon = polygon([ring]);
        const next = selectedExclusion !== null ? { ...current, excluded: current.excluded.map((feature, i) => i === selectedExclusion ? nextPolygon : feature) } : { ...current, feature: nextPolygon };
        if (!validZone(next)) {
          setError('Ungültige Grenze: Linien dürfen sich nicht kreuzen. Sperrbereiche müssen vollständig innerhalb der Zone bleiben.');
          marker.setLngLat([point[0], point[1]]);
          return;
        }
        setError('');
        updateDraft(next);
      };
      marker.on('dragend', () => { const position = marker.getLngLat(); move([position.lng, position.lat]); });
      element.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const position = marker.getLngLat();
        const step = event.shiftKey ? 0.0001 : 0.00001;
        move([position.lng + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), position.lat + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)]);
      });
      markersRef.current.push(marker);
    });
    exclusionPoints.forEach((point, index) => {
      const element = document.createElement('span');
      element.className = 'mh-zone-handle danger';
      element.textContent = String(index + 1);
      markersRef.current.push(new maplibregl.Marker({ element }).setLngLat([point[0], point[1]]).addTo(map));
    });
  }, [loaded, draft, shape, readOnly, exclusionPoints, selectedExclusion, placingCenter, drawingExclusion]);

  const regenerate = (nextShape = shape, nextRadius = radius, nextRotation = rotation, nextOrigin = origin) => {
    if (!nextOrigin || nextShape === 'custom') return;
    const feature = regularZone(nextOrigin, nextRadius, nextShape, nextRotation);
    const next: Zone = { feature, excluded: draft?.excluded ?? [], name: draft?.name ?? 'Mein Revier', confirmed: false };
    if (!validZone(next)) {
      setError('Die neue Grenze würde einen Sperrbereich ausschließen. Passe zuerst den Sperrbereich an.');
      return;
    }
    setError('');
    updateDraft(next);
  };
  const finishExclusion = () => {
    if (!draft || exclusionPoints.length < 3) return;
    const feature = polygon([[...exclusionPoints, [...exclusionPoints[0]]]]);
    const next = { ...draft, excluded: [...draft.excluded, feature] };
    if (!validZone(next)) { setError('Zeichne einen Bereich ohne gekreuzte Linien, mit mindestens 100 m² und vollständig innerhalb der Spielzone.'); return; }
    updateDraft(next);
    setSelectedExclusion(next.excluded.length - 1);
    setDrawingExclusion(false);
    setExclusionPoints([]);
    setError('');
  };
  const save = async () => {
    if (!draft || !safetyChecked) return;
    if (!validZone(draft)) { setError('Bitte korrigiere die Zonengrenze.'); return; }
    const confirmed = { ...draft, confirmed: true };
    setSaving(true);
    try {
      await callbacks.current.onSave?.(confirmed);
      updateDraft(confirmed, false);
      setError('');
      setMessage(callbacks.current.onSave ? 'Zone übernommen.' : 'Zone bestätigt. Speichere sie lokal, um sie später wiederzuverwenden.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Die Zone konnte nicht übernommen werden.'); }
    finally { setSaving(false); }
  };
  const saveLocal = () => {
    if (!draft || !validZone(draft)) return;
    const id = selectedPreset || crypto.randomUUID();
    const next = [...saved.filter(item => item.id !== id), { id, zone: draft }].slice(-20);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      setSelectedPreset(id);
      setMessage('Zone auf diesem Gerät gespeichert.');
    } catch { setError('Lokaler Speicher ist nicht verfügbar oder voll.'); }
  };
  const exportZone = () => {
    if (!draft) return;
    let data: string;
    try { data = serializeZone(draft); } catch (failure) { setError((failure as Error).message); return; }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/geo+json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'manhunt-zone.geojson';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openZone = (zone: Zone) => {
    const next = { ...zone, confirmed: false };
    const settings = zoneControls(next);
    updateDraft(next);
    setOrigin(settings.origin); setShape(settings.shape); setRadius(settings.radius); setRotation(settings.rotation);
    setPlacingCenter(false);
    setDrawingExclusion(false);
    setExclusionPoints([]);
    setSelectedExclusion(null);
    setError('');
    if (mapRef.current) fitZone(mapRef.current, next);
  };
  const playableArea = useMemo(() => draft ? Math.max(0, area(draft.feature) - draft.excluded.reduce((total, feature) => total + area(feature), 0)) : 0, [draft]);

  return <div className="mh-zone-editor">
    <div className="mh-zone-map-column">
      <div className="mh-zone-map" ref={hostRef} data-testid="zone-map" aria-label="Karte zum Bearbeiten der Spielzone" />
      <div className="mh-zone-map-instruction"><MapPin size={15} />{readOnly ? 'Bestätigtes Spielgebiet' : drawingExclusion ? `Sperrbereich: ${exclusionPoints.length} Punkte gesetzt` : placingCenter ? 'Tippe auf die Karte, um den Mittelpunkt zu setzen' : shape === 'circle' ? 'Radius einstellen oder Mittelpunkt neu setzen' : 'Eckpunkte ziehen oder mit Pfeiltasten verschieben'}</div>
      {drawingExclusion && <div className="mh-zone-draw-tools">
        <button type="button" onClick={() => setExclusionPoints(points => points.slice(0, -1))} disabled={!exclusionPoints.length}><Undo2 size={16} />Zurück</button>
        <button type="button" onClick={finishExclusion} disabled={exclusionPoints.length < 3}><Check size={16} />Abschließen</button>
        <button type="button" onClick={() => { setDrawingExclusion(false); setExclusionPoints([]); }}><X size={16} />Abbrechen</button>
      </div>}
      {draft && <button type="button" className="mh-zone-fit" aria-label="Zone auf Karte zentrieren" onClick={() => mapRef.current && fitZone(mapRef.current, draft)}><Crosshair size={18} /></button>}
    </div>
    <div className="mh-zone-panel">
      <div className="mh-zone-heading"><span>DEIN REVIER</span><strong>{playableArea >= 1_000_000 ? `${(playableArea / 1_000_000).toFixed(2)} km²` : `${Math.round(playableArea).toLocaleString('de-DE')} m²`}</strong></div>
      <p className="mh-map-muted">Die Karte bewertet keine Gefahren. Wähle nur sichere, öffentlich zugängliche Flächen.</p>
      <fieldset disabled={readOnly} className="mh-zone-fieldset">
        <legend className="mh-visually-hidden">Spielzone bearbeiten</legend>
        <label className="mh-map-field">Zonenname<input maxLength={60} value={draft?.name ?? ''} placeholder="Mein Revier" onChange={event => draft && updateDraft({ ...draft, name: event.target.value }, false)} disabled={!draft} /></label>
        <div className="mh-shape-select" role="group" aria-label="Zonenform">
          {([{ id: 'circle', label: 'Kreis', Icon: Circle }, { id: 'rectangle', label: 'Viereck', Icon: Square }, { id: 'octagon', label: 'Achteck', Icon: Octagon }] as const).map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={shape === id} onClick={() => { setShape(id); setSelectedExclusion(null); regenerate(id); }}><Icon size={19} />{label}</button>)}
        </div>
        {shape !== 'custom' && <div className="mh-zone-size-row"><label className="mh-map-field">{shape === 'circle' ? 'Radius' : 'Größe · Umkreisradius'}<input type="number" min={unit === 'm' ? 20 : 0.02} max={unit === 'm' ? 10000 : 10} step={unit === 'm' ? 10 : 0.01} value={unit === 'm' ? radius : radius / 1000} onChange={event => {
          const meters = Number(event.target.value) * (unit === 'm' ? 1 : 1000);
          if (Number.isFinite(meters) && meters >= 20 && meters <= 10000) { setRadius(meters); regenerate(shape, meters); }
        }} /></label><label className="mh-map-field">Einheit<select value={unit} onChange={event => setUnit(event.target.value as 'm' | 'km')}><option value="m">Meter</option><option value="km">Kilometer</option></select></label></div>}
        {shape !== 'circle' && shape !== 'custom' && <label className="mh-map-field">Rotation · {rotation}°<input type="range" min="0" max="359" value={rotation} onChange={event => { const degrees = Number(event.target.value); setRotation(degrees); regenerate(shape, radius, degrees); }} /></label>}
        {shape !== 'custom' && <button type="button" className="mh-map-button" aria-pressed={placingCenter} onClick={() => { setPlacingCenter(current => !current); setDrawingExclusion(false); setExclusionPoints([]); setSelectedExclusion(null); }}><MapPin size={16} />{placingCenter ? 'Mittelpunkt auf Karte wählen' : 'Mittelpunkt neu setzen'}</button>}
        {origin && <p className="mh-zone-coordinates">{origin[1].toFixed(5)}° N · {origin[0].toFixed(5)}° E</p>}
        {draft && <>
          <div className="mh-zone-divider" />
          <div className="mh-zone-subheading"><span>SPERRBEREICHE</span><span>{draft.excluded.length}/12</span></div>
          <p className="mh-map-muted">Straßen, Gewässer und Privatgrundstücke ausdrücklich ausschließen.</p>
          <button type="button" className="mh-map-button danger" disabled={draft.excluded.length >= 12 || drawingExclusion} onClick={() => { setDrawingExclusion(true); setExclusionPoints([]); setPlacingCenter(false); setSelectedExclusion(null); }}><Plus size={16} />Sperrbereich zeichnen</button>
          {draft.excluded.map((_, index) => <div className="mh-exclusion-row" key={index}>
            <button type="button" aria-pressed={selectedExclusion === index} onClick={() => setSelectedExclusion(current => current === index ? null : index)}>Bereich {index + 1} bearbeiten</button>
            <button type="button" aria-label={`Sperrbereich ${index + 1} entfernen`} onClick={() => { updateDraft({ ...draft, excluded: draft.excluded.filter((_, i) => i !== index) }); setSelectedExclusion(null); }}><Trash2 size={15} /></button>
          </div>)}
          <div className="mh-zone-divider" />
          <label className="mh-zone-confirm"><input type="checkbox" checked={safetyChecked} onChange={event => setSafetyChecked(event.target.checked)} /><span>Ich habe das Gebiet geprüft. Es ist sicher und erlaubt zugänglich; gefährliche Bereiche sind ausgeschlossen.</span></label>
          <button type="button" className="mh-map-button primary" onClick={save} disabled={!safetyChecked || saving}><Check size={17} />{saving ? 'Wird übernommen …' : 'Zone bestätigen & übernehmen'}</button>
        </>}
      </fieldset>
      {error && <div className="mh-zone-feedback error" role="alert"><ShieldAlert size={17} />{error}<button type="button" aria-label="Meldung schließen" onClick={() => setError('')}><X size={14} /></button></div>}
      {message && <div className="mh-zone-feedback success" role="status"><Check size={17} />{message}</div>}
      {!readOnly && <div className="mh-zone-presets">
        <div className="mh-zone-subheading"><span>AUF DIESEM GERÄT</span></div>
        <label className="mh-map-field">Gespeicherte Zone<select value={selectedPreset} onChange={event => {
          const item = saved.find(item => item.id === event.target.value);
          setSelectedPreset(event.target.value);
          if (!item) return;
          openZone(item.zone);
        }}><option value="">Neue Zone</option>{saved.map(item => <option key={item.id} value={item.id}>{item.zone.name || 'Unbenannte Zone'}</option>)}</select></label>
        <div className="mh-zone-action-row"><button type="button" onClick={saveLocal} disabled={!draft} className="mh-map-button"><Save size={16} />Lokal speichern</button><button type="button" onClick={exportZone} disabled={!draft} className="mh-map-button" title="GeoJSON herunterladen" aria-label="Zone als GeoJSON herunterladen"><Download size={16} /></button>{selectedPreset && <button type="button" className="mh-map-button" aria-label="Gespeicherte Zone löschen" onClick={() => { try { const next = saved.filter(item => item.id !== selectedPreset); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(next); setSelectedPreset(''); setMessage('Gespeicherte Zone entfernt.'); } catch { setError('Lokaler Speicher ist nicht verfügbar.'); } }}><Trash2 size={16} /></button>}</div>
        <input ref={importRef} type="file" className="mh-visually-hidden" aria-label="Zonendatei auswählen" accept=".geojson,.json,application/geo+json,application/json" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          try {
            if (file.size > MAX_ZONE_FILE_BYTES) throw new Error('Die Zonendatei darf höchstens 256 KB groß sein.');
            const next = parseZoneFile(await file.text());
            openZone(next); setSelectedPreset('');
            setMessage('Zone importiert. Prüfe das Gebiet und bestätige die Sicherheit erneut.');
          } catch (failure) { setError(failure instanceof Error ? failure.message : 'Die Datei konnte nicht geöffnet werden.'); }
        }}/>
        <button type="button" className="mh-map-button" onClick={() => importRef.current?.click()}><Upload size={16}/>GeoJSON importieren</button>
        <p className="mh-map-muted">Exportierte Zonen mit Sperrbereichen hier wieder öffnen. Die Datei bleibt auf deinem Gerät.</p>
        {draft && shape !== 'circle' && shape !== 'custom' && <button type="button" className="mh-map-text-button" onClick={() => { setSelectedExclusion(null); regenerate(); }}><RotateCcw size={13} />Eckpunkte auf Grundform zurücksetzen</button>}
        <p className="mh-map-muted">Kartendaten: OpenStreetMap. Beim Laden werden IP-Adresse und Kartenausschnitt an den Kartenanbieter übermittelt. Keine Offline-Kartendownloads.</p>
      </div>}
    </div>
  </div>;
}

function fitZone(map: maplibregl.Map, zone: Zone) {
  const bounds = bbox(zone.feature);
  map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 55, maxZoom: 17, duration: 0 });
}
