import {expect,it} from 'vitest';
import {groupMapPins} from '../src/map-clusters';
import type {Pin} from '../shared/types';
const pin=(id:string,longitude=13.4,latitude=52.5):Pin=>({id,playerId:id,username:`Test_${id}`,role:'hider',longitude,latitude,accuracy:5,createdAt:1,expiresAt:999999});
const project=(p:Pin)=>({x:p.longitude*1000,y:p.latitude*1000});
it('MAP-GROUP-01: fewer than three pins remain at their exact geographic coordinates',()=>{const pins=[pin('a'),pin('b',13.41)];const before=structuredClone(pins),v=groupMapPins(pins,project);expect(v.singles).toEqual(pins);expect(v.groups).toEqual([]);expect(pins).toEqual(before);});
it('MAP-GROUP-02: nearby authorized pins are grouped with stable IDs and distant pins stay individual',()=>{const pins=[pin('b',13.41),pin('a'),pin('c',13.42),pin('far',14.4)];const v=groupMapPins(pins,project);expect(v.groups).toHaveLength(1);expect(v.groups[0].pins.map(p=>p.id)).toEqual(['a','b','c']);expect(v.groups[0].longitude).toBeCloseTo(13.41);expect(v.singles.map(p=>p.id)).toEqual(['far']);expect(groupMapPins([...pins].reverse(),project).groups[0].id).toBe(v.groups[0].id);});
it('MAP-GROUP-03: zooming apart or revoking a pin dissolves the group without retaining its data',()=>{const pins=[pin('a'),pin('b',13.41),pin('c',13.42)];expect(groupMapPins(pins,project).groups).toHaveLength(1);expect(groupMapPins(pins,p=>({x:p.longitude*100000,y:p.latitude*100000})).groups).toEqual([]);const next=groupMapPins(pins.slice(0,2),project);expect(next.groups).toEqual([]);expect(JSON.stringify(next)).not.toContain('Test_c');});

it('MAP-GROUP-04: a cluster at the date line stays at its geographic longitude',()=>{const pins=[pin('a',179.99),pin('b',179.999),pin('c',-179.999)];const v=groupMapPins(pins,p=>({x:(p.longitude<0?p.longitude+360:p.longitude)*1000,y:p.latitude*1000}));expect(v.groups).toHaveLength(1);expect(Math.abs(v.groups[0].longitude)).toBeGreaterThan(179.9);});
