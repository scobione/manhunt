import { area, booleanWithin, featureCollection, kinks } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { Zone } from '../shared/types';

export const MAX_ZONE_FILE_BYTES = 256 * 1024;

export function validPolygon(value: unknown): value is Feature<Polygon> {
  if (!value || typeof value !== 'object') return false;
  const feature = value as Feature<Polygon>;
  const coordinates = feature.geometry?.coordinates;
  if (feature.type !== 'Feature' || feature.geometry?.type !== 'Polygon' || !Array.isArray(coordinates) || coordinates.length !== 1) return false;
  const ring = coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 130) return false;
  if (ring.some(point => !Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85)) return false;
  if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) return false;
  try { const size = area(feature); return kinks(feature).features.length === 0 && size >= 100 && size <= 50_000_000; } catch { return false; }
}

export function validZone(value: unknown): value is Zone {
  if (!value || typeof value !== 'object') return false;
  const zone = value as Zone;
  try {
    return typeof zone.name === 'string' && zone.name.trim().length > 0 && zone.name.length <= 60
      && validPolygon(zone.feature) && Array.isArray(zone.excluded) && zone.excluded.length <= 12
      && zone.excluded.every(exclusion => validPolygon(exclusion) && booleanWithin(exclusion, zone.feature));
  } catch { return false; }
}

export function serializeZone(zone: Zone): string {
  if (!validZone(zone)) throw new Error('Bitte korrigiere zuerst die Zonengrenze.');
  return JSON.stringify(featureCollection([
    { ...zone.feature, properties: { name: zone.name, kind: 'safe-zone' } },
    ...zone.excluded.map(feature => ({ ...feature, properties: { name: '', kind: 'excluded' } })),
  ]), null, 2);
}

export function parseZoneFile(content: string): Zone {
  if (new TextEncoder().encode(content).byteLength > MAX_ZONE_FILE_BYTES) throw new Error('Die Zonendatei darf höchstens 256 KB groß sein.');
  let data: any;
  try { data = JSON.parse(content); } catch { throw new Error('Die Datei enthält kein gültiges GeoJSON.'); }
  const features: unknown[] | null = data?.type === 'Feature' ? [data]
    : data?.type === 'FeatureCollection' && Array.isArray(data.features) ? data.features : null;
  if (!features || features.length === 0 || features.length > 13 || !features.every(validPolygon)) throw new Error('Erwartet wird eine Spielzone mit höchstens zwölf Sperrbereichen, ohne gekreuzte Linien oder Löcher.');
  const safe = features.filter(feature => feature.properties?.kind !== 'excluded');
  const excluded = features.filter(feature => feature.properties?.kind === 'excluded');
  if (safe.length !== 1 || features.some(feature => feature.properties?.kind && !['safe-zone', 'excluded'].includes(feature.properties.kind))) throw new Error('Die Datei muss genau eine Spielzone enthalten. Sperrbereiche benötigen kind: excluded.');
  const clean = (feature: Feature<Polygon>): Feature<Polygon> => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: feature.geometry.coordinates } });
  const zone: Zone = { name: typeof safe[0].properties?.name === 'string' ? safe[0].properties.name.trim() : 'Importiertes Revier', feature: clean(safe[0]), excluded: excluded.map(clean), confirmed: false };
  if (!validZone(zone)) throw new Error('Ungültige Zone: Der Name darf 1–60 Zeichen enthalten. Alle Sperrbereiche müssen vollständig in der Spielzone liegen.');
  return zone;
}
