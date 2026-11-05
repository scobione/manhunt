begin;
create table public.profile_customization (
 user_id uuid primary key references auth.users(id) on delete cascade,
 color text not null default 'violet' check(color in('violet','mint','ocean','amber','rose','slate')),
 banner_path text,
 badge_order text[] not null default '{}'::text[] check(cardinality(badge_order)<=100),
 updated_at timestamptz not null default now()
);
alter table public.profile_customization enable row level security;
revoke all on public.profile_customization from public,anon,authenticated;
grant select on public.profile_customization to authenticated;
grant all on public.profile_customization to service_role;
create policy profile_customization_read on public.profile_customization for select to authenticated
 using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));

create function public.read_profile_customization(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('color',coalesce(c.color,'violet'),'bannerPath',c.banner_path,'badgeOrder',coalesce(to_jsonb(c.badge_order),'[]'::jsonb))
 from (select 1) seed left join public.profile_customization c on c.user_id=p_user;
$$;
create function public.save_profile_customization(p_user uuid,p_color text default null,p_banner_path text default null,p_update_banner boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required'; end if;
 if p_color is not null and p_color not in('violet','mint','ocean','amber','rose','slate') then raise exception 'invalid_profile_customization'; end if;
 if p_update_banner and p_banner_path is not null and (split_part(p_banner_path,'/',1)<>p_user::text or p_banner_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(webp|png|jpg|jpeg)$') then raise exception 'invalid_profile_customization'; end if;
 insert into public.profile_customization(user_id,color,banner_path) values(p_user,coalesce(p_color,'violet'),case when p_update_banner then p_banner_path else null end)
 on conflict(user_id) do update set color=coalesce(p_color,public.profile_customization.color),banner_path=case when p_update_banner then p_banner_path else public.profile_customization.banner_path end,updated_at=now();
 return public.read_profile_customization(p_user);
end;
$$;
create function public.order_profile_badges(p_user uuid,p_badges text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required'; end if;
 if p_badges is null or cardinality(p_badges)>100 or cardinality(p_badges)<>(select count(distinct b) from unnest(p_badges) b)
 or exists(select 1 from unnest(p_badges) b where b is null or not exists(select 1 from public.player_badges p where p.user_id=p_user and p.badge_id=b and p.level>0)) then raise exception 'badge_order_invalid'; end if;
 insert into public.profile_customization(user_id,badge_order) values(p_user,p_badges)
 on conflict(user_id) do update set badge_order=excluded.badge_order,updated_at=now();
 return public.read_profile_customization(p_user);
end;
$$;
revoke all on function public.read_profile_customization(uuid) from public,anon,authenticated;
revoke all on function public.save_profile_customization(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.order_profile_badges(uuid,text[]) from public,anon,authenticated;
grant execute on function public.read_profile_customization(uuid) to service_role;
grant execute on function public.save_profile_customization(uuid,text,text,boolean) to service_role;
grant execute on function public.order_profile_badges(uuid,text[]) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-banners','profile-banners',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy profile_banner_insert on storage.objects for insert to authenticated with check(
 bucket_id='profile-banners' and (storage.foldername(name))[1]=(select auth.uid())::text and array_length(storage.foldername(name),1)=1 and (select manhunt_private.account_usable(false))
);
create policy profile_banner_select on storage.objects for select to authenticated using(
 bucket_id='profile-banners' and (storage.foldername(name))[1]=(select auth.uid())::text and (select manhunt_private.account_usable(false))
);
create policy profile_banner_delete on storage.objects for delete to authenticated using(
 bucket_id='profile-banners' and (storage.foldername(name))[1]=(select auth.uid())::text and (select manhunt_private.account_usable(false))
);
commit;
