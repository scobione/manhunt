import { createClient } from '@supabase/supabase-js';
import { authenticate } from './auth';
import { SupabaseRepository } from './repository';
import { SupabaseEdgeStore } from './edge-store';
import {SupabasePushService} from './push';
import { createEdgeHandler } from './edge-runtime';

// Supabase injects these secrets into its own Edge runtime. They are never
// exported, copied to the frontend or required in a local checked-in file.
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
const url=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!url||!key)throw new Error('Supabase runtime configuration is missing');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createEdgeHandler({
  repository:new SupabaseRepository(db),store:new SupabaseEdgeStore(db),
  verify:token=>authenticate(token,db),
  push:new SupabasePushService(db,'https://manhunt-fieldgame.scobione.chatgpt.site',`${url}/functions/v1/manhunt-api/api/push/dispatch`),
  origins:['https://manhunt-fieldgame.scobione.chatgpt.site'],
}));
