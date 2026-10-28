-- Additive account reset state. Preserve the completed profile and original
-- mailbox-verification status; no account is confirmed or reactivated here.
alter table public.account_controls
 add column password_return_stage smallint not null default 1 check(password_return_stage between 1 and 3),
 add column password_reset_pending boolean not null default false;

create function manhunt_private.begin_password_reset(p_actor uuid,p_session uuid,p_target uuid,p_lock uuid,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.account_controls;
begin
 if not manhunt_private.session_live(p_actor,p_session) or not exists(select 1 from public.account_controls where user_id=p_actor and is_admin and not disabled and setup_stage=3) then raise exception 'admin_required'; end if;
 select * into c from public.account_controls where user_id=p_target for update;
 if not found or p_actor=p_target or c.is_admin or exists(select 1 from auth.users where id=p_target and is_anonymous) then raise exception 'reset_target_not_allowed'; end if;
 if c.setup_lock is not null and c.setup_lock_until>now() then raise exception 'password_operation_busy'; end if;
 if p_lock is null or p_hash is null or p_hash !~ '^pbkdf2\$[a-f0-9]{48}\$[a-f0-9]{64}$' then raise exception 'invalid_password_hash'; end if;
 update public.account_controls set
  password_return_stage=case when setup_stage=0 then password_return_stage else setup_stage end,
  setup_stage=0,password_reset_pending=true,temporary_password_hash=p_hash,
  setup_lock=p_lock,setup_lock_until=now()+interval '2 minutes',updated_at=now() where user_id=p_target;
 -- Revoke refresh grants and actual sessions. JWTs from these sessions are
 -- rejected immediately by both the game API and the existing RLS guard.
 delete from auth.refresh_tokens where user_id=p_target::text;
 delete from auth.sessions where user_id=p_target;
 delete from public.admin_sessions where user_id=p_target;
 insert into public.audit_logs(actor_id,action,metadata) values(p_actor,'admin.temporary_password_started',jsonb_build_object('targetId',p_target));
end $$;
revoke all on function manhunt_private.begin_password_reset(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function manhunt_private.begin_password_reset(uuid,uuid,uuid,uuid,text) to service_role;
create function public.admin_begin_password_reset(p_actor uuid,p_session uuid,p_target uuid,p_lock uuid,p_hash text)
returns void language sql security invoker set search_path='' as $$select manhunt_private.begin_password_reset(p_actor,p_session,p_target,p_lock,p_hash);$$;
revoke all on function public.admin_begin_password_reset(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_begin_password_reset(uuid,uuid,uuid,uuid,text) to service_role;

create function manhunt_private.finish_password_reset(p_actor uuid,p_session uuid,p_target uuid,p_lock uuid,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not manhunt_private.session_live(p_actor,p_session) or not exists(select 1 from public.account_controls where user_id=p_actor and is_admin and not disabled and setup_stage=3) then raise exception 'admin_required'; end if;
 perform 1 from public.account_controls where user_id=p_target and setup_lock=p_lock and password_reset_pending and not is_admin and user_id<>p_actor for update;
 if not found then raise exception 'password_operation_busy'; end if;
 -- Also revoke any login that happened while the external Auth API was working.
 delete from auth.refresh_tokens where user_id=p_target::text;
 delete from auth.sessions where user_id=p_target;
 delete from public.admin_sessions where user_id=p_target;
 update public.account_controls set setup_lock=null,setup_lock_until=null,
  password_reset_pending=not coalesce(p_success,false),updated_at=now() where user_id=p_target;
 if not coalesce(p_success,false) then insert into public.audit_logs(actor_id,action,metadata) values(p_actor,'admin.temporary_password_failed',jsonb_build_object('targetId',p_target)); end if;
 -- On an Auth API failure keep the account behind its mandatory password gate.
 -- An administrator may retry; the user cannot complete setup during a partial reset.
end $$;
revoke all on function manhunt_private.finish_password_reset(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function manhunt_private.finish_password_reset(uuid,uuid,uuid,uuid,boolean) to service_role;
create function public.admin_finish_password_reset(p_actor uuid,p_session uuid,p_target uuid,p_lock uuid,p_success boolean)
returns void language sql security invoker set search_path='' as $$select manhunt_private.finish_password_reset(p_actor,p_session,p_target,p_lock,p_success);$$;
revoke all on function public.admin_finish_password_reset(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_finish_password_reset(uuid,uuid,uuid,uuid,boolean) to service_role;

create function public.account_finish_password(p_user uuid,p_lock uuid,p_success boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.account_controls set setup_lock=null,setup_lock_until=null,
  setup_stage=case when p_success then password_return_stage else setup_stage end,
  temporary_password_hash=case when p_success then null else temporary_password_hash end,updated_at=now()
 where user_id=p_user and setup_lock=p_lock and setup_stage=0 and not password_reset_pending;
 if not found then raise exception 'password_operation_busy'; end if;
end $$;
revoke all on function public.account_finish_password(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.account_finish_password(uuid,uuid,boolean) to service_role;
