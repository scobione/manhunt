import {describe,expect,it} from 'vitest';
import {MAP_PREFERENCES_KEY,readMapPreferences,saveMapPreferences} from '../src/map-preferences';
function storage(value:string|null=null){return{value,getItem:()=>value,setItem:(key:string,next:string)=>{expect(key).toBe(MAP_PREFERENCES_KEY);value=next;}};}
describe('map display preferences',()=>{
 it('MAP-DISPLAY-01: missing or corrupt preferences keep the existing dark map and visible accuracy circle',()=>{
  for(const value of [null,'broken','null','42','{"sunlight":"true","accuracyCircle":0}'])expect(readMapPreferences(storage(value))).toEqual({sunlight:false,accuracyCircle:true});
 });
 it('MAP-DISPLAY-02: saves only display choices and restores both values',()=>{
  const memory=storage();saveMapPreferences({sunlight:true,accuracyCircle:false,latitude:52.52} as any,memory);
  expect(readMapPreferences(memory)).toEqual({sunlight:true,accuracyCircle:false});
  expect(JSON.parse(memory.getItem()!)).toEqual({sunlight:true,accuracyCircle:false});
 });
 it('MAP-DISPLAY-03: unavailable storage does not break map controls',()=>{
  const denied={getItem:()=>{throw Error('Storage denied');},setItem:()=>{throw Error('Storage denied');}};
  expect(readMapPreferences(denied)).toEqual({sunlight:false,accuracyCircle:true});
  expect(()=>saveMapPreferences({sunlight:true,accuracyCircle:false},denied)).not.toThrow();
 });
});
