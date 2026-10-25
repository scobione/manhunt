-- Push contains generic game notices only: no GPS, role secrets, names or QR tokens.
create table public.push_config (
 id smallint primary key check(id=1), public_key text not null,
 private_key text not null, dispatch_secret text not null,
 dispatch_url text not null check(dispatch_url like 'https://%/functions/v1/manhunt-api/api/push/dispatch')
);
create table public.push_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 lobby_id uuid references public.lobbies(id) on delete cascade,
 event_key text not null, kind text not null, payload jsonb not null,
 due_at timestamptz not null default now(), expires_at timestamptz not null,
 expected_pin_at bigint, status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
 available_at timestamptz not null default now(), attempts int not null default 0,
 lease uuid, locked_until timestamptz, delivered_endpoints text[] not null default '{}',
 unique(user_id,event_key)
);
create index push_jobs_due on public.push_jobs(due_at,available_at) where status in ('pending','sending');
create index push_jobs_lobby on public.push_jobs(lobby_id);
create index push_jobs_expiry on public.push_jobs(expires_at);
alter table public.push_config enable row level security;
alter table public.push_jobs enable row level security;
revoke all on public.push_config,public.push_jobs from public,anon,authenticated;
grant all on public.push_config,public.push_jobs to service_role;

create function public.queue_game_push() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb=new.state; previous jsonb=case when tg_op='UPDATE' then old.state else '{}'::jsonb end;
 p jsonb; e jsonb; pin jsonb; due bigint; title text; message text; recipients jsonb; enabled boolean=coalesce((s#>>'{settings,notifications}')::boolean,true);
begin
 -- Remove unsent reminders after pause, departure, capture, opt-out or deadline change.
 update public.push_jobs j set status='cancelled',lease=null,locked_until=null
 where j.lobby_id=new.id and j.kind='pin_due' and j.status in ('pending','sending') and not exists(
  select 1 from jsonb_array_elements(s->'players') x where x->>'id'=j.user_id::text
   and s->>'status' in ('active','preparing') and enabled
   and not coalesce((x->>'eliminated')::boolean,false) and (x->>'locationSharing')::boolean=true
   and (x->>'nextPinAt')::bigint=j.expected_pin_at
   and (x->>'role'='hider' or x->>'role'='zombie' and coalesce((s#>>'{settings,zombieGps}')::boolean,false))
 );
 for p in select value from jsonb_array_elements(s->'players') loop
  if coalesce(s#>'{_engine,leftIds}','[]'::jsonb) ? (p->>'id') then continue; end if;
  if enabled and s->>'status' in ('active','preparing') and not coalesce((p->>'eliminated')::boolean,false)
    and (p->>'locationSharing')::boolean=true and p->>'nextPinAt' is not null
    and (p->>'role'='hider' or p->>'role'='zombie' and coalesce((s#>>'{settings,zombieGps}')::boolean,false)) then
   due=(p->>'nextPinAt')::bigint;
   insert into public.push_jobs(user_id,lobby_id,event_key,kind,payload,due_at,expires_at,expected_pin_at)
   values((p->>'id')::uuid,new.id,'pin_due:'||new.id::text||':'||due::text,'pin_due',
    jsonb_build_object('title','MANHUNT · GPS-Pin fällig','body','Dein nächster Pin steht an. Öffne MANHUNT für eine aktuelle Ortung.','url','/game','tag','pin-due-'||new.id::text),
    to_timestamp(due/1000.0)-interval '10 seconds',to_timestamp(due/1000.0)+interval '90 seconds',due)
   on conflict(user_id,event_key) do nothing;
  end if;
  for e in select value from jsonb_array_elements(coalesce(s->'events','[]'::jsonb)) loop
   if exists(select 1 from jsonb_array_elements(coalesce(previous->'events','[]'::jsonb)) x where x->>'id'=e->>'id') then continue; end if;
   if (e->>'at')::numeric < extract(epoch from now()-interval '2 minutes')*1000 then continue; end if;
   title=null;message=null;
   case e->>'type'
    when 'emergency_pause' then title='NOTFALL-PAUSE';message='Das Match ist pausiert. Öffne MANHUNT und prüfe die Sicherheit deiner Crew.';
    when 'disconnect_pause' then title='Match pausiert';message='Eine Verbindung ist unterbrochen. Öffne MANHUNT zum Wiederverbinden.';
    when 'unsafe_zone' then title='Match pausiert';message='Die Zone muss geprüft werden. Öffne MANHUNT.';
    when 'zone_warning' then if e->>'actorId'=p->>'id' then title='AUSSERHALB DER SPIELZONE';message='Kehre auf einem sicheren Weg zurück. Öffne MANHUNT für den Countdown.';end if;
    when 'match_started' then title='Dein Match startet';message='Deine Rolle ist bereit. Öffne MANHUNT und aktiviere GPS.';
    when 'match_resumed' then title='Match fortgesetzt';message='Das Spiel geht weiter. Öffne MANHUNT für aktuelle Ortung.';
    when 'capture' then title='Fang registriert';message='Ein Fang wurde bestätigt. Öffne das Live-Protokoll.';
    when 'infection' then if e->>'targetId'=p->>'id' then title='Du wurdest infiziert';message='Öffne MANHUNT und bestätige deine neue Rolle.';end if;
    when 'elimination' then if e->>'targetId'=p->>'id' then title='Du bist ausgeschieden';message='Öffne MANHUNT für den Spielstatus.';end if;
    when 'match_finished' then title='Match beendet';message='Die Ergebnisse sind da. Öffne MANHUNT.';
    when 'zone_shrunk' then title='Die Zone schrumpft';message='Prüfe die neue Grenze auf der Karte und bleibe auf sicheren Wegen.';
    else null;
   end case;
   if title is not null and (enabled or e->>'type' in ('emergency_pause','disconnect_pause','unsafe_zone','zone_warning')) then
    insert into public.push_jobs(user_id,lobby_id,event_key,kind,payload,expires_at)
    values((p->>'id')::uuid,new.id,e->>'id',e->>'type',jsonb_build_object('title','MANHUNT · '||title,'body',message,'url','/game','tag','event-'||(e->>'id')),now()+interval '5 minutes') on conflict(user_id,event_key) do nothing;
   end if;
  end loop;
  if enabled and s->>'status'='active' and p->>'role' in ('hunter','zombie') and not coalesce((p->>'eliminated')::boolean,false) then
   for pin in select value from jsonb_array_elements(coalesce(s->'pins','[]'::jsonb)) loop
    if pin->>'role'<>'hider' or exists(select 1 from jsonb_array_elements(coalesce(previous->'pins','[]'::jsonb)) x where x->>'id'=pin->>'id') then continue; end if;
    if s#>>'{settings,mode}'='team_hunt' and exists(select 1 from jsonb_array_elements(s->'players') x where x->>'id'=pin->>'playerId' and x->>'team'=p->>'team') then continue; end if;
    insert into public.push_jobs(user_id,lobby_id,event_key,kind,payload,expires_at)
    values((p->>'id')::uuid,new.id,'pin:'||(pin->>'id'),'new_pin',jsonb_build_object('title','MANHUNT · Neuer GPS-Pin','body','Ein neuer Pin ist auf deiner Karte verfügbar. Öffne MANHUNT.','url','/game','tag','new-pin-'||new.id::text),now()+interval '1 minute') on conflict(user_id,event_key) do nothing;
   end loop;
  end if;
 end loop;
 return null;
end;
$$;
create trigger game_push after insert or update on public.game_checkpoints for each row execute function public.queue_game_push();

create function public.cancel_deleted_game_push() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.push_jobs set status='cancelled',lease=null,locked_until=null where lobby_id=old.id and status in ('pending','sending');
 return null;
end;
$$;
create trigger game_push_deleted after delete on public.game_checkpoints for each row execute function public.cancel_deleted_game_push();
revoke all on function public.cancel_deleted_game_push() from public,anon,authenticated;
grant execute on function public.cancel_deleted_game_push() to service_role;

create function public.queue_social_push() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.push_jobs(user_id,event_key,kind,payload,expires_at) values(new.user_id,new.id::text,'social',
 jsonb_build_object('title',case when new.type='lobby_invite' then 'MANHUNT · Lobby-Einladung' else 'MANHUNT · Deine Crew' end,'body','Du hast eine neue Benachrichtigung. Öffne MANHUNT.','url','/notifications','tag','social-'||new.id::text),now()+interval '15 minutes') on conflict(user_id,event_key) do nothing;
 return null;
end;
$$;
create trigger social_push after insert on public.notifications for each row execute function public.queue_social_push();

create function public.claim_push_jobs(p_limit integer default 40) returns setof public.push_jobs language plpgsql security invoker set search_path='' as $$
begin
 delete from public.push_jobs where expires_at<now()-interval '1 day';
 return query with candidates as (
  select id from public.push_jobs where status in ('pending','sending') and due_at<=now() and available_at<=now() and expires_at>now()
   and attempts<5 and (locked_until is null or locked_until<now()) order by due_at for update skip locked limit least(greatest(p_limit,1),40)
 ) update public.push_jobs j set status='sending',attempts=j.attempts+1,lease=gen_random_uuid(),locked_until=now()+interval '45 seconds'
 from candidates c where j.id=c.id returning j.*;
end;
$$;
revoke all on function public.queue_game_push(),public.queue_social_push(),public.claim_push_jobs(integer) from public,anon,authenticated;
grant execute on function public.queue_game_push(),public.queue_social_push(),public.claim_push_jobs(integer) to service_role;

-- Wake the worker only when actual subscribed recipients have due work. The
-- database timer does not advance gameplay or fabricate background GPS.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_net') and exists(select 1 from pg_available_extensions where name='pg_cron') then
  execute 'create extension if not exists pg_net with schema extensions';
  execute 'create extension if not exists pg_cron';
  execute 'revoke all on net.http_request_queue,net._http_response from public,anon,authenticated';
  execute $cron$select cron.schedule('manhunt-web-push','10 seconds',$job$
   select net.http_post(url:=c.dispatch_url,headers:=jsonb_build_object('Content-Type','application/json','x-manhunt-push-secret',c.dispatch_secret),body:='{}'::jsonb,timeout_milliseconds:=20000)
   from public.push_config c where c.id=1 and exists(
    select 1 from public.push_jobs j where j.status in ('pending','sending') and j.due_at<=now() and j.available_at<=now() and j.expires_at>now()
     and j.attempts<5 and (j.locked_until is null or j.locked_until<now()) and exists(select 1 from public.push_subscriptions s where s.user_id=j.user_id)
   );
  $job$)$cron$;
  execute $cron$select cron.schedule('manhunt-push-retention','37 * * * *','delete from public.push_jobs where expires_at < now() - interval ''1 day'';')$cron$;
 end if;
end $$;
