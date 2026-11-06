import {useEffect,useRef,useSyncExternalStore} from 'react';
import type {GameEvent,LobbyView} from '../shared/types';

export interface SignalPreferences{sound:boolean;vibration:boolean}
export type GameSignal='pin'|'capture'|'infection'|'phase'|'finish'|'warning'|'xp';
const key='manhunt:game-signals:v1',changed='manhunt:game-signals-changed';
const silent:SignalPreferences={sound:false,vibration:false};
let cachedRaw:string|null|undefined,cachedPreferences=silent,temporaryPreferences:SignalPreferences|undefined;
export function signalPreferences():SignalPreferences{
 if(temporaryPreferences)return temporaryPreferences;
 let raw:string|null=null;try{raw=localStorage.getItem(key);}catch{/* Preference remains local and optional. */}
 if(raw===cachedRaw)return cachedPreferences;
 cachedRaw=raw;try{const value=JSON.parse(raw??'null');cachedPreferences={sound:value?.sound===true,vibration:value?.vibration===true};}catch{cachedPreferences=silent;}
 return cachedPreferences;
}
function savePreferences(value:SignalPreferences){
 const raw=JSON.stringify(value);try{localStorage.setItem(key,raw);temporaryPreferences=undefined;}catch{temporaryPreferences=value;}
 cachedRaw=raw;cachedPreferences=value;window.dispatchEvent(new Event(changed));
}
function subscribe(listener:()=>void){window.addEventListener(changed,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(changed,listener);window.removeEventListener('storage',listener);};}
function eventSignal(event:GameEvent,lobby:LobbyView):GameSignal|undefined{
 switch(event.type){
  case 'capture':return 'capture';
  case 'infection':return event.targetId===lobby.self.id?'infection':'capture';
  case 'elimination':case 'zone_elimination':return event.targetId===lobby.self.id?'warning':undefined;
  case 'zone_warning':return event.actorId===lobby.self.id?'warning':undefined;
  case 'pin_published':return ['hunter','zombie'].includes(lobby.self.role)?'pin':undefined;
  case 'zone_shrunk':case 'match_active':case 'match_resumed':return 'phase';
  case 'match_finished':return 'finish';
  case 'xp_point':case 'xp_collected':return 'xp';
 }
}
const priority:Record<GameSignal,number>={warning:7,infection:6,finish:5,capture:4,phase:3,pin:2,xp:1};
/** New events only. Mount/reload, a historic response and simulation never replay
 * old signals; multiple events in one update produce one short highest-priority cue. */
export function gameSignalTracker(){
 let match='',seen=new Set<string>(),due=new Set<number>();
 return{update(lobby:LobbyView|null,enabled:boolean,now=Date.now()):GameSignal[]{
  if(!lobby){match='';seen.clear();due.clear();return[];}
  const initial=match!==lobby.id;
  if(initial){match=lobby.id;seen=new Set();due=new Set();}
  const candidates:GameSignal[]=[];
  for(const event of lobby.events){if(seen.has(event.id))continue;seen.add(event.id);if(initial||event.at<now-10000||event.at>now+5000)continue;const signal=eventSignal(event,lobby);if(signal)candidates.push(signal);}
  const deadline=lobby.self.nextPinAt;
  if(lobby.status==='active'&&!lobby.self.eliminated&&lobby.self.locationSharing!==false&&(lobby.self.role==='hider'||lobby.self.role==='zombie'&&lobby.settings.zombieGps)&&deadline!==undefined&&Number.isFinite(deadline)&&deadline<=now&&!due.has(deadline)){
   due.add(deadline);if(!initial)candidates.push('pin');
  }
  if(seen.size>500){const keep=lobby.events.map(event=>event.id);seen=new Set(keep);}
  if(due.size>200)due=new Set([...due].slice(-100));
  if(!enabled||!lobby.settings.notifications||initial||!candidates.length)return[];
  return[candidates.sort((a,b)=>priority[b]-priority[a])[0]];
 }};
}
function audioConstructor(){return typeof window==='undefined'?undefined:window.AudioContext??(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;}
export function gameSignalSupport(){return{soundSupported:!!audioConstructor(),vibrationSupported:typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'};}
export function gameSignalPlayer(){
 let audio:AudioContext|null=null;const playing=new Set<OscillatorNode>();
 const stopSound=()=>{for(const oscillator of playing){try{oscillator.stop();}catch{/* Already ended. */}oscillator.disconnect();}playing.clear();};
 return{
  async unlock(){const Constructor=audioConstructor();if(!Constructor)return false;try{audio??=new Constructor();if(audio.state==='suspended')await audio.resume();return audio.state==='running';}catch{return false;}},
  play(signal:GameSignal,preferences:SignalPreferences){
   if(document.hidden)return;
   if(preferences.vibration&&typeof navigator.vibrate==='function')try{navigator.vibrate(signal==='warning'||signal==='infection'?[40,40,40]:25);}catch{/* Optional hardware feedback can be denied. */}
   if(!preferences.sound||audio?.state!=='running')return;
   try{
    const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime;
    oscillator.type='sine';oscillator.frequency.setValueAtTime(({pin:880,capture:500,infection:260,phase:660,finish:1046,warning:330,xp:988})[signal],at);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.045,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+.14);
    oscillator.connect(gain);gain.connect(audio.destination);playing.add(oscillator);
    oscillator.onended=()=>{playing.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+.15);
   }catch{/* Sound support must never interrupt an actual game action. */}
  },
  stopSound,
  dispose(){stopSound();if(audio)void audio.close().catch(()=>{});audio=null;},
 };
}
/** The enabling setters belong to explicit player gestures. Stored sound choices
 * are unlocked on the next real click/key gesture, as mobile browsers require. */
export function useGameSignals(lobby:LobbyView|null,enabled=true){
 const preferences=useSyncExternalStore(subscribe,signalPreferences,()=>silent);
 const player=useRef<ReturnType<typeof gameSignalPlayer>|null>(null),tracker=useRef<ReturnType<typeof gameSignalTracker>|null>(null);
 const clock=useRef({id:'',serverTime:0,receivedAt:0});
 player.current??=gameSignalPlayer();tracker.current??=gameSignalTracker();
 const support=gameSignalSupport();
 if(lobby&&(clock.current.id!==lobby.id||clock.current.serverTime!==lobby.serverTime))clock.current={id:lobby.id,serverTime:lobby.serverTime,receivedAt:Date.now()};
 const now=lobby?clock.current.serverTime+Math.max(0,Date.now()-clock.current.receivedAt):Date.now();
 useEffect(()=>{for(const signal of tracker.current!.update(lobby,enabled&&!document.hidden,now))player.current!.play(signal,preferences);},[lobby,enabled,now,preferences]);
 useEffect(()=>{
  if(!preferences.sound||!enabled)return;
  const unlock=(event:Event)=>{if(event.isTrusted)void player.current?.unlock();};
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);};
 },[preferences.sound,enabled]);
 useEffect(()=>()=>player.current?.dispose(),[]);
 return{...preferences,...support,
  async setSound(value:boolean){
   if(value&&(!enabled||!support.soundSupported||!await player.current!.unlock()))return;
   if(!value)player.current!.stopSound();savePreferences({...signalPreferences(),sound:value});
  },
  setVibration(value:boolean){if(value&&(!enabled||!support.vibrationSupported))return;savePreferences({...signalPreferences(),vibration:value});if(!value&&support.vibrationSupported)try{navigator.vibrate(0);}catch{/* Optional hardware feedback. */}},
 };
}
