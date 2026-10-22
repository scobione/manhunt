import { describe, expect, it } from 'vitest';
import { circle, featureCollection } from '@turf/turf';
import { MAX_ZONE_FILE_BYTES, parseZoneFile, serializeZone, validZone } from '../src/zoneFiles';
import type { Zone } from '../shared/types';

// Synthetic geometry used only in isolated automated tests; no GPS simulation.
const zone = (): Zone => ({ name: 'Test-Revier', confirmed: true, feature: circle([13.4, 52.5], 0.5), excluded: [circle([13.4, 52.5], 0.05)] });
describe('portable zone files', () => {
  it('preserves boundaries and exclusions but requires a new safety confirmation', () => {
    const original = zone();
    const restored = parseZoneFile(serializeZone(original));
    expect(restored.name).toBe(original.name);
    expect(restored.feature.geometry).toEqual(original.feature.geometry);
    expect(restored.excluded.map(f => f.geometry)).toEqual(original.excluded.map(f => f.geometry));
    expect(restored.confirmed).toBe(false);
  });
  it('accepts a single valid Polygon feature and discards unrelated metadata', () => {
    const feature = { ...zone().feature, properties: { name: 'Revier', confirmed: true, player: 'private' } };
    const result = parseZoneFile(JSON.stringify(feature));
    expect(result.name).toBe('Revier');
    expect(result.feature.properties).toEqual({});
    expect(result.confirmed).toBe(false);
  });
  it.each([null, {}, { type: 'Feature', geometry: { type: 'Polygon' } }, { type: 'FeatureCollection', features: [null] }, { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }])('rejects malformed data without a type error (%j)', value => {
    expect(validZone(value)).toBe(false);
    expect(() => parseZoneFile(JSON.stringify(value))).toThrow(/Spielzone/);
  });
  it('rejects oversized or non-JSON inputs', () => {
    expect(() => parseZoneFile('a'.repeat(MAX_ZONE_FILE_BYTES + 1))).toThrow(/256 KB/);
    expect(() => parseZoneFile('<script>')).toThrow(/GeoJSON/);
  });
  it('rejects ambiguous boundaries and unknown kinds instead of discarding them', () => {
    const first = zone().feature;
    expect(() => parseZoneFile(JSON.stringify(featureCollection([first, first])))).toThrow(/genau eine/);
    expect(() => parseZoneFile(JSON.stringify({ ...first, properties: { kind: 'hazard' } }))).toThrow(/genau eine/);
  });
  it('rejects exclusion zones outside the safe boundary', () => {
    const data = JSON.parse(serializeZone(zone()));
    data.features[1].geometry = circle([14, 53], 0.05).geometry;
    expect(() => parseZoneFile(JSON.stringify(data))).toThrow(/vollständig/);
  });
});
