/** Explicit optional local cues; never real browser or production data. */
import {afterEach,expect,it,vi} from 'vitest';
import {DEFAULT_SETTINGS,type GameEvent,type LobbyView} from '../shared/types';
import {gameSignalPlayer,gameSignalSupport,gameSignalTracker,signalPreferences} from '../src/game-signals';
afterEach(()=>vi.unstubAllGlobals());
const now=1800000000000;
function lobby(events:GameEvent[]=[],nextPinAt=now+10000):LobbyView{return{id:'isolated-match',status:'active',serverTime:now,self:{id:'self',role:'hider',eliminated:false,locationSharing:true,nextPinAt},settings:{...DEFAULT_SETTINGS,notifications:true},events} as LobbyView;}
const event=(id:string,type:string,at=now,actorId='self',targetId='self'):GameEvent=>({id,type,at,actorId,targetId,message:'Isolated event'});
it('SIGNALS-01: both cues default off and unsupported hardware is detected',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>null});vi.stubGlobal('window',{});vi.stubGlobal('navigator',{});
 expect(signalPreferences()).toEqual({sound:false,vibration:false});expect(gameSignalSupport()).toEqual({soundSupported:false,vibrationSupported:false});
});
it('SIGNALS-02: mount, old sync and reload never replay historical capture/phase events',()=>{
 const tracker=gameSignalTracker();expect(tracker.update(lobby([event('old','capture')]),true,now)).toEqual([]);
 expect(tracker.update(lobby([event('old','capture'),event('history','zone_shrunk',now-15000)]),true,now)).toEqual([]);
 expect(gameSignalTracker().update(lobby([event('old','capture'),event('fresh','capture')]),true,now)).toEqual([]);
});
it('SIGNALS-03: new capture and infection cause one priority cue and repeated state causes none',()=>{
 const tracker=gameSignalTracker();tracker.update(lobby(),true,now);
 const next=lobby([event('capture','capture'),event('infection','infection')]);expect(tracker.update(next,true,now)).toEqual(['infection']);expect(tracker.update(next,true,now)).toEqual([]);
 expect(tracker.update(lobby([...next.events,event('other','zone_warning',now,'other','other')]),true,now)).toEqual([]);
});
it('SIGNALS-04: a due pin is signalled once, while waiting/paused and historic due state remain quiet',()=>{
 const tracker=gameSignalTracker();tracker.update(lobby(),true,now);expect(tracker.update(lobby(),true,now+10000)).toEqual(['pin']);expect(tracker.update(lobby(),true,now+20000)).toEqual([]);
 expect(tracker.update({...lobby([],now+30000),status:'paused'},true,now+30000)).toEqual([]);expect(tracker.update(lobby([],now+40000),true,now+40000)).toEqual(['pin']);
 expect(gameSignalTracker().update(lobby([],now-10000),true,now)).toEqual([]);
});
it('SIGNALS-05: simulation/disabled cues advance the baseline, never earning a delayed cue when enabled',()=>{
 const tracker=gameSignalTracker();tracker.update(lobby(),false,now);const next=lobby([event('simulated','capture')]);expect(tracker.update(next,false,now)).toEqual([]);expect(tracker.update(next,true,now)).toEqual([]);
 const disabled={...lobby([event('host-muted','capture')]),settings:{...DEFAULT_SETTINGS,notifications:false}};expect(tracker.update(disabled,true,now)).toEqual([]);
});
it('SIGNALS-06: haptics and audio only use explicitly enabled preferences; hidden documents remain quiet',async()=>{
 const vibrate=vi.fn(),start=vi.fn(),stop=vi.fn(),close=vi.fn(async()=>{}),resume=vi.fn(async()=>{});
 let state='running';
 class AudioFixture{
  get state(){return state;}currentTime=1;destination={};resume=resume;close=close;
  createGain(){return{gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};}
  createOscillator(){return{type:'sine',frequency:{setValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),start,stop,onended:null};}
 }
 const document={hidden:false};vi.stubGlobal('document',document);vi.stubGlobal('navigator',{vibrate});vi.stubGlobal('window',{AudioContext:AudioFixture});
 const player=gameSignalPlayer();player.play('pin',{sound:false,vibration:false});expect(vibrate).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
 expect(await player.unlock()).toBe(true);player.play('warning',{sound:true,vibration:true});expect(vibrate).toHaveBeenCalledOnce();expect(start).toHaveBeenCalledOnce();
 document.hidden=true;player.play('capture',{sound:true,vibration:true});expect(vibrate).toHaveBeenCalledOnce();expect(start).toHaveBeenCalledOnce();
 document.hidden=false;state='suspended';player.play('capture',{sound:true,vibration:false});expect(start).toHaveBeenCalledOnce();player.dispose();expect(close).toHaveBeenCalledOnce();
});
