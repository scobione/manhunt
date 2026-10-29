import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TrafficCounter,networkType,resourceBytes} from '../src/traffic-meter';
import {emptyBuckets,totalBytes,sumBytes,formatBytes} from '../shared/traffic';
import {trafficSchema,type TrafficStore} from '../server/traffic';
import {AccountService} from '../server/accounts';
import {TestAccountStore} from './account-fixtures';

describe('traffic diagnostics, isolated measurements',()=>{
 it('TRAFFIC-01 never infers mobile data from 4g speed or Safari missing API',()=>{expect(networkType(undefined)).toBe('unknown');expect(networkType({type:'4g'})).toBe('unknown');expect(networkType({type:'wifi'})).toBe('wifi');expect(networkType({type:'cellular'})).toBe('cellular');expect(networkType({type:'ethernet'})).toBe('ethernet');});
 it('TRAFFIC-02 distinguishes transferred bytes, cached content and opaque timing',()=>{expect(resourceBytes({transferSize:1300,encodedBodySize:1000,decodedBodySize:3000})).toEqual({down:1300,estimated:0,cached:0,unmeasured:0});expect(resourceBytes({transferSize:0,encodedBodySize:1000,decodedBodySize:3000})).toMatchObject({down:0,cached:1,unmeasured:0});expect(resourceBytes({transferSize:0,encodedBodySize:0,decodedBodySize:0})).toMatchObject({down:0,cached:0,unmeasured:1});});
 it('TRAFFIC-03 counts each network separately, cumulative copies and estimates do not change earlier reports',()=>{const c=new TrafficCounter(randomUUID(),randomUUID());c.resource('wifi',{transferSize:1300,encodedBodySize:1000,decodedBodySize:3000});c.payload('cellular',2000,200);const first=c.snapshot();c.payload('unknown',100,10);const second=c.snapshot();expect(first.sequence).toBe(1);expect(second.sequence).toBe(2);expect(first.buckets.unknown.requests).toBe(0);expect(totalBytes(sumBytes(Object.values(second.buckets)))).toBe(3610);expect(formatBytes(1e6)).toBe('1 MB');});
 it('TRAFFIC-04 rejects negative/oversized bytes, extra identifiers, malformed match and unknown networks',()=>{const r={matchId:randomUUID(),clientId:randomUUID(),sequence:1,buckets:emptyBuckets()};expect(trafficSchema.safeParse(r).success).toBe(true);for(const patch of [{userId:randomUUID()},{matchId:'bad'},{sequence:0},{buckets:{...r.buckets,ssid:'not-collected'}},{buckets:{...r.buckets,wifi:{...r.buckets.wifi,down:-1}}},{buckets:{...r.buckets,wifi:{...r.buckets.wifi,up:2e9+1}}}])expect(trafficSchema.safeParse({...r,...patch}).success).toBe(false);});
 it('TRAFFIC-05 normal players cannot access admin reports, stale/disabled/setup users cannot send metrics',async()=>{
  const store=new TestAccountStore(),player={id:randomUUID(),sessionId:randomUUID(),expiresAt:Date.now()+60000},admin={id:randomUUID(),sessionId:randomUUID(),expiresAt:Date.now()+60000};await store.seed(player,'player@example.invalid');await store.seed(admin,'admin@example.invalid',undefined,true);const traffic:TrafficStore={read:vi.fn(async()=>({matches:[]})),report:vi.fn(async()=>({ok:true}))};const service=new AccountService(store,Date.now,traffic);
  const call=(who:typeof player,path:string,method='GET',body:unknown={},ticket:string|null=null,query=new URLSearchParams())=>service.handle(who,'isolated-token',path,method,body,query,ticket);
  await expect(call(player,'/admin/traffic')).rejects.toMatchObject({status:403});await expect(call(admin,'/admin/traffic')).rejects.toMatchObject({status:401});
  await expect(call(player,'/traffic')).rejects.toMatchObject({status:403});await expect(call(admin,'/traffic')).rejects.toMatchObject({status:403});expect(traffic.read).not.toHaveBeenCalled();
  const ticket=(await call(admin,'/admin/session','POST')) as {sessionToken:string};await call(admin,'/admin/traffic','GET',{},ticket.sessionToken);expect(traffic.read).toHaveBeenCalledWith(admin,true,null,0);
  const report={matchId:randomUUID(),clientId:randomUUID(),sequence:1,buckets:emptyBuckets()};await call(player,'/traffic','POST',report);expect(traffic.report).toHaveBeenCalledWith(player,report);
  store.controls.get(player.id)!.disabled=true;await expect(call(player,'/traffic','POST',report)).rejects.toMatchObject({status:403});store.controls.get(player.id)!.disabled=false;store.controls.get(player.id)!.setup_stage=0;await expect(call(player,'/traffic','POST',report)).rejects.toMatchObject({status:428});store.controls.get(player.id)!.setup_stage=3;store.live.delete(player.sessionId);await expect(call(player,'/traffic','POST',report)).rejects.toMatchObject({status:401});
 });
});
