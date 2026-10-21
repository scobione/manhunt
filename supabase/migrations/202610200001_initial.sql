-- MANHUNT — initial schema. Apply with the Supabase SQL migration runner.
-- Browser roles cannot write authoritative game state or read other players' GPS.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  avatar_url text check (avatar_url is null or (length(avatar_url) <= 2048 and avatar_url ~ '^https://')),
  friend_code text not null default upper(encode(extensions.gen_random_bytes(6), 'hex'))
    check (friend_code ~ '^[A-Z0-9]{12}$') unique,
  show_online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles(lower(username));

create table public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id < friend_id)
);
create index friendships_reverse on public.friendships(friend_id, user_id);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);
create unique index friend_requests_one_pending_pair on public.friend_requests
  (least(sender_id,receiver_id), greatest(sender_id,receiver_id)) where status = 'pending';
create index friend_requests_received on public.friend_requests(receiver_id,status,created_at desc);
create index friend_requests_sent on public.friend_requests(sender_id,created_at desc);

create table public.blocked_users (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,blocked_id),
  check (user_id <> blocked_id)
);
create index blocked_users_reverse on public.blocked_users(blocked_id,user_id);

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[A-Z0-9]{6}$'),
  host_id uuid references public.profiles(id) on delete set null,
  status text not null default 'waiting' check(status in ('waiting','preparing','active','paused','finished','closed')),
  settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings) = 'object'),
  revision bigint not null default 0 check(revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lobbies_host_status on public.lobbies(host_id,status);
create table public.lobby_members (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'hider' check(role in ('hunter','hider','zombie','spectator')),
  team text not null default 'A' check(team in ('A','B')),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key(lobby_id,user_id)
);
create index lobby_members_user on public.lobby_members(user_id,lobby_id);

create table public.lobby_invites (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired')),
  expires_at timestamptz not null default now() + interval '1 hour',
  created_at timestamptz not null default now(),
  check(inviter_id <> invitee_id)
);
create unique index lobby_invites_pending on public.lobby_invites(lobby_id,invitee_id) where status = 'pending';
create index lobby_invites_recipient on public.lobby_invites(invitee_id,status,expires_at);

create table public.game_sessions (
  id uuid primary key,
  lobby_id uuid not null unique references public.lobbies(id) on delete cascade,
  mode text not null check(mode in ('normal','zombie','apocalypse','hide_seek','last_survivor','team_hunt','infection_rush','custom')),
  status text not null check(status in ('preparing','active','paused','finished','closed')),
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.game_participants (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('hunter','hider','zombie','spectator')),
  team text not null check(team in ('A','B')),
  eliminated boolean not null default false,
  primary key(session_id,user_id)
);
create index game_participants_user on public.game_participants(user_id,session_id);

create table public.game_settings (
  lobby_id uuid primary key references public.lobbies(id) on delete cascade,
  settings jsonb not null check(jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.game_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  lobby_id uuid unique references public.lobbies(id) on delete cascade,
  name text not null check(length(name) between 1 and 80),
  feature jsonb not null check(feature->>'type' = 'Feature' and feature->'geometry'->>'type' = 'Polygon'),
  excluded jsonb not null default '[]'::jsonb check(jsonb_typeof(excluded) = 'array'),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  check(user_id is not null or lobby_id is not null)
);
create index game_zones_owner on public.game_zones(user_id);

create table public.location_pins (
  id uuid primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy double precision not null check(accuracy >= 0 and accuracy <= 10000),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at > created_at)
);
create index location_pins_expiry on public.location_pins(expires_at);
create index location_pins_session on public.location_pins(session_id,created_at desc);

create table public.capture_events (
  id uuid primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  hunter_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null,
  check(hunter_id is null or target_id is null or hunter_id <> target_id)
);
create index capture_events_session on public.capture_events(session_id,created_at);
create table public.infection_events (
  id uuid primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null
);
create index infection_events_session on public.infection_events(session_id,created_at);
create table public.zone_events (
  id uuid primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  created_at timestamptz not null
);
create index zone_events_session on public.zone_events(session_id,created_at);

create table public.match_results (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  role text not null check(role in ('hunter','hider','zombie','spectator')),
  team text not null check(team in ('A','B')),
  result jsonb not null check(jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key(session_id,user_id)
);
create index match_results_user_date on public.match_results(user_id,created_at desc);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check(length(type) between 1 and 40),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_inbox on public.notifications(user_id,created_at desc);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check(length(action) between 1 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_date on public.audit_logs(created_at);
create table public.game_checkpoints (
  id uuid primary key references public.lobbies(id) on delete cascade,
  state jsonb not null check(jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
create index game_checkpoints_updated on public.game_checkpoints(updated_at);
create table public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check(length(name) between 1 and 80),
  settings jsonb not null check(jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  unique(user_id,name)
);
create table public.push_subscriptions (
  endpoint text primary key check(endpoint ~ '^https://' and length(endpoint) <= 2048),
  user_id uuid not null references public.profiles(id) on delete cascade,
  keys jsonb not null check(jsonb_typeof(keys) = 'object' and keys ? 'auth' and keys ? 'p256dh'),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);

-- Unique, harmless generated username; Google names never become SQL identifiers.
create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
declare candidate text; picture text;
begin
  candidate := 'player_' || substr(replace(new.id::text,'-',''),1,16);
  picture := new.raw_user_meta_data->>'avatar_url';
  if picture !~ '^https://' or length(picture) > 2048 then picture := null; end if;
  insert into public.profiles(id,username,avatar_url) values(new.id,candidate,picture);
  return new;
end;
$$;
create trigger manhunt_auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();

-- Every application table uses RLS, even service-only tables. No client write grants.
do $$ declare t text; begin
  foreach t in array array['profiles','friendships','friend_requests','blocked_users','lobbies','lobby_members',
    'lobby_invites','game_sessions','game_participants','game_settings','game_zones','location_pins',
    'capture_events','infection_events','zone_events','match_results','notifications','audit_logs',
    'game_checkpoints','presets','push_subscriptions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
grant select on public.profiles, public.friendships, public.friend_requests, public.blocked_users,
  public.lobbies, public.lobby_members, public.lobby_invites, public.game_sessions, public.game_participants,
  public.game_settings, public.game_zones, public.location_pins, public.match_results, public.notifications,
  public.presets to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated using(id = auth.uid());
create policy profiles_read_friends on public.profiles for select to authenticated using (
  exists(select 1 from public.friendships f where (f.user_id = auth.uid() and f.friend_id = id) or (f.friend_id = auth.uid() and f.user_id = id))
);
create policy friendships_read on public.friendships for select to authenticated using(user_id = auth.uid() or friend_id = auth.uid());
create policy friend_requests_read on public.friend_requests for select to authenticated using(sender_id = auth.uid() or receiver_id = auth.uid());
create policy blocked_users_read on public.blocked_users for select to authenticated using(user_id = auth.uid());
-- Membership is intentionally self-only: no policy recursion, no premature role disclosure.
create policy lobby_members_read on public.lobby_members for select to authenticated using(user_id = auth.uid());
create policy lobbies_read on public.lobbies for select to authenticated using(
  host_id = auth.uid() or exists(select 1 from public.lobby_members m where m.lobby_id = id and m.user_id = auth.uid())
);
create policy lobby_invites_read on public.lobby_invites for select to authenticated using(inviter_id = auth.uid() or invitee_id = auth.uid());
create policy game_participants_read on public.game_participants for select to authenticated using(user_id = auth.uid());
create policy game_sessions_read on public.game_sessions for select to authenticated using(
  exists(select 1 from public.game_participants p where p.session_id = id and p.user_id = auth.uid())
);
create policy game_settings_read on public.game_settings for select to authenticated using(
  exists(select 1 from public.lobby_members m where m.lobby_id = game_settings.lobby_id and m.user_id = auth.uid())
);
create policy game_zones_read on public.game_zones for select to authenticated using(user_id = auth.uid() or
  exists(select 1 from public.lobby_members m where m.lobby_id = game_zones.lobby_id and m.user_id = auth.uid())
);
-- Pins visible to a hunter are selected by the authoritative server, not by a broad lobby SELECT policy.
create policy location_pins_read_self on public.location_pins for select to authenticated using(player_id = auth.uid());
create policy match_results_read on public.match_results for select to authenticated using(user_id = auth.uid());
create policy notifications_read on public.notifications for select to authenticated using(user_id = auth.uid());
create policy presets_read on public.presets for select to authenticated using(user_id = auth.uid());

-- Pair locks serialize blocking, invitations, and friendship transitions in either direction.
create function public.lock_social_pair(p_a uuid,p_b uuid) returns void language sql security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(p_a,p_b)::text || ':' || greatest(p_a,p_b)::text,0));
$$;
create function public.is_blocked_pair(p_a uuid,p_b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.blocked_users where (user_id=p_a and blocked_id=p_b) or (user_id=p_b and blocked_id=p_a));
$$;
create function public.request_friend(p_actor uuid,p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid; request_id uuid;
begin
  select id into target from public.profiles where friend_code = upper(trim(p_code));
  if target is null or target = p_actor then raise exception 'Freundescode ungültig'; end if;
  perform public.lock_social_pair(p_actor,target);
  if public.is_blocked_pair(p_actor,target) then raise exception 'Freundescode ungültig'; end if;
  if exists(select 1 from public.friendships where user_id=least(p_actor,target) and friend_id=greatest(p_actor,target)) then raise exception 'Ihr seid bereits befreundet'; end if;
  select id into request_id from public.friend_requests where sender_id=p_actor and receiver_id=target and status='pending';
  if request_id is not null then return jsonb_build_object('id',request_id,'user_ids',jsonb_build_array(p_actor,target)); end if;
  if exists(select 1 from public.friend_requests where sender_id=target and receiver_id=p_actor and status='pending') then raise exception 'Es liegt bereits eine Anfrage vor'; end if;
  if (select count(*) from public.friend_requests where sender_id=p_actor and created_at>now()-interval '24 hours') >= 20 then raise exception 'Tageslimit für Freundschaftsanfragen erreicht'; end if;
  insert into public.friend_requests(sender_id,receiver_id) values(p_actor,target) returning id into request_id;
  insert into public.notifications(user_id,type,payload) values(target,'friend_request',jsonb_build_object('requestId',request_id,'from',p_actor));
  return jsonb_build_object('id',request_id,'user_ids',jsonb_build_array(p_actor,target));
end;
$$;
create function public.respond_friend(p_actor uuid,p_request uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.friend_requests;
begin
  select * into request from public.friend_requests where id=p_request and receiver_id=p_actor;
  if not found then raise exception 'Anfrage nicht gefunden'; end if;
  perform public.lock_social_pair(p_actor,request.sender_id);
  select * into request from public.friend_requests where id=p_request and receiver_id=p_actor for update;
  if not found or request.status <> 'pending' then raise exception 'Anfrage nicht mehr offen'; end if;
  if public.is_blocked_pair(p_actor,request.sender_id) then raise exception 'Anfrage nicht verfügbar'; end if;
  update public.friend_requests set status=case when p_accept then 'accepted' else 'rejected' end,responded_at=now() where id=p_request;
  if p_accept then
    insert into public.friendships(user_id,friend_id) values(least(p_actor,request.sender_id),greatest(p_actor,request.sender_id)) on conflict do nothing;
    insert into public.notifications(user_id,type,payload) values(request.sender_id,'friend_accepted',jsonb_build_object('from',p_actor));
  end if;
  return jsonb_build_object('user_ids',jsonb_build_array(p_actor,request.sender_id));
end;
$$;
create function public.remove_friend(p_actor uuid,p_target uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_social_pair(p_actor,p_target);
  delete from public.friendships where user_id=least(p_actor,p_target) and friend_id=greatest(p_actor,p_target);
  return jsonb_build_object('user_ids',jsonb_build_array(p_actor,p_target));
end;
$$;
create function public.block_user(p_actor uuid,p_target uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_actor=p_target then raise exception 'Eigenes Konto kann nicht blockiert werden'; end if;
  perform public.lock_social_pair(p_actor,p_target);
  insert into public.blocked_users(user_id,blocked_id) values(p_actor,p_target) on conflict do nothing;
  delete from public.friendships where user_id=least(p_actor,p_target) and friend_id=greatest(p_actor,p_target);
  update public.friend_requests set status='rejected',responded_at=now() where status='pending' and
    ((sender_id=p_actor and receiver_id=p_target) or (sender_id=p_target and receiver_id=p_actor));
  delete from public.lobby_invites where (inviter_id=p_actor and invitee_id=p_target) or (inviter_id=p_target and invitee_id=p_actor);
  delete from public.notifications where (user_id=p_actor and payload->>'from'=p_target::text) or (user_id=p_target and payload->>'from'=p_actor::text);
  return jsonb_build_object('user_ids',jsonb_build_array(p_actor,p_target));
end;
$$;
create function public.invite_friend(p_actor uuid,p_friend uuid,p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare lobby public.lobbies; invite_id uuid;
begin
  perform public.lock_social_pair(p_actor,p_friend);
  if public.is_blocked_pair(p_actor,p_friend) or not exists(select 1 from public.friendships where user_id=least(p_actor,p_friend) and friend_id=greatest(p_actor,p_friend)) then raise exception 'Freund nicht verfügbar'; end if;
  select l.* into lobby from public.lobbies l join public.lobby_members m on m.lobby_id=l.id where l.code=upper(trim(p_code)) and m.user_id=p_actor and l.status='waiting' for update of l;
  if not found then raise exception 'Lobby nicht verfügbar'; end if;
  update public.lobby_invites set status='expired' where lobby_id=lobby.id and invitee_id=p_friend and status='pending' and expires_at<=now();
  select id into invite_id from public.lobby_invites where lobby_id=lobby.id and invitee_id=p_friend and status='pending';
  if invite_id is null then
    insert into public.lobby_invites(lobby_id,inviter_id,invitee_id) values(lobby.id,p_actor,p_friend) returning id into invite_id;
    insert into public.notifications(user_id,type,payload) values(p_friend,'lobby_invite',jsonb_build_object('inviteId',invite_id,'from',p_actor,'code',lobby.code));
  end if;
  return jsonb_build_object('id',invite_id,'user_ids',jsonb_build_array(p_actor,p_friend));
end;
$$;

-- The only production persistence entry point. A transaction prevents a saved
-- checkpoint from diverging from its visible lobby/member/result projections.
create function public.save_game_checkpoint(p_state jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_lobby_id uuid := (p_state->>'id')::uuid;
  member jsonb; pin jsonb; event jsonb; saved_state jsonb := p_state;
  terminal boolean := p_state->>'status' in ('finished','closed');
  previous_revision bigint;
begin
  if jsonb_typeof(p_state)<>'object' or jsonb_typeof(p_state->'players')<>'array' or jsonb_array_length(p_state->'players')>64 then raise exception 'Invalid checkpoint'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lobby_id::text,1));
  select revision into previous_revision from public.lobbies where id=v_lobby_id;
  if previous_revision is not null and previous_revision > (p_state->>'revision')::bigint then raise exception 'Stale checkpoint'; end if;
  insert into public.lobbies(id,code,host_id,status,settings,revision,created_at,updated_at)
    values(v_lobby_id,p_state->>'code',(p_state->>'hostId')::uuid,p_state->>'status',p_state->'settings',(p_state->>'revision')::bigint,to_timestamp((p_state->>'createdAt')::double precision/1000),now())
    on conflict(id) do update set host_id=excluded.host_id,status=excluded.status,settings=excluded.settings,revision=excluded.revision,updated_at=now();
  insert into public.game_settings(lobby_id,settings) values(v_lobby_id,p_state->'settings')
    on conflict(lobby_id) do update set settings=excluded.settings,updated_at=now();
  delete from public.lobby_members where lobby_members.lobby_id=v_lobby_id and not exists(select 1 from jsonb_array_elements(p_state->'players') p where (p->>'id')::uuid=lobby_members.user_id);
  for member in select value from jsonb_array_elements(p_state->'players') loop
    insert into public.lobby_members(lobby_id,user_id,role,team,ready) values(v_lobby_id,(member->>'id')::uuid,member->>'role',member->>'team',(member->>'ready')::boolean)
      on conflict(lobby_id,user_id) do update set role=excluded.role,team=excluded.team,ready=excluded.ready;
  end loop;
  if p_state->'zone' is not null and p_state->'zone' <> 'null'::jsonb then
    insert into public.game_zones(lobby_id,user_id,name,feature,excluded,confirmed) values(v_lobby_id,(p_state->>'hostId')::uuid,p_state->'zone'->>'name',p_state->'zone'->'feature',coalesce(p_state->'zone'->'excluded','[]'::jsonb),coalesce((p_state->'zone'->>'confirmed')::boolean,false))
      on conflict(lobby_id) do update set user_id=excluded.user_id,name=excluded.name,feature=excluded.feature,excluded=excluded.excluded,confirmed=excluded.confirmed;
  else delete from public.game_zones where game_zones.lobby_id=v_lobby_id; end if;
  if p_state->>'startedAt' is not null then
    insert into public.game_sessions(id,lobby_id,mode,status,started_at,ended_at) values(v_lobby_id,v_lobby_id,p_state->'settings'->>'mode',p_state->>'status',to_timestamp((p_state->>'startedAt')::double precision/1000),case when terminal then coalesce(to_timestamp((p_state->'result'->>'endedAt')::double precision/1000),now()) end)
      on conflict(id) do update set status=excluded.status,ended_at=excluded.ended_at;
    for member in select value from jsonb_array_elements(p_state->'players') loop
      insert into public.game_participants(session_id,user_id,role,team,eliminated) values(v_lobby_id,(member->>'id')::uuid,member->>'role',member->>'team',(member->>'eliminated')::boolean)
        on conflict(session_id,user_id) do update set role=excluded.role,team=excluded.team,eliminated=excluded.eliminated;
      if p_state->'result' is not null and p_state->'result'<>'null'::jsonb then
        insert into public.match_results(session_id,user_id,username,role,team,result) values(v_lobby_id,(member->>'id')::uuid,member->>'username',member->>'role',member->>'team',p_state->'result') on conflict(session_id,user_id) do nothing;
      end if;
    end loop;
    delete from public.location_pins where session_id=v_lobby_id;
    if not terminal then
      for pin in select value from jsonb_array_elements(coalesce(p_state->'pins','[]'::jsonb)) loop
        if (pin->>'expiresAt')::double precision/1000 > extract(epoch from now()) then
          insert into public.location_pins(id,session_id,player_id,latitude,longitude,accuracy,created_at,expires_at) values((pin->>'id')::uuid,v_lobby_id,(pin->>'playerId')::uuid,(pin->>'latitude')::double precision,(pin->>'longitude')::double precision,(pin->>'accuracy')::double precision,to_timestamp((pin->>'createdAt')::double precision/1000),to_timestamp((pin->>'expiresAt')::double precision/1000)) on conflict(id) do nothing;
        end if;
      end loop;
    end if;
    for event in select value from jsonb_array_elements(coalesce(p_state->'events','[]'::jsonb)) loop
      if event->>'type' in ('capture','captured') then
        insert into public.capture_events(id,session_id,hunter_id,target_id,created_at) values((event->>'id')::uuid,v_lobby_id,(event->>'actorId')::uuid,(event->>'targetId')::uuid,to_timestamp((event->>'at')::double precision/1000)) on conflict(id) do nothing;
      elsif event->>'type' in ('infection','infected') then
        insert into public.infection_events(id,session_id,actor_id,target_id,created_at) values((event->>'id')::uuid,v_lobby_id,(event->>'actorId')::uuid,(event->>'targetId')::uuid,to_timestamp((event->>'at')::double precision/1000)) on conflict(id) do nothing;
      elsif event->>'type' in ('zone','zone_shrink','zone_warning','zone_elimination') then
        insert into public.zone_events(id,session_id,player_id,event_type,created_at) values((event->>'id')::uuid,v_lobby_id,(event->>'targetId')::uuid,event->>'type',to_timestamp((event->>'at')::double precision/1000)) on conflict(id) do nothing;
      end if;
    end loop;
  end if;
  if terminal then
    saved_state := jsonb_set(jsonb_set(p_state,'{players}',coalesce((select jsonb_agg(p - 'location' - 'captureCode') from jsonb_array_elements(p_state->'players') p),'[]'::jsonb)),'{pins}','[]'::jsonb);
    saved_state := jsonb_set(saved_state,'{captures}','[]'::jsonb);
  end if;
  insert into public.game_checkpoints(id,state,updated_at) values(v_lobby_id,saved_state,now()) on conflict(id) do update set state=excluded.state,updated_at=now();
end;
$$;

-- Run on backend startup and hourly. No external paid scheduler required.
create function public.cleanup_manhunt() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.location_pins where expires_at <= now();
  delete from public.game_checkpoints where updated_at < now()-interval '24 hours';
  delete from public.lobbies where status in ('waiting','closed') and updated_at < now()-interval '24 hours';
  update public.lobby_invites set status='expired' where status='pending' and expires_at<=now();
  delete from public.lobby_invites where expires_at<now()-interval '7 days';
  delete from public.notifications where created_at<now()-interval '30 days';
  delete from public.friend_requests where status<>'pending' and created_at<now()-interval '30 days';
  update public.friend_requests set status='rejected',responded_at=now() where status='pending' and created_at<now()-interval '30 days';
  delete from public.audit_logs where created_at<now()-interval '30 days';
end;
$$;

-- Erase account-associated checkpoint data before GoTrue deletes the auth user.
-- The backend must first leave/close the live in-memory lobby and serialize this
-- with checkpoint writes, so removed identities cannot be reintroduced.
create function public.delete_account(p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
declare row public.game_checkpoints; cleaned jsonb;
begin
  for row in select * from public.game_checkpoints where state::text like '%' || p_actor::text || '%' for update loop
    cleaned := row.state;
    cleaned := jsonb_set(cleaned,'{players}',coalesce((select jsonb_agg(p - 'location' - 'captureCode') from jsonb_array_elements(coalesce(cleaned->'players','[]'::jsonb)) p where p->>'id'<>p_actor::text),'[]'::jsonb));
    cleaned := jsonb_set(cleaned,'{pins}','[]'::jsonb);
    cleaned := jsonb_set(cleaned,'{events}','[]'::jsonb);
    cleaned := jsonb_set(cleaned,'{captures}','[]'::jsonb);
    if cleaned->'result' is not null then
      cleaned := jsonb_set(cleaned,'{result,survivors}',coalesce((select jsonb_agg(v) from jsonb_array_elements(coalesce(cleaned->'result'->'survivors','[]'::jsonb)) v where v#>>'{}'<>p_actor::text),'[]'::jsonb));
    end if;
    if cleaned->>'hostId'=p_actor::text then
      -- A deleted host's abandoned lobby cannot be recovered as an active game.
      delete from public.game_checkpoints where id=row.id;
      update public.lobbies set status='closed',updated_at=now() where id=row.id;
    else update public.game_checkpoints set state=cleaned where id=row.id; end if;
  end loop;
  update public.match_results set result=jsonb_set(result,'{survivors}',coalesce((select jsonb_agg(v) from jsonb_array_elements(coalesce(result->'survivors','[]'::jsonb)) v where v#>>'{}'<>p_actor::text),'[]'::jsonb)) where result->'survivors' ? p_actor::text;
  delete from public.notifications where payload->>'from'=p_actor::text;
  delete from public.audit_logs where actor_id=p_actor;
  -- Storage object deletion goes through Storage API before this call; do not
  -- delete storage.objects metadata directly (that would orphan object bytes).
end;
$$;
create function public.cleanup_expired_data() returns void language sql security definer set search_path = '' as $$ select public.cleanup_manhunt(); $$;

-- Revoke PostgreSQL's default public EXECUTE for every function defined above.
revoke all on function public.on_auth_user_created() from public,anon,authenticated;
revoke all on function public.lock_social_pair(uuid,uuid) from public,anon,authenticated;
revoke all on function public.is_blocked_pair(uuid,uuid) from public,anon,authenticated;
revoke all on function public.request_friend(uuid,text) from public,anon,authenticated;
revoke all on function public.respond_friend(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.remove_friend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.block_user(uuid,uuid) from public,anon,authenticated;
revoke all on function public.invite_friend(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.save_game_checkpoint(jsonb) from public,anon,authenticated;
revoke all on function public.cleanup_manhunt() from public,anon,authenticated;
revoke all on function public.delete_account(uuid) from public,anon,authenticated;
revoke all on function public.cleanup_expired_data() from public,anon,authenticated;
grant execute on function public.delete_account(uuid),public.cleanup_expired_data() to service_role;
grant execute on function public.request_friend(uuid,text),public.respond_friend(uuid,uuid,boolean),
  public.remove_friend(uuid,uuid),public.block_user(uuid,uuid),public.invite_friend(uuid,uuid,text),
  public.save_game_checkpoint(jsonb),public.cleanup_manhunt(),public.is_blocked_pair(uuid,uuid) to service_role;

-- Private avatars: never turn this bucket public. The API supplies expiring URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy manhunt_avatar_insert on storage.objects for insert to authenticated with check(
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and array_length(storage.foldername(name),1)=1
);
create policy manhunt_avatar_select_self on storage.objects for select to authenticated using(
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);
create policy manhunt_avatar_update on storage.objects for update to authenticated using(
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
) with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and array_length(storage.foldername(name),1)=1);
create policy manhunt_avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
