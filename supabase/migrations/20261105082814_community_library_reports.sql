begin;
create table public.saved_game_zones (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 60),zone jsonb not null check(jsonb_typeof(zone)='object'),
 settings jsonb check(settings is null or jsonb_typeof(settings)='object'),favorite boolean not null default false,
 tags text[] not null default '{}' check(cardinality(tags)<=5),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index saved_game_zones_owner on public.saved_game_zones(user_id,favorite,updated_at desc);
create table public.favorite_rule_sets (
 user_id uuid not null references auth.users(id) on delete cascade,preset_id uuid not null references public.presets(id) on delete cascade,
 primary key(user_id,preset_id)
);
create index favorite_rule_sets_preset on public.favorite_rule_sets(preset_id);
create table public.bug_reports (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in('gameplay','gps','map','account','other')),
 description text not null check(length(description) between 10 and 3000),build text not null check(length(build) between 1 and 40),
 match_id uuid references public.game_sessions(id) on delete set null,screenshot_path text,
 status text not null default 'new' check(status in('new','reviewing','resolved')),created_at timestamptz not null default now(),
 check(screenshot_path is null or screenshot_path ~ ('^'||user_id::text||'/[a-fA-F0-9-]{36}\.webp$'))
);
create index bug_reports_owner_created on public.bug_reports(user_id,created_at desc);
create index bug_reports_match on public.bug_reports(match_id);
create index bug_reports_status_created on public.bug_reports(status,created_at desc);

alter table public.saved_game_zones enable row level security;
alter table public.favorite_rule_sets enable row level security;
alter table public.bug_reports enable row level security;
revoke all on public.saved_game_zones,public.favorite_rule_sets,public.bug_reports from public,anon,authenticated;
grant all on public.saved_game_zones,public.favorite_rule_sets,public.bug_reports to service_role;
grant select on public.saved_game_zones,public.favorite_rule_sets,public.bug_reports to authenticated;
create policy saved_zones_owner on public.saved_game_zones for select to authenticated using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));
create policy favorite_rules_owner on public.favorite_rule_sets for select to authenticated using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));
create policy bug_reports_owner on public.bug_reports for select to authenticated using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));

create function public.save_library_zone(p_user uuid,p_id uuid,p_name text,p_zone jsonb,p_settings jsonb,p_favorite boolean,p_tags text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.saved_game_zones;
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('library:'||p_user::text,0));
 if exists(select 1 from public.saved_game_zones where id=p_id and user_id<>p_user) then raise exception 'not_available';end if;
 if not exists(select 1 from public.saved_game_zones where id=p_id) and (select count(*) from public.saved_game_zones where user_id=p_user)>=30 then raise exception 'zone_limit';end if;
 insert into public.saved_game_zones(id,user_id,name,zone,settings,favorite,tags)
 values(p_id,p_user,p_name,jsonb_set(p_zone,'{confirmed}','false'::jsonb),p_settings,p_favorite,p_tags)
 on conflict(id) do update set name=excluded.name,zone=excluded.zone,settings=excluded.settings,favorite=excluded.favorite,tags=excluded.tags,updated_at=now()
 where public.saved_game_zones.user_id=p_user returning * into saved;
 if not found then raise exception 'not_available';end if;
 return jsonb_build_object('id',saved.id,'name',saved.name,'zone',saved.zone,'settings',saved.settings,'favorite',saved.favorite,'tags',saved.tags,'createdAt',saved.created_at,'updatedAt',saved.updated_at);
end;$$;
create function public.set_rule_favorite(p_user uuid,p_preset uuid,p_favorite boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required';end if;
 if not exists(select 1 from public.presets where id=p_preset and user_id=p_user) then raise exception 'not_available';end if;
 if p_favorite then insert into public.favorite_rule_sets(user_id,preset_id) values(p_user,p_preset) on conflict do nothing;
 else delete from public.favorite_rule_sets where user_id=p_user and preset_id=p_preset;end if;
end;$$;
create function public.submit_bug_report(p_user uuid,p_id uuid,p_category text,p_description text,p_build text,p_match uuid,p_screenshot text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.bug_reports;
begin
 perform pg_advisory_xact_lock(hashtextextended('report:'||p_user::text,0));
 select * into saved from public.bug_reports where id=p_id;
 if found then
  if saved.user_id<>p_user then raise exception 'not_available';end if;
 else
  if (select count(*) from public.bug_reports where user_id=p_user and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'report_limit';end if;
  if p_match is not null and not exists(select 1 from public.game_participants where session_id=p_match and user_id=p_user) then raise exception 'match_forbidden';end if;
  insert into public.bug_reports(id,user_id,category,description,build,match_id,screenshot_path)
   values(p_id,p_user,p_category,p_description,p_build,p_match,p_screenshot) returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'category',saved.category,'description',saved.description,'build',saved.build,'matchId',saved.match_id,'status',saved.status,'createdAt',saved.created_at,'screenshot_path',saved.screenshot_path);
end;$$;
revoke all on function public.save_library_zone(uuid,uuid,text,jsonb,jsonb,boolean,text[]),public.set_rule_favorite(uuid,uuid,boolean),public.submit_bug_report(uuid,uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_library_zone(uuid,uuid,text,jsonb,jsonb,boolean,text[]),public.set_rule_favorite(uuid,uuid,boolean),public.submit_bug_report(uuid,uuid,text,text,text,uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bug-report-images','bug-report-images',false,2097152,array['image/webp']) on conflict(id) do nothing;
create policy report_image_insert on storage.objects for insert to authenticated with check(bucket_id='bug-report-images' and (storage.foldername(name))[1]=(select auth.uid())::text and array_length(storage.foldername(name),1)=1 and name ~ ('^'||(select auth.uid())::text||'/[a-fA-F0-9-]{36}\.webp$') and (select manhunt_private.account_usable(false)));
create policy report_image_read_self on storage.objects for select to authenticated using(bucket_id='bug-report-images' and (storage.foldername(name))[1]=(select auth.uid())::text and (select manhunt_private.account_usable(false)));
create policy report_image_delete_unattached on storage.objects for delete to authenticated using(bucket_id='bug-report-images' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.bug_reports r where r.user_id=(select auth.uid()) and r.screenshot_path=name) and (select manhunt_private.account_usable(false)));
commit;
