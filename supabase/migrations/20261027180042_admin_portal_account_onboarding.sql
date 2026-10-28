-- Account administration is a service-only capability. Existing users and matches
-- are retained; no user-editable metadata is used for permissions.
create schema if not exists manhunt_private;
revoke all on schema manhunt_private from public,anon;
grant usage on schema manhunt_private to authenticated,service_role;

create table public.account_controls (
 user_id uuid primary key references auth.users(id) on delete cascade,
 is_admin boolean not null default false,
 disabled boolean not null default false,
 setup_stage smallint not null default 3 check(setup_stage between 0 and 3),
 source text not null default 'self' check(source in ('self','admin','legacy')),
 created_by uuid references auth.users(id) on delete set null,
 admin_approved_at timestamptz,
 email_verified_at timestamptz,
 temporary_password_hash text,
 setup_lock uuid,
 setup_lock_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index account_controls_creator on public.account_controls(created_by) where created_by is not null;
insert into public.account_controls(user_id,source,email_verified_at)
select id,'legacy',email_confirmed_at from auth.users;

create table public.admin_security (
 id smallint primary key check(id=1),
 code_hash text,
 code_salt text,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.admin_security(id) values(1);
create table public.admin_sessions (
 token_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 auth_session_id uuid not null,
 security_revision bigint not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index admin_sessions_user on public.admin_sessions(user_id);
create index admin_sessions_expiry on public.admin_sessions(expires_at);
do $$ declare t text; begin
 foreach t in array array['account_controls','admin_security','admin_sessions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

-- Existing 21–24-character names stay valid; all newly chosen names are limited
-- to 20 by the APIs. The unique lower(username) index remains authoritative.
alter table public.profiles drop constraint profiles_username_check;
alter table public.profiles add constraint profiles_username_check check(username ~ '^[A-Za-z0-9_.]{3,24}$');
create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare candidate text; picture text; manual boolean; guest boolean;
begin
 manual := coalesce(new.raw_app_meta_data->>'manhunt_provisioning','')='admin';
 guest := coalesce(new.is_anonymous,false);
 candidate := new.raw_user_meta_data->>'username';
 if guest or manual or candidate is null or candidate !~ '^[A-Za-z0-9_.]{3,20}$' then
  candidate := 'player_' || substr(replace(new.id::text,'-',''),1,12);
 end if;
 picture := new.raw_user_meta_data->>'avatar_url';
 if picture !~ '^https://' or length(picture)>2048 then picture:=null; end if;
 insert into public.profiles(id,username,avatar_url) values(new.id,candidate,picture);
 insert into public.account_controls(user_id,source,setup_stage,admin_approved_at,email_verified_at,temporary_password_hash)
 values(new.id,case when manual then 'admin' else 'self' end,
  case when manual then 0 when guest or (new.raw_user_meta_data->>'username') ~ '^[A-Za-z0-9_.]{3,20}$' then 3 else 1 end,
  case when manual then now() end,case when not manual then new.email_confirmed_at end,
  case when manual then new.raw_app_meta_data->>'manhunt_temporary_password_hash' end);
 return new;
end $$;
revoke all on function public.on_auth_user_created() from public,anon,authenticated;

-- Guards supplement existing ownership policies; they do not grant new rows.
create function manhunt_private.account_usable(p_setup boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.sessions s
  where s.user_id=(select auth.uid()) and s.id::text=(select auth.jwt()->>'session_id') and (s.not_after is null or s.not_after>now())) and exists(
  select 1 from public.account_controls c where c.user_id=(select auth.uid())
   and not c.disabled and (c.setup_stage=3 or p_setup and c.setup_stage=2)
 );
$$;
revoke all on function manhunt_private.account_usable(boolean) from public,anon;
grant execute on function manhunt_private.account_usable(boolean) to authenticated,service_role;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy account_access_guard on public.%I as restrictive for all to authenticated using ((select manhunt_private.account_usable(false))) with check ((select manhunt_private.account_usable(false)))',t.tablename);
 end loop;
end $$;
create policy manhunt_account_access_guard on storage.objects as restrictive for all to authenticated
 using (bucket_id<>'avatars' or (select manhunt_private.account_usable(true)))
 with check (bucket_id<>'avatars' or (select manhunt_private.account_usable(true)));

create function manhunt_private.session_live(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now()));
$$;
revoke all on function manhunt_private.session_live(uuid,uuid) from public,anon,authenticated;
grant execute on function manhunt_private.session_live(uuid,uuid) to service_role;
create function public.account_session_live(p_user uuid,p_session uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select manhunt_private.session_live(p_user,p_session);
$$;
revoke all on function public.account_session_live(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_session_live(uuid,uuid) to service_role;

create function public.account_username_available(p_name text,p_except uuid default null) returns boolean
language sql stable security invoker set search_path='' as $$
 select p_name ~ '^[A-Za-z0-9_.]{3,20}$' and not exists(select 1 from public.profiles where lower(username)=lower(p_name) and (p_except is null or id<>p_except));
$$;
revoke all on function public.account_username_available(text,uuid) from public,anon,authenticated;
grant execute on function public.account_username_available(text,uuid) to service_role;

-- Atomic state transitions: a browser cannot claim it changed a password.
create function public.account_setup_step(p_user uuid,p_stage int,p_name text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.account_controls;
begin
 select * into c from public.account_controls where user_id=p_user for update;
 if not found or c.disabled or c.setup_stage<>p_stage or p_stage not in (1,2) then raise exception 'invalid_setup_step'; end if;
 if p_stage=1 then
  if p_name is null or p_name !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'invalid_username'; end if;
  update public.profiles set username=p_name where id=p_user;
 end if;
 update public.account_controls set setup_stage=p_stage+1,updated_at=now() where user_id=p_user;
end $$;
revoke all on function public.account_setup_step(uuid,int,text) from public,anon,authenticated;
grant execute on function public.account_setup_step(uuid,int,text) to service_role;

create function manhunt_private.account_directory(p_actor uuid,p_session uuid,p_search text,p_status text,p_page int,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not manhunt_private.session_live(p_actor,p_session) or not exists(select 1 from public.account_controls where user_id=p_actor and is_admin and not disabled and setup_stage=3) then raise exception 'admin_required'; end if;
 with accounts as (
  select u.id,u.email,p.username,p.avatar_url,u.created_at,u.last_sign_in_at,
   case when c.is_admin then 'administrator' else 'player' end as role,
   c.setup_stage,c.source,c.admin_approved_at,
   case when c.source='admin' then c.email_verified_at else u.email_confirmed_at end as email_verified_at,
   case when c.disabled or u.banned_until>now() then 'disabled'
    when u.email_confirmed_at is null then 'email_pending'
    when c.setup_stage<3 then 'setup_pending' else 'active' end as status
  from auth.users u join public.profiles p on p.id=u.id join public.account_controls c on c.user_id=u.id
  where not coalesce(u.is_anonymous,false)
 ), filtered as (
  select * from accounts where (p_id is null or id=p_id) and
   (coalesce(p_status,'')='' or status=p_status) and
   (coalesce(p_search,'')='' or position(lower(p_search) in lower(coalesce(email,'')||' '||username))>0)
 ), page as (select * from filtered order by created_at desc,id limit 30 offset greatest(0,least(p_page,10000))*30)
 select jsonb_build_object(
  'counts',(select jsonb_build_object('total',count(*),'active',count(*) filter(where status='active'),'email_pending',count(*) filter(where status='email_pending'),'setup_pending',count(*) filter(where status='setup_pending'),'disabled',count(*) filter(where status='disabled')) from accounts),
  'users',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),'page',greatest(0,least(p_page,10000))) into result;
 return result;
end $$;
revoke all on function manhunt_private.account_directory(uuid,uuid,text,text,int,uuid) from public,anon,authenticated;
grant execute on function manhunt_private.account_directory(uuid,uuid,text,text,int,uuid) to service_role;
create function public.admin_account_directory(p_actor uuid,p_session uuid,p_search text default '',p_status text default '',p_page int default 0,p_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select manhunt_private.account_directory(p_actor,p_session,p_search,p_status,p_page,p_id);
$$;
revoke all on function public.admin_account_directory(uuid,uuid,text,text,int,uuid) from public,anon,authenticated;
grant execute on function public.admin_account_directory(uuid,uuid,text,text,int,uuid) to service_role;

create function public.admin_change_code(p_hash text,p_salt text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.admin_security set code_hash=p_hash,code_salt=p_salt,revision=revision+1,updated_at=now() where id=1;
 delete from public.admin_sessions;
end $$;
revoke all on function public.admin_change_code(text,text) from public,anon,authenticated;
grant execute on function public.admin_change_code(text,text) to service_role;
