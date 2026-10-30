/** Isolated browser API fixtures; no production traffic or identities. */
import {afterEach,expect,it,vi} from 'vitest';
import {trafficAllowed,setTrafficConsent} from '../src/traffic-consent';
import {beginTraffic,cancelTraffic,socketTraffic,startTraffic} from '../src/traffic-meter';
afterEach(()=>{cancelTraffic();vi.useRealTimers();vi.unstubAllGlobals();});
it('DIAG-01: before consent no network metadata, observer, measurement or identifier is read',()=>{
 const forbidden=vi.fn(()=>{throw Error('Must not read diagnostics before consent');});
 vi.stubGlobal('navigator',Object.defineProperty({},'connection',{get:forbidden}));vi.stubGlobal('PerformanceObserver',forbidden);vi.stubGlobal('crypto',{randomUUID:forbidden});
 expect(startTraffic('fixture-match','https://isolated.invalid',vi.fn(),()=>false)).toBeUndefined();beginTraffic('/api/sync')('sample');socketTraffic({test:1},'up');expect(forbidden).not.toHaveBeenCalled();
});
function fixture(){
 vi.useFakeTimers();const connection=Object.assign(new EventTarget(),{type:'wifi'}),win=Object.assign(new EventTarget(),{location:{href:'https://isolated.invalid/game',origin:'https://isolated.invalid'}}),doc=Object.assign(new EventTarget(),{hidden:false});const disconnect=vi.fn(),observe=vi.fn();
 vi.stubGlobal('navigator',{connection});vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
 vi.stubGlobal('PerformanceObserver',class {observe=observe;disconnect=disconnect;takeRecords(){return [];}});
 return {connection,win,doc,disconnect,observe};
}
it('DIAG-02: consent allows counts; withdrawal disconnects, discards counters and prevents late flushes',async()=>{
 const f=fixture(),send=vi.fn(async()=>{});let permitted=true;
 const meter=startTraffic('fixture-match','https://isolated.invalid',send,()=>permitted)!;expect(f.observe).toHaveBeenCalledWith({type:'resource',buffered:false});
 socketTraffic({test:'permitted'},'up');expect(meter.counter.buckets.wifi.up).toBeGreaterThan(0);
 permitted=false;cancelTraffic();expect(f.disconnect).toHaveBeenCalledOnce();f.win.dispatchEvent(new Event('pagehide'));f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(60000);await meter.flush();expect(send).not.toHaveBeenCalled();
});
it('DIAG-03: withdrawal aborts an in-flight diagnostic upload; late payload callbacks are discarded',async()=>{
 fixture();let permitted=true,signal:AbortSignal|undefined;let settle:()=>void=()=>{};const send=vi.fn((_report,requestSignal:AbortSignal)=>{signal=requestSignal;return new Promise<void>(r=>{settle=r;});});
 const meter=startTraffic('fixture-match','https://isolated.invalid',send,()=>permitted)!;const callback=beginTraffic('/api/sync');void meter.flush();expect(signal?.aborted).toBe(false);permitted=false;cancelTraffic();expect(signal?.aborted).toBe(true);callback('late response');settle();await Promise.resolve();await vi.advanceTimersByTimeAsync(60000);expect(send).toHaveBeenCalledOnce();expect(meter.counter.buckets.wifi.requests).toBe(0);
});

it('DIAG-04: consent defaults off, is account-specific and follows a later explicit choice in another tab',()=>{
 const values=new Map<string,string>();vi.stubGlobal('window',new EventTarget());vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
 expect(trafficAllowed('alice')).toBe(false);setTrafficConsent('alice',true);expect(trafficAllowed('alice')).toBe(true);expect(trafficAllowed('bob')).toBe(false);setTrafficConsent('alice',false);expect(trafficAllowed('alice')).toBe(false);
 values.set('manhunt:traffic-consent:v1:alice','allowed');expect(trafficAllowed('alice')).toBe(true);setTrafficConsent('alice',false);
});
