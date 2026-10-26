-- Retire emergency-pause notifications; keep all other game reminders.
create or replace function public.queue_game_push() returns trigger language plpgsql security invoker set search_path='' as $$
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
    when 'unsafe_zone' then title='Zonenphase übersprungen';message='Die bisherige sichere Spielzone bleibt bestehen. Öffne die Karte.';
    when 'zone_warning' then if e->>'actorId'=p->>'id' then title='AUSSERHALB DER SPIELZONE';message='Kehre auf einem sicheren Weg zurück. Öffne MANHUNT für den Countdown.';end if;
    when 'match_started' then title='Dein Match startet';message='Deine Rolle ist bereit. Öffne MANHUNT und aktiviere GPS.';
    when 'match_paused' then title='Match pausiert';message='Der Host hat das Match pausiert. Timer und Aktionen warten.';
    when 'xp_point' then title='Neuer XP-Punkt';message='Ein sicherer Punkt wurde freigegeben. Öffne deine Karte.';
    when 'xp_collected' then title='XP-Punkt eingesammelt';message='Euer Fortschritt wurde aktualisiert. Öffne MANHUNT.';
    when 'xp_candidate' then if s->>'hostId'=p->>'id' then title='XP-Punkt prüfen';message='Prüfe den vorgeschlagenen Wegpunkt vor Ort und bestätige den sicheren Zugang.';end if;
    when 'match_resumed' then title='Match fortgesetzt';message='Das Spiel geht weiter. Öffne MANHUNT für aktuelle Ortung.';
    when 'capture' then title='Fang registriert';message='Ein Fang wurde bestätigt. Öffne das Live-Protokoll.';
    when 'infection' then if e->>'targetId'=p->>'id' then title='Du wurdest infiziert';message='Öffne MANHUNT und bestätige deine neue Rolle.';end if;
    when 'elimination' then if e->>'targetId'=p->>'id' then title='Du bist ausgeschieden';message='Öffne MANHUNT für den Spielstatus.';end if;
    when 'match_finished' then title='Match beendet';message='Die Ergebnisse sind da. Öffne MANHUNT.';
    when 'zone_shrunk' then title='Die Zone schrumpft';message='Prüfe die neue Grenze auf der Karte und bleibe auf sicheren Wegen.';
    else null;
   end case;
   if title is not null and (enabled or e->>'type' in ('unsafe_zone','zone_warning')) then
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
  if enabled then
   for e in select value from jsonb_array_elements(coalesce(s#>'{_engine,chat}','[]'::jsonb)) loop
    if e->>'actorId'=p->>'id' or exists(select 1 from jsonb_array_elements(coalesce(previous#>'{_engine,chat}','[]'::jsonb)) x where x->>'id'=e->>'id') then continue; end if;
    if e->>'channel'<>'all' and (coalesce((p->>'eliminated')::boolean,false) or coalesce((p->>'infectionPending')::boolean,false) or p->>'role'='spectator' or e->>'channel'<>case when s#>>'{settings,mode}'='team_hunt' then p->>'team' when p->>'role'='hider' then 'hiders' else 'hunters' end) then continue; end if;
    insert into public.push_jobs(user_id,lobby_id,event_key,kind,payload,expires_at)
    values((p->>'id')::uuid,new.id,'chat:'||(e->>'id'),'chat',jsonb_build_object('title','MANHUNT · Neue Nachricht','body','Deine Crew hat eine Nachricht gesendet. Öffne den Chat.','url','/game','tag','chat-'||new.id::text),now()+interval '1 minute') on conflict(user_id,event_key) do nothing;
   end loop;
  end if;
 end loop;
 return null;
end;
$$;

