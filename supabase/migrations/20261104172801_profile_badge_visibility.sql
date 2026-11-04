-- Profile badges: explicit owner visibility, default visible after a real unlock.
-- Friends read a narrow service-only projection; they never read private badge rows.
begin;
create table public.badge_visibility (
 user_id uuid not null references auth.users(id) on delete cascade,
 badge_id text not null,
 visible boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(user_id,badge_id),
 foreign key(user_id,badge_id) references public.player_badges(user_id,badge_id) on delete cascade
);
alter table public.badge_visibility enable row level security;
revoke all on public.badge_visibility from public,anon,authenticated;
grant all on public.badge_visibility to service_role;
grant select on public.badge_visibility to authenticated;
create policy own_badge_visibility on public.badge_visibility for select to authenticated
 using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));

create or replace function public.read_player_badges(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('registered',coalesce(manhunt_private.feature_user_registered(p_user),false),
 'badges',coalesce((select jsonb_agg(d.definition || jsonb_build_object(
   'level',coalesce(b.level,0),'unlockedAt',b.unlocked_at,'upgradedAt',b.upgraded_at,
   'progress',coalesce(case d.definition->>'metric' when 'feedback' then c.feedback when 'captures' then c.captures when 'hiderWins' then c.hider_wins when 'games' then c.games when 'huntPoints' then c.hunt_points end,0)) order by d.id)
   from public.badge_definitions d left join public.player_badges b on b.badge_id=d.id and b.user_id=p_user
   left join public.achievement_counters c on c.user_id=p_user),'[]'::jsonb),
 'selected',(select jsonb_build_object('id',d.id,'name',d.definition->>'name','icon',d.definition->>'icon','level',b.level,'stageName',d.definition->'stageNames'->>(b.level-1))
   from public.badge_equipped e join public.player_badges b on b.user_id=e.user_id and b.badge_id=e.badge_id join public.badge_definitions d on d.id=e.badge_id where e.user_id=p_user and not exists(select 1 from public.badge_visibility v where v.user_id=p_user and v.badge_id=e.badge_id and not v.visible)),
 'visibleBadgeIds',coalesce((select jsonb_agg(b.badge_id order by b.badge_id) from public.player_badges b where b.user_id=p_user and not exists(select 1 from public.badge_visibility v where v.user_id=b.user_id and v.badge_id=b.badge_id and not v.visible)),'[]'::jsonb),
 'notices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'badgeId',n.badge_id,'name',d.definition->>'name','level',n.level,'at',n.created_at) order by n.created_at)
   from public.badge_notices n join public.badge_definitions d on d.id=n.badge_id where n.user_id=p_user and n.seen_at is null),'[]'::jsonb));
$$;
create or replace function public.choose_profile_badge(p_user uuid,p_badge text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required'; end if;
 if p_badge is null then delete from public.badge_equipped where user_id=p_user;
 else
  if not exists(select 1 from public.player_badges where user_id=p_user and badge_id=p_badge) then raise exception 'badge_locked'; end if;
  insert into public.badge_visibility(user_id,badge_id,visible) values(p_user,p_badge,true) on conflict(user_id,badge_id) do update set visible=true,updated_at=now();
  insert into public.badge_equipped(user_id,badge_id) values(p_user,p_badge) on conflict(user_id) do update set badge_id=excluded.badge_id;
 end if;
 return public.read_player_badges(p_user);
end;
$$;

create function public.set_badge_visibility(p_user uuid,p_badge text,p_visible boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required'; end if;
 if not exists(select 1 from public.player_badges where user_id=p_user and badge_id=p_badge) then raise exception 'badge_locked'; end if;
 insert into public.badge_visibility(user_id,badge_id,visible) values(p_user,p_badge,p_visible)
 on conflict(user_id,badge_id) do update set visible=excluded.visible,updated_at=now();
 if not p_visible then delete from public.badge_equipped where user_id=p_user and badge_id=p_badge; end if;
 return public.read_player_badges(p_user);
end;
$$;

create function public.read_friend_profile(p_viewer uuid,p_target uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_viewer<>p_target and (
  exists(select 1 from public.blocked_users where (user_id=p_viewer and blocked_id=p_target) or (user_id=p_target and blocked_id=p_viewer))
  or not exists(select 1 from public.friendships where user_id=least(p_viewer,p_target) and friend_id=greatest(p_viewer,p_target))
 ) then raise exception 'profile_not_found'; end if;
 select jsonb_build_object(
  'id',p.id,'username',p.username,'avatar_url',p.avatar_url,'created_at',p.created_at,
  'progress',(select jsonb_build_object('total_xp',a.total_xp,'games',a.games,'wins',a.wins,'losses',a.losses,'draws',a.draws,'captures',a.captures,'survivals',a.survivals,'hunt_points',a.hunt_points) from public.account_progress a where a.user_id=p.id),
  'badges',coalesce((select jsonb_agg(jsonb_build_object(
    'id',d.id,'name',d.definition->>'name','icon',d.definition->>'icon','level',b.level,
    'stageName',d.definition->'stageNames'->>(b.level-1),'description',d.definition->>'description',
    'unlockedAt',b.unlocked_at,'upgradedAt',b.upgraded_at) order by d.id)
   from public.player_badges b join public.badge_definitions d on d.id=b.badge_id
   where b.user_id=p.id and not exists(select 1 from public.badge_visibility v where v.user_id=b.user_id and v.badge_id=b.badge_id and not v.visible)),'[]'::jsonb))
 into result from public.profiles p where p.id=p_target
 and not exists(select 1 from public.account_controls c where c.user_id=p.id and c.disabled);
 if result is null then raise exception 'profile_not_found'; end if;
 return result;
end;
$$;

revoke all on function public.read_friend_profile(uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_badge_visibility(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.read_friend_profile(uuid,uuid) to service_role;
grant execute on function public.set_badge_visibility(uuid,text,boolean) to service_role;
-- Replacement invoker functions keep their existing service-role-only ACLs.
commit;
