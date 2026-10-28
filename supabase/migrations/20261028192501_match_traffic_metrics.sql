-- Aggregate client diagnostics only: no URL, SSID, IP, coordinates or payloads.
create table public.match_traffic (
 match_id uuid not null references public.game_sessions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 client_id uuid not null, network text not null check(network in ('wifi','cellular','ethernet','unknown')),
 sequence integer not null check(sequence between 1 and 1000000),
 down bigint not null check(down between 0 and 2000000000),
 estimated bigint not null check(estimated between 0 and 2000000000),
 up bigint not null check(up between 0 and 2000000000),
 requests integer not null check(requests between 0 and 1000000),
 unmeasured integer not null check(unmeasured between 0 and 1000000),
 cached integer not null check(cached between 0 and 1000000),
 updated_at timestamptz not null default now(),
 primary key(match_id,user_id,client_id,network)
);
alter table public.match_traffic enable row level security;
revoke all on public.match_traffic from anon,authenticated;
grant all on public.match_traffic to service_role;
create index match_traffic_user on public.match_traffic(user_id);
create index match_traffic_expiry on public.match_traffic(updated_at);

create function manhunt_private.record_match_traffic(p_actor uuid,p_session uuid,p_match uuid,p_client uuid,p_sequence integer,p_buckets jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b record; c record;
begin
 if not manhunt_private.session_live(p_actor,p_session) or not exists(select 1 from public.account_controls where user_id=p_actor and not disabled and setup_stage=3)
 or not exists(select 1 from public.game_participants p join public.game_sessions g on g.id=p.session_id where p.user_id=p_actor and p.session_id=p_match and (g.ended_at is null or g.ended_at>now()-interval '6 hours')) then raise exception 'traffic_forbidden'; end if;
 if p_client is null or p_sequence is null or p_sequence not between 1 and 1000000 or jsonb_typeof(p_buckets) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_buckets))<>4 or not p_buckets ?& array['wifi','cellular','ethernet','unknown'] then raise exception 'traffic_invalid'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_match::text||p_actor::text,73));
 if not exists(select 1 from public.match_traffic where match_id=p_match and user_id=p_actor and client_id=p_client) and (select count(distinct client_id) from public.match_traffic where match_id=p_match and user_id=p_actor)>=128 then raise exception 'traffic_limit'; end if;
 delete from public.match_traffic where updated_at<now()-interval '30 days';
 for b in select key,value from jsonb_each(p_buckets) loop
  select * into c from jsonb_to_record(b.value) as x(down bigint,estimated bigint,up bigint,requests integer,unmeasured integer,cached integer);
  insert into public.match_traffic as t(match_id,user_id,client_id,network,sequence,down,estimated,up,requests,unmeasured,cached)
   values(p_match,p_actor,p_client,b.key,p_sequence,c.down,c.estimated,c.up,c.requests,c.unmeasured,c.cached)
   on conflict(match_id,user_id,client_id,network) do update set sequence=excluded.sequence,down=greatest(t.down,excluded.down),estimated=greatest(t.estimated,excluded.estimated),up=greatest(t.up,excluded.up),requests=greatest(t.requests,excluded.requests),unmeasured=greatest(t.unmeasured,excluded.unmeasured),cached=greatest(t.cached,excluded.cached),updated_at=now()
   where excluded.sequence>t.sequence;
 end loop;
 return jsonb_build_object('ok',true);
end $$;

create function manhunt_private.read_match_traffic(p_actor uuid,p_session uuid,p_admin boolean,p_match uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected jsonb; members jsonb; buckets jsonb;
begin
 if p_admin is null or p_page is null or p_page not between 0 and 10000 or not manhunt_private.session_live(p_actor,p_session) or not exists(select 1 from public.account_controls where user_id=p_actor and not disabled and setup_stage=3 and (not p_admin or is_admin)) then raise exception 'traffic_forbidden'; end if;
 if not p_admin and (p_match is null or not exists(select 1 from public.game_participants where session_id=p_match and user_id=p_actor)) then raise exception 'traffic_forbidden'; end if;
 select coalesce(jsonb_agg(row_to_json(q)),'[]') into selected from (
  select g.id,l.code,g.status,g.started_at as "startedAt",g.ended_at as "endedAt",
   (select count(*) from public.game_participants p where p.session_id=g.id) as players,
   (select count(distinct t.user_id) from public.match_traffic t where t.match_id=g.id and t.updated_at>now()-interval '30 days') as reporters,
   (select coalesce(sum(t.down+t.estimated+t.up),0) from public.match_traffic t where t.match_id=g.id and t.updated_at>now()-interval '30 days') as bytes,
   (select max(t.updated_at) from public.match_traffic t where t.match_id=g.id and t.updated_at>now()-interval '30 days') as "updatedAt"
  from public.game_sessions g join public.lobbies l on l.id=g.lobby_id
  where (p_match is null or g.id=p_match) order by g.created_at desc,g.id limit 21 offset case when p_match is null then p_page*20 else 0 end
 ) q;
 if p_match is null then return jsonb_build_object('matches',case when jsonb_array_length(selected)>20 then selected-20 else selected end,'page',p_page,'hasMore',jsonb_array_length(selected)>20); end if;
 if jsonb_array_length(selected)=0 then raise exception 'traffic_forbidden'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'username',u.username,'avatarUrl',u.avatar_url,'updatedAt',(select max(t.updated_at) from public.match_traffic t where t.match_id=p_match and t.user_id=p.user_id and t.updated_at>now()-interval '30 days')) order by u.username),'[]') into members from public.game_participants p join public.profiles u on u.id=p.user_id where p.session_id=p_match;
 select coalesce(jsonb_agg(row_to_json(q)),'[]') into buckets from (
  select user_id as "userId",network,sum(down) as down,sum(estimated) as estimated,sum(up) as up,sum(requests) as requests,sum(unmeasured) as unmeasured,sum(cached) as cached
  from public.match_traffic where match_id=p_match and updated_at>now()-interval '30 days' group by user_id,network
 ) q;
 return jsonb_build_object('match',selected->0,'players',members,'rows',buckets);
end $$;
create function public.record_match_traffic(p_actor uuid,p_session uuid,p_match uuid,p_client uuid,p_sequence integer,p_buckets jsonb) returns jsonb language sql security invoker set search_path='' as $$ select manhunt_private.record_match_traffic(p_actor,p_session,p_match,p_client,p_sequence,p_buckets) $$;
create function public.read_match_traffic(p_actor uuid,p_session uuid,p_admin boolean,p_match uuid,p_page integer) returns jsonb language sql security invoker set search_path='' as $$ select manhunt_private.read_match_traffic(p_actor,p_session,p_admin,p_match,p_page) $$;
revoke all on function manhunt_private.record_match_traffic(uuid,uuid,uuid,uuid,integer,jsonb),manhunt_private.read_match_traffic(uuid,uuid,boolean,uuid,integer),public.record_match_traffic(uuid,uuid,uuid,uuid,integer,jsonb),public.read_match_traffic(uuid,uuid,boolean,uuid,integer) from public,anon,authenticated;
grant execute on function manhunt_private.record_match_traffic(uuid,uuid,uuid,uuid,integer,jsonb),manhunt_private.read_match_traffic(uuid,uuid,boolean,uuid,integer),public.record_match_traffic(uuid,uuid,uuid,uuid,integer,jsonb),public.read_match_traffic(uuid,uuid,boolean,uuid,integer) to service_role;
