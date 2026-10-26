begin;
create table public.account_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 total_xp bigint not null default 0 check(total_xp>=0),
 games integer not null default 0, wins integer not null default 0, losses integer not null default 0,
 draws integer not null default 0, captures integer not null default 0, survivals integer not null default 0,
 hunt_points integer not null default 0, updated_at timestamptz not null default now()
);
create table public.xp_rewards (
 session_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 amount integer not null check(amount between 0 and 500), created_at timestamptz not null default now(),
 primary key(session_id,user_id)
);
create index xp_rewards_user_day on public.xp_rewards(user_id,created_at);
alter table public.account_progress enable row level security;
alter table public.xp_rewards enable row level security;
revoke all on public.account_progress,public.xp_rewards from anon,authenticated;
grant select on public.account_progress,public.xp_rewards to authenticated;
grant all on public.account_progress,public.xp_rewards to service_role;
create policy own_progress on public.account_progress for select to authenticated using(user_id=(select auth.uid()));
create policy own_rewards on public.xp_rewards for select to authenticated using(user_id=(select auth.uid()));
create function public.award_match_progress() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb:=new.state; p jsonb; uid uuid; winner text; won boolean; survived boolean; captured integer; points integer; reward integer; daily integer; matches_today integer;
begin
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
create trigger award_match_progress after insert or update of state on public.game_checkpoints for each row execute function public.award_match_progress();
create or replace function public.delete_account(p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare row public.game_checkpoints; cleaned jsonb; next_revision bigint;
begin
  -- Use the same lock order as edge_commit. This transaction invalidates any
  -- snapshot read before erasure, including when only historical data remains.
  update public.edge_runtime set revision=revision+1 where id=1;
  for row in select * from public.game_checkpoints
    where state::text like '%' || p_actor::text || '%' order by id for update loop
    cleaned := row.state;
    cleaned := jsonb_set(cleaned,'{players}',coalesce((select jsonb_agg(p - 'location' - 'captureCode')
      from jsonb_array_elements(coalesce(cleaned->'players','[]'::jsonb)) p
      where p->>'id' <> p_actor::text),'[]'::jsonb));
    cleaned := cleaned || jsonb_build_object('pins','[]'::jsonb,'events','[]'::jsonb,'captures','[]'::jsonb);
    if jsonb_typeof(cleaned->'result')='object' then
      cleaned := jsonb_set(cleaned,'{result}',public.erase_result_identity(cleaned->'result',p_actor));
    end if;
    if jsonb_typeof(cleaned->'_engine')='object' then
      cleaned := jsonb_set(cleaned,'{_engine,stats}',coalesce(cleaned#>'{_engine,stats}','{}'::jsonb)-p_actor::text);
      cleaned := jsonb_set(cleaned,'{_engine,chatRate}',coalesce(cleaned#>'{_engine,chatRate}','{}'::jsonb)-p_actor::text);
      cleaned := jsonb_set(cleaned,'{_engine,chat}','[]'::jsonb);
      if jsonb_typeof(cleaned->'xpHunt')='object' then cleaned:=jsonb_set(cleaned,'{xpHunt,byPlayer}',coalesce(cleaned#>'{xpHunt,byPlayer}','{}'::jsonb)-p_actor::text)#-'{xpHunt,lastCollector}'; end if;
      cleaned := jsonb_set(cleaned,'{_engine,players}',coalesce(cleaned#>'{_engine,players}','{}'::jsonb)-p_actor::text);
      cleaned := jsonb_set(cleaned,'{_engine,leftIds}',coalesce((select jsonb_agg(v)
        from jsonb_array_elements(coalesce(cleaned#>'{_engine,leftIds}','[]'::jsonb)) v
        where v#>>'{}'<>p_actor::text),'[]'::jsonb));
    end if;
    if cleaned->>'hostId'=p_actor::text then
      delete from public.game_checkpoints where id=row.id;
      update public.lobbies set status='closed',revision=revision+1,updated_at=now() where id=row.id;
    else
      select greatest(revision,coalesce((cleaned->>'revision')::bigint,0))+1 into next_revision
        from public.lobbies where id=row.id;
      cleaned := jsonb_set(cleaned,'{revision}',to_jsonb(next_revision));
      update public.lobbies set revision=next_revision where id=row.id;
      -- Preserve the retention timestamp: erasure must not extend GPS retention.
      update public.game_checkpoints set state=cleaned where id=row.id;
    end if;
  end loop;
  update public.match_results set result=public.erase_result_identity(result,p_actor)
    where result->>'winner'=p_actor::text or result->'survivors' ? p_actor::text;
  delete from public.notifications where payload->>'from'=p_actor::text;
  delete from public.audit_logs where actor_id=p_actor;
  -- Storage bytes and the Auth user are removed by their supported APIs.
end;
$$;

commit;
