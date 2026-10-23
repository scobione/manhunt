-- Server-only coordination for stateless Supabase Edge Functions. No GPS or
-- capture codes are sent through Realtime or directly readable client tables.
create table public.edge_runtime (
  id smallint primary key check (id=1),
  revision bigint not null default 0,
  social_revision bigint not null default 0
);
insert into public.edge_runtime(id) values(1);
create table public.edge_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index edge_presence_seen on public.edge_presence(seen_at);
create table public.edge_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check(length(scope)<=30),
  bucket bigint not null,
  used integer not null,
  primary key(user_id,scope)
);
create index edge_quotas_bucket on public.edge_quotas(bucket);
alter table public.edge_runtime enable row level security;
alter table public.edge_presence enable row level security;
alter table public.edge_quotas enable row level security;
revoke all on public.edge_runtime,public.edge_presence,public.edge_quotas from public,anon,authenticated;
grant all on public.edge_runtime,public.edge_presence,public.edge_quotas to service_role;

-- Any checkpoint writer (including account erasure/cleanup) invalidates stale
-- edge snapshots. This also prevents a concurrent request resurrecting a kick.
create function public.edge_checkpoint_changed() returns trigger language plpgsql set search_path='' as $$
begin update public.edge_runtime set revision=revision+1 where id=1; return null; end;
$$;
create trigger edge_checkpoint_revision after insert or update or delete on public.game_checkpoints for each statement execute function public.edge_checkpoint_changed();
create function public.edge_social_changed() returns trigger language plpgsql set search_path='' as $$
begin update public.edge_runtime set social_revision=social_revision+1 where id=1; return null; end;
$$;
create trigger edge_social_profiles after insert or update or delete on public.profiles for each statement execute function public.edge_social_changed();
create trigger edge_social_friends after insert or update or delete on public.friendships for each statement execute function public.edge_social_changed();
create trigger edge_social_requests after insert or update or delete on public.friend_requests for each statement execute function public.edge_social_changed();
create trigger edge_social_blocks after insert or update or delete on public.blocked_users for each statement execute function public.edge_social_changed();
create trigger edge_social_notices after insert or update or delete on public.notifications for each statement execute function public.edge_social_changed();

create function public.edge_snapshot() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'revision',r.revision,'socialRevision',r.social_revision,
  'now',floor(extract(epoch from statement_timestamp())*1000),
  'lobbies',coalesce((select jsonb_agg(c.state) from public.game_checkpoints c),'[]'::jsonb),
  'presence',coalesce((select jsonb_object_agg(p.user_id::text,floor(extract(epoch from p.seen_at)*1000)) from public.edge_presence p),'{}'::jsonb)
 ) from public.edge_runtime r where r.id=1;
$$;
create function public.edge_commit(p_revision bigint,p_states jsonb,p_audit jsonb default null) returns boolean language plpgsql set search_path='' as $$
declare item jsonb;
begin
 if jsonb_typeof(p_states)<>'array' or jsonb_array_length(p_states)>1000 then raise exception 'Invalid snapshot'; end if;
 update public.edge_runtime set revision=revision+1 where id=1 and revision=p_revision;
 if not found then return false; end if;
 for item in select value from jsonb_array_elements(p_states) loop
   perform public.save_game_checkpoint(item);
 end loop;
 if p_audit is not null then
   insert into public.audit_logs(actor_id,action,metadata) values((p_audit->>'actorId')::uuid,p_audit->>'action',jsonb_build_object('lobbyId',p_audit->>'lobbyId'));
 end if;
 return true;
end;
$$;
create function public.edge_touch(p_user uuid) returns void language sql set search_path='' as $$
 insert into public.edge_presence(user_id,seen_at) values(p_user,clock_timestamp()) on conflict(user_id) do update set seen_at=excluded.seen_at;
$$;
create function public.edge_quota(p_user uuid,p_scope text,p_limit integer) returns boolean language plpgsql set search_path='' as $$
declare current_bucket bigint=floor(extract(epoch from clock_timestamp())/60); count_used integer;
begin
 if p_limit<1 or p_limit>1000 then raise exception 'Invalid quota'; end if;
 insert into public.edge_quotas(user_id,scope,bucket,used) values(p_user,p_scope,current_bucket,1)
 on conflict(user_id,scope) do update set bucket=current_bucket,used=case when edge_quotas.bucket=current_bucket then edge_quotas.used+1 else 1 end
 returning used into count_used;
 return count_used<=p_limit;
end;
$$;
create function public.edge_cleanup() returns void language sql set search_path='' as $$
 delete from public.edge_quotas where bucket<floor(extract(epoch from now())/60)-60;
 delete from public.edge_presence where seen_at<now()-interval '24 hours';
$$;
revoke all on function public.edge_checkpoint_changed(),public.edge_social_changed(),public.edge_snapshot(),public.edge_commit(bigint,jsonb,jsonb),public.edge_touch(uuid),public.edge_quota(uuid,text,integer),public.edge_cleanup() from public,anon,authenticated;
grant execute on function public.edge_snapshot(),public.edge_commit(bigint,jsonb,jsonb),public.edge_touch(uuid),public.edge_quota(uuid,text,integer),public.edge_cleanup() to service_role;

-- Supabase includes pg_cron at no additional charge. The isolated WASM SQL
-- test environment does not ship this optional extension.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
   execute 'create extension if not exists pg_cron';
   execute $cron$select cron.schedule('manhunt-retention','17 * * * *','select public.cleanup_expired_data(); select public.edge_cleanup();')$cron$;
 end if;
end $$;
