begin;
-- Supabase Auth deletes users as supabase_auth_admin. Cascaded profile/social
-- deletes fire revision triggers as that role; grant only the non-sensitive
-- singleton counters, never game checkpoints, locations, account XP or auth data.
grant select(id,revision,social_revision),update(revision,social_revision)
 on public.edge_runtime to supabase_auth_admin;
create policy auth_cascade_read_revision on public.edge_runtime
 for select to supabase_auth_admin using(id=1);
create policy auth_cascade_update_revision on public.edge_runtime
 for update to supabase_auth_admin using(id=1) with check(id=1);

create or replace function public.award_match_progress() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb:=new.state; p jsonb; uid uuid; winner text; won boolean; survived boolean; captured integer; points integer; reward integer; daily integer; matches_today integer;
begin
 -- Erasure/retention edits of an already finished match must not issue rewards
 -- or read auth tables under the caller's lower-privilege role.
 if TG_OP='UPDATE' and old.state->>'status'='finished' then return new; end if;
 if s->>'status'<>'finished' or s->'result' is null or s->'result'->>'winner'='aborted' or s->'_engine'->'stats' is null then return new; end if;
 if (s->'result'->>'endedAt')::numeric-(s->>'startedAt')::numeric<300000 then return new; end if;
 if (select count(*) from jsonb_array_elements(s->'players') pp join auth.users u on u.id=(pp->>'id')::uuid where not coalesce(u.is_anonymous,false) and pp->>'role'<>'spectator')<2 then return new; end if;
 winner:=s->'result'->>'winner';
 for p in select value from jsonb_array_elements(s->'players') loop
  uid:=(p->>'id')::uuid;
  if p->>'role'='spectator' or coalesce((select is_anonymous from auth.users where id=uid),true) or coalesce(s->'_engine'->'leftIds','[]') ? uid::text then continue; end if;
  insert into public.account_progress(user_id) values(uid) on conflict do nothing;
  perform 1 from public.account_progress where user_id=uid for update;
  if exists(select 1 from public.xp_rewards where session_id=new.id and user_id=uid) then continue; end if;
  survived:=coalesce(s->'result'->'survivors','[]') ? uid::text;
  won:=case when winner='hiders' then survived when winner in('hunters','infected') then p->>'role' in('hunter','zombie') when winner like 'team_%' then winner='team_'||(p->>'team') else winner=uid::text end;
  captured:=least(40,greatest(0,coalesce((s->'_engine'->'stats'->uid::text->>'captures')::integer,0)));
  points:=least(100,greatest(0,coalesce((s->'_engine'->'stats'->uid::text->>'points')::integer,0)));
  select coalesce(sum(amount),0),count(*) into daily,matches_today from public.xp_rewards where user_id=uid and created_at>=date_trunc('day',now());
  reward:=least(greatest(0,500-daily),20+case when won then 30 else 0 end+least(100,captured*10)+least(100,points*5)+case when survived then 20 else 0 end);
  if matches_today>=5 then reward:=0; end if;
  insert into public.xp_rewards(session_id,user_id,amount) values(new.id,uid,reward);
  update public.account_progress set total_xp=total_xp+reward,games=games+1,wins=wins+won::integer,losses=losses+(not won and winner<>'draw')::integer,draws=draws+(winner='draw')::integer,captures=captures+captured,survivals=survivals+survived::integer,hunt_points=hunt_points+points,updated_at=now() where user_id=uid;
 end loop;
 return new;
end;
$$;
revoke all on function public.award_match_progress() from public,anon,authenticated;
grant execute on function public.award_match_progress() to service_role;

commit;
