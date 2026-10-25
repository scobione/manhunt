-- Supabase owns pg_net and may restore PUBLIC grants. Never place a permanent
-- secret in its readable request queue. Dispatch tickets are single-use/30s.
create table public.push_dispatch_tickets (
 token_hash text primary key check(length(token_hash)=64), expires_at timestamptz not null
);
alter table public.push_dispatch_tickets enable row level security;
revoke all on public.push_dispatch_tickets from public,anon,authenticated;
grant all on public.push_dispatch_tickets to service_role;
create function public.issue_push_ticket() returns text language plpgsql security invoker set search_path='' as $$
declare ticket text=gen_random_uuid()::text;
begin
 delete from public.push_dispatch_tickets where expires_at<now();
 insert into public.push_dispatch_tickets values(encode(sha256(convert_to(ticket,'UTF8')),'hex'),now()+interval '30 seconds');
 return ticket;
end;
$$;
create function public.consume_push_ticket(p_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 delete from public.push_dispatch_tickets where token_hash=p_hash and expires_at>now();
 return found;
end;
$$;
revoke all on function public.issue_push_ticket(),public.consume_push_ticket(text) from public,anon,authenticated;
grant execute on function public.issue_push_ticket(),public.consume_push_ticket(text) to service_role;
-- Retire the former dispatch secret without disclosing it.
update public.push_config set dispatch_secret=gen_random_uuid()::text;
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_net') and exists(select 1 from pg_available_extensions where name='pg_cron') then
  execute $cron$select cron.schedule('manhunt-web-push','10 seconds',$job$
   select net.http_post(url:=c.dispatch_url,headers:=jsonb_build_object('Content-Type','application/json','x-manhunt-push-ticket',public.issue_push_ticket()),body:='{}'::jsonb,timeout_milliseconds:=20000)
   from public.push_config c where c.id=1 and exists(
    select 1 from public.push_jobs j where j.status in ('pending','sending') and j.due_at<=now() and j.available_at<=now() and j.expires_at>now()
     and j.attempts<5 and (j.locked_until is null or j.locked_until<now()) and exists(select 1 from public.push_subscriptions s where s.user_id=j.user_id)
   );
  $job$)$cron$;
 end if;
end $$;
