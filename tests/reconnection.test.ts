import {afterEach,expect,it,vi} from 'vitest';
import {httpSession} from '../src/http-session';
import {reconnectState} from '../src/reconnect-state';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const value=(revision=1)=>({lobby:{revision},socialRevision:0,serverTime:1800000000000});
function fixture(request:ReturnType<typeof vi.fn>){
 const onState=vi.fn(),onConnection=vi.fn(),onResynced=vi.fn(),onExpired=vi.fn();
 const session=httpSession({request:request as Parameters<typeof httpSession>[0]['request'],onState,onConnection,onResynced,onExpired,onSocial:vi.fn()});
 return{session,onState,onConnection,onResynced,onExpired};
}
it('RECONNECT-HTTP-01: restoration waits for applied state and is announced once per actual interruption',async()=>{
 vi.useFakeTimers();let resolve:(v:unknown)=>void=()=>{};
 const request=vi.fn().mockResolvedValueOnce(value()).mockRejectedValueOnce(new TypeError('Isolated offline')).mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue(value(3));
 const f=fixture(request);await vi.advanceTimersByTimeAsync(0);expect(f.onConnection).toHaveBeenLastCalledWith(true);expect(f.onResynced).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(2000);expect(f.onConnection).toHaveBeenLastCalledWith(false);await vi.advanceTimersByTimeAsync(2000);expect(f.onResynced).not.toHaveBeenCalled();
 f.onResynced.mockImplementation(()=>expect(f.onState).toHaveBeenLastCalledWith(value(2).lobby));resolve(value(2));await vi.advanceTimersByTimeAsync(0);expect(f.onResynced).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(2000);expect(f.onResynced).toHaveBeenCalledOnce();f.session.close();
});
it('RECONNECT-HTTP-02: a rejected game command does not impersonate a lost connection',async()=>{
 vi.useFakeTimers();const request=vi.fn().mockResolvedValueOnce(value()).mockRejectedValueOnce(Object.assign(new Error('Outside XP radius'),{status:400})).mockResolvedValue(value(2));
 const f=fixture(request);await vi.advanceTimersByTimeAsync(0);await expect(f.session.send('lobby:command',{type:'xp_collect'})).rejects.toThrow('Outside XP radius');expect(f.onConnection).not.toHaveBeenCalledWith(false);await vi.advanceTimersByTimeAsync(2000);expect(f.onResynced).not.toHaveBeenCalled();f.session.close();
});
it('RECONNECT-HTTP-03: initial connection trouble and a closed pending request never emit a restoration',async()=>{
 vi.useFakeTimers();const request=vi.fn().mockRejectedValueOnce(new Error('Not ready')).mockResolvedValue(value());const f=fixture(request);
 await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(2000);expect(f.onResynced).not.toHaveBeenCalled();f.session.close();
 let resolve:(v:unknown)=>void=()=>{};const late=fixture(vi.fn(()=>new Promise(r=>{resolve=r;})));await vi.advanceTimersByTimeAsync(0);late.session.close();resolve(value());await vi.advanceTimersByTimeAsync(0);expect(late.onState).not.toHaveBeenCalled();expect(late.onConnection).not.toHaveBeenCalled();
});
it('RECONNECT-SOCKET-01: transport connect is not confirmation; only current sync acknowledgement restores access',()=>{
 const order:string[]=[],connection=vi.fn((ready:boolean)=>order.push(ready?'ready':'waiting')),restored=vi.fn(()=>order.push('restored')),state=reconnectState(connection,restored);
 const first=state.begin();expect(connection).toHaveBeenLastCalledWith(false);state.accept(first,()=>order.push('initial'));expect(restored).not.toHaveBeenCalled();
 state.disconnected();state.disconnected();const stale=state.begin();state.disconnected();const current=state.begin();
 expect(state.accept(stale,()=>order.push('STALE'))).toBe(false);expect(connection).toHaveBeenLastCalledWith(false);expect(restored).not.toHaveBeenCalled();
 state.accept(current,()=>order.push('fresh'));expect(order.slice(-3)).toEqual(['fresh','ready','restored']);expect(restored).toHaveBeenCalledOnce();state.accept(current,()=>{});expect(restored).toHaveBeenCalledOnce();
 state.disconnected();const again=state.begin();state.accept(again,()=>{});expect(restored).toHaveBeenCalledTimes(2);
});
it('RECONNECT-HTTP-04: an offline/online gap between polls waits for a fresh authoritative response',async()=>{
 vi.useFakeTimers();const window=new EventTarget();vi.stubGlobal('window',window);vi.stubGlobal('navigator',{onLine:true});let resolve:(v:unknown)=>void=()=>{};
 const request=vi.fn().mockResolvedValueOnce(value()).mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue(value(3));
 const f=fixture(request);await vi.advanceTimersByTimeAsync(0);expect(f.onState).toHaveBeenLastCalledWith(value().lobby);
 window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(0);
 expect(request).toHaveBeenCalledTimes(2);expect(f.onConnection).toHaveBeenLastCalledWith(false);expect(f.onResynced).not.toHaveBeenCalled();
 resolve(value(2));await vi.advanceTimersByTimeAsync(0);expect(f.onState).toHaveBeenLastCalledWith(value(2).lobby);expect(f.onResynced).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(2000);expect(request).toHaveBeenCalledTimes(3);expect(f.onResynced).toHaveBeenCalledOnce();f.session.close();
});
it('RECONNECT-HTTP-05: an in-flight pre-outage response cannot reopen state; its mutation is never retried',async()=>{
 vi.useFakeTimers();const window=new EventTarget();vi.stubGlobal('window',window);vi.stubGlobal('navigator',{onLine:true});let resolveMutation:(v:unknown)=>void=()=>{},resolveSync:(v:unknown)=>void=()=>{};
 const request=vi.fn().mockResolvedValueOnce(value()).mockImplementationOnce(()=>new Promise(r=>{resolveMutation=r;})).mockImplementationOnce(()=>new Promise(r=>{resolveSync=r;}));
 const f=fixture(request);await vi.advanceTimersByTimeAsync(0);const sent=f.session.send('lobby:command',{command:{type:'xp_collect'}});await vi.advanceTimersByTimeAsync(0);
 window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(0);expect(request).toHaveBeenCalledTimes(2);
 resolveMutation(value(2));await expect(sent).resolves.toEqual(value(2).lobby);await vi.advanceTimersByTimeAsync(0);
 expect(f.onState).toHaveBeenCalledOnce();expect(f.onConnection).toHaveBeenLastCalledWith(false);expect(f.onResynced).not.toHaveBeenCalled();
 expect(request.mock.calls.filter(([path])=>path==='/events')).toHaveLength(1);expect(request.mock.calls.at(-1)?.[0]).toBe('/sync');
 resolveSync(value(3));await vi.advanceTimersByTimeAsync(0);expect(f.onState).toHaveBeenLastCalledWith(value(3).lobby);expect(f.onResynced).toHaveBeenCalledOnce();f.session.close();
});
it('RECONNECT-HTTP-06: a closed session removes browser listeners and cannot reopen after expiry or delayed sync',async()=>{
 vi.useFakeTimers();const window=new EventTarget();vi.stubGlobal('window',window);vi.stubGlobal('navigator',{onLine:true});let resolve:(v:unknown)=>void=()=>{};
 const request=vi.fn().mockResolvedValueOnce(value()).mockRejectedValueOnce(Object.assign(new Error('Expired'),{status:401})).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const f=fixture(request);await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(2000);expect(f.onExpired).toHaveBeenCalledOnce();
 window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(0);f.session.close();const states=f.onState.mock.calls.length,connections=f.onConnection.mock.calls.length;
 resolve(value(2));window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(10000);
 expect(f.onState).toHaveBeenCalledTimes(states);expect(f.onConnection).toHaveBeenCalledTimes(connections);expect(f.onResynced).not.toHaveBeenCalled();expect(request).toHaveBeenCalledTimes(3);
});
