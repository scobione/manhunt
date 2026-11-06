import {describe,it,expect} from 'vitest';
import {circle} from '@turf/turf';
import {DEFAULT_SETTINGS,type Settings} from '../shared/types';
import {DEFAULT_XP} from '../shared/rules';
import {matchRuleRows,ruleDuration,xpCollectionAdvice} from '../src/gameplay-guidance';
describe('B22 actual game guidance',()=>{
 it('summarizes combined synchronized custom rules without substituting preset defaults',()=>{
  const settings:Settings={...DEFAULT_SETTINGS,durationSeconds:2700,preparationSeconds:15,headStartSeconds:90,pinIntervalSeconds:150,captureMethod:'code',rules:{xpHunt:true,zombie:true,apocalypse:true},xp:{...DEFAULT_XP,target:7,radiusMeters:45,goal:'individual',timeout:'hunters'},phases:[{afterSeconds:0,scale:1},{afterSeconds:300,scale:.2}]};
  const rows=Object.fromEntries(matchRuleRows(settings,{name:'Selected safe area',confirmed:true,feature:circle([13,52],.5),excluded:[circle([13,52],.01),circle([13,52],.02)],disabledExcluded:[1]}).map(r=>[r.label,r.value]));
  expect(rows['Spielzeit']).toBe('45 Min.');expect(rows['Pin-Intervall']).toBe('2 Min. 30 Sek.');expect(rows.Fangen).toContain('Fangcode');expect(rows['Hunter-Vorsprung']).toBe('1 Min. 30 Sek.');expect(rows['Aktive Sperrzonen']).toBe('1');expect(rows.Apokalypse).toContain('20 %');expect(rows['XP-Ziel']).toContain('7 Punkte pro Hider · 45 m');expect(rows['XP bei Zeitablauf']).toBe('Hunter gewinnen');
 });
 it('does not describe inactive optional rules as active and formats zero without a fake delay',()=>{
  expect(matchRuleRows({...DEFAULT_SETTINGS,rules:{zombie:false,apocalypse:false,xpHunt:false}},null).some(r=>r.label==='XP-Ziel'||r.label==='Infektion'||r.label==='Apokalypse')).toBe(false);
  expect(ruleDuration(0)).toBe('Keine');expect(ruleDuration(3665)).toBe('1 Std. 1 Min. 5 Sek.');
 });
 const now=100000,base={active:true,connected:true,sharing:true,location:{longitude:13,latitude:52,accuracy:3,timestamp:now},now,maxAccuracyMeters:50,distanceMeters:10,radiusMeters:30};
 it('explains that the entire accuracy circle must fit, even when the player coordinate is already inside',()=>{
  expect(xpCollectionAdvice({...base,distanceMeters:28})).toContain('Genauigkeitskreis');expect(xpCollectionAdvice(base)).toBeNull();
 });
 it('gives distinct actionable reasons for stale and inaccurate GPS',()=>{
  expect(xpCollectionAdvice({...base,location:{...base.location,timestamp:now-11000}})).toContain('zu alt');
  expect(xpCollectionAdvice({...base,location:{...base.location,accuracy:80}})).toContain('freien Himmel');
 });
 it('does not suggest collection while paused, disconnected or without location consent',()=>{
  expect(xpCollectionAdvice({...base,active:false})).toContain('pausiert');expect(xpCollectionAdvice({...base,connected:false})).toContain('synchronisierten');expect(xpCollectionAdvice({...base,sharing:false})).toContain('Standortfreigabe');
 });
});
