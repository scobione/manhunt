-- Traffic diagnostics are visible exclusively to authenticated administrators.
create or replace function manhunt_private.read_match_traffic(p_actor uuid,p_session uuid,p_admin boolean,p_match uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected jsonb; members jsonb; buckets jsonb;
begin
 if p_admin is distinct from true or p_page is null or p_page not between 0 and 10000 or not manhunt_private.session_live(p_actor,p_session) or not exists(select 1 from public.account_controls where user_id=p_actor and not disabled and setup_stage=3 and is_admin) then raise exception 'traffic_forbidden'; end if;
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
