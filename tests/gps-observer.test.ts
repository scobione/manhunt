/** Browser sensor fixtures only: no real GPS, account or production request. */
import {afterEach,expect,it,vi} from 'vitest';
import {observeGps} from '../src/gps-observer';
import {gpsObservationInterval,gpsQuality,formatGpsAge} from '../src/gps-quality';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(){
 vi.useFakeTimers();vi.setSystemTime(1800000000000);
 const document=Object.assign(new EventTarget(),{hidden:false});
 const watches:PositionCallback[]=[],shots:PositionCallback[]=[];
 const watchPosition=vi.fn((success:PositionCallback)=>{watches.push(success);return watches.length;});
 const getCurrentPosition=vi.fn((success:PositionCallback)=>{shots.push(success);});
 const clearWatch=vi.fn();
 vi.stubGlobal('window',{setInterval});vi.stubGlobal('document',document);vi.stubGlobal('navigator',{geolocation:{watchPosition,getCurrentPosition,clearWatch}});
 let cadence=3000;
 const position=vi.fn(),error=vi.fn();
 const observer=observeGps({cadence:()=>cadence,position,error});
 const value=(timestamp=Date.now())=>({coords:{latitude:52.52,longitude:13.405,accuracy:5},timestamp}) as GeolocationPosition;
 return{document,watches,shots,watchPosition,getCurrentPosition,clearWatch,position,observer,value,setCadence:(n:number)=>{cadence=n;observer.reconfigure();}};
}
it('GPS-BATTERY-01: a fresh watch replaces redundant high-accuracy one-shots and keeps actual timestamps',async()=>{
 const f=fixture();
 for(let i=0;i<12;i++){f.watches[0](f.value());await vi.advanceTimersByTimeAsync(1000);}
 expect(f.watchPosition).toHaveBeenCalledOnce();expect(f.getCurrentPosition).not.toHaveBeenCalled();expect(f.position).toHaveBeenCalledTimes(12);
 expect(f.position.mock.calls[0][0].timestamp).toBe(1800000000000);f.observer.stop();
});
it('GPS-BATTERY-02: a stalled watch requests a fresh fallback, never overlapping pending one-shots',async()=>{
 const f=fixture();f.watches[0](f.value());await vi.advanceTimersByTimeAsync(3000);expect(f.getCurrentPosition).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(6000);expect(f.getCurrentPosition).toHaveBeenCalledOnce();f.shots[0](f.value());await vi.advanceTimersByTimeAsync(2000);expect(f.getCurrentPosition).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1000);expect(f.getCurrentPosition).toHaveBeenCalledTimes(2);f.observer.stop();
});
it('GPS-BATTERY-03: hidden app stops the watch, ignores late callbacks and resumes with a fresh fix',async()=>{
 const f=fixture();f.watches[0](f.value());f.observer.refresh(true);expect(f.getCurrentPosition).toHaveBeenCalledOnce();
 f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));expect(f.clearWatch).toHaveBeenCalledWith(1);
 const before=f.position.mock.calls.length;f.watches[0](f.value());f.shots[0](f.value());await vi.advanceTimersByTimeAsync(30000);expect(f.position).toHaveBeenCalledTimes(before);expect(f.getCurrentPosition).toHaveBeenCalledOnce();
 f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));expect(f.watchPosition).toHaveBeenCalledTimes(2);expect(f.getCurrentPosition).toHaveBeenCalledTimes(2);f.shots[1](f.value());expect(f.position).toHaveBeenCalledTimes(before+1);f.observer.stop();
});
it('GPS-BATTERY-04: pause and consent cleanup stop all sensor work; late fixes cannot restart it',async()=>{
 const f=fixture();f.setCadence(0);expect(f.clearWatch).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(30000);expect(f.getCurrentPosition).not.toHaveBeenCalled();
 f.setCadence(3000);expect(f.watchPosition).toHaveBeenCalledTimes(2);f.observer.refresh();f.observer.stop();f.watches[1](f.value());f.shots[0](f.value());await vi.advanceTimersByTimeAsync(30000);expect(f.position).not.toHaveBeenCalled();expect(f.watchPosition).toHaveBeenCalledTimes(2);
});
it('GPS-BATTERY-05: lobby fallback retains readiness freshness; active cadence is never relaxed',()=>{
 expect(gpsObservationInterval('waiting')).toBe(10000);expect(gpsObservationInterval('paused')).toBe(0);expect(gpsObservationInterval('active')).toBe(3000);expect(gpsObservationInterval('active',1)).toBe(1000);expect(gpsObservationInterval('active',30)).toBe(3000);
});
it('GPS-QUALITY-01: status and safe recommendations distinguish missing, inaccurate and stale samples',()=>{
 const now=1800000000000,sample={latitude:52.52,longitude:13.405,accuracy:5,timestamp:now};
 expect(gpsQuality(null,50,now).level).toBe('inactive');expect(gpsQuality(sample,50,now).level).toBe('good');
 expect(gpsQuality({...sample,accuracy:80},50,now)).toMatchObject({level:'weak',accuracyMeters:80});expect(gpsQuality({...sample,accuracy:80},50,now).detail).toContain('sicheren Weg');
 expect(gpsQuality({...sample,timestamp:now-16000},50,now)).toMatchObject({level:'stale',ageSeconds:16});expect(formatGpsAge(16)).toBe('Vor 16 s');expect(formatGpsAge(80)).toBe('Vor 1 Min.');expect(formatGpsAge(null)).toBe('Noch keine Position');
});
