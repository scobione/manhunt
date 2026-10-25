import {afterEach,describe,it,expect,vi} from 'vitest';
import webpush from 'web-push';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabasePushService,validPushEndpoint} from '../server/push';
const endpoint='https://fcm.googleapis.com/fcm/send/isolated-push-fixture';
function fixture(delivered:string[]=[]) {
 const key=webpush.generateVAPIDKeys();const updates:any[]=[];
 const job={id:'fixture-job',user_id:'fixture-user',kind:'pin_due',payload:{title:'MANHUNT',body:'Pin fällig',url:'/game'},attempts:1,lease:'fixture-lease',delivered_endpoints:delivered,expires_at:new Date(Date.now()+60000).toISOString()};
 const db={rpc:async()=>({data:[job],error:null}),from:(table:string)=>{
  if(table==='push_config')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{public_key:key.publicKey,private_key:key.privateKey,dispatch_secret:'s'.repeat(43)},error:null})})})};
  if(table==='push_subscriptions')return {select:()=>({eq:async()=>({data:[{endpoint,keys:{auth:'a'.repeat(22),p256dh:'b'.repeat(87)}}],error:null})})};
  if(table==='push_jobs')return {update:(patch:unknown)=>({eq:()=>({eq:async()=>{updates.push(patch);return {error:null};}})})};
  throw Error('unexpected table');
 }} as unknown as SupabaseClient;
 return{service:new SupabasePushService(db,'https://manhunt.example','https://db.example/functions/v1/manhunt-api/api/push/dispatch'),updates,key};
}
afterEach(()=>vi.restoreAllMocks());
describe('web-push dispatch (isolated transport; no device messages sent)',()=>{
 it('uses the bound library transport with VAPID and records successful delivery',async()=>{const send=vi.spyOn(webpush,'sendNotification').mockResolvedValue({statusCode:201,headers:{},body:''});const {service,updates,key}=fixture();expect(await service.dispatch()).toEqual({sent:1,retried:0});expect(send.mock.contexts[0]).toBe(webpush);expect(send.mock.calls[0][2]?.vapidDetails?.publicKey).toBe(key.publicKey);expect(send.mock.calls[0][2]?.urgency).toBe('high');expect(updates[0].status).toBe('sent');expect(updates[0].delivered_endpoints).toEqual([endpoint]);expect(await service.publicKey()).toBe(key.publicKey);expect(await service.authorized('wrong')).toBe(false);});
 it('retries transient failures and skips endpoints already delivered',async()=>{const send=vi.spyOn(webpush,'sendNotification').mockRejectedValue({statusCode:503});const {service,updates}=fixture();expect(await service.dispatch()).toEqual({sent:0,retried:1});expect(updates[0].status).toBe('pending');send.mockClear();await fixture([endpoint]).service.dispatch();expect(send).not.toHaveBeenCalled();});
 it('allows only supported HTTPS push hosts without credentials or custom ports',()=>{for(const bad of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://user@web.push.apple.com/a','https://127.0.0.1/a','https://web.push.apple.com:444/a'])expect(validPushEndpoint(bad)).toBe(false);expect(validPushEndpoint(endpoint)).toBe(true);expect(validPushEndpoint('https://web.push.apple.com/isolated')).toBe(true);});
});
