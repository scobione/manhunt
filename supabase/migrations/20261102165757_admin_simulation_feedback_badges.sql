begin;

-- Simulations never use game_checkpoints: their engine state cannot reach the
-- live match, statistics, push or reward triggers, even when it finishes.
create table public.admin_simulations (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 0, state jsonb not null check(jsonb_typeof(state)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours'
);
create unique index admin_simulations_owner on public.admin_simulations(owner_id);
create index admin_simulations_expiry on public.admin_simulations(expires_at);

create function public.valid_badge_definition(d jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
 select jsonb_typeof(d->'thresholds')='array' and jsonb_typeof(d->'stageNames')='array'
 and d->>'metric' in('feedback','captures','hiderWins','games','huntPoints')
 and jsonb_array_length(d->'thresholds')=case when d->>'metric'='feedback' then 1 else 10 end
 and jsonb_array_length(d->'stageNames')=jsonb_array_length(d->'thresholds')
 and not exists(select 1 from jsonb_array_elements_text(d->'thresholds') with ordinality t(v,n)
   where v !~ '^[1-9][0-9]{0,8}$' or (n>1 and v::bigint <= (d->'thresholds'->>(n::int-2))::bigint));
$$;
create table public.badge_definitions (
 id text primary key, definition jsonb not null check(public.valid_badge_definition(definition) and definition->>'id'=id),
 updated_at timestamptz not null default now()
);
create table public.achievement_counters (
 user_id uuid primary key references auth.users(id) on delete cascade,
 captures bigint not null default 0 check(captures>=0), hider_wins bigint not null default 0 check(hider_wins>=0),
 games bigint not null default 0 check(games>=0), hunt_points bigint not null default 0 check(hunt_points>=0),
 feedback bigint not null default 0 check(feedback>=0)
);
create table public.player_badges (
 user_id uuid not null references auth.users(id) on delete cascade,
 badge_id text not null references public.badge_definitions(id), level integer not null check(level between 1 and 10),
 unlocked_at timestamptz not null default now(), upgraded_at timestamptz not null default now(),
 primary key(user_id,badge_id)
);
create index player_badges_definition on public.player_badges(badge_id,level);
create table public.badge_equipped (
 user_id uuid primary key references auth.users(id) on delete cascade,
 badge_id text not null, foreign key(user_id,badge_id) references public.player_badges(user_id,badge_id) on delete cascade
);
create table public.badge_notices (
 id uuid primary key default extensions.gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 badge_id text not null references public.badge_definitions(id), level integer not null check(level between 1 and 10),
 created_at timestamptz not null default now(), seen_at timestamptz,
 unique(user_id,badge_id,level)
);
create index badge_notices_definition on public.badge_notices(badge_id);
create table public.feature_match_events (
 match_id uuid primary key, created_at timestamptz not null default now()
);
create table public.badge_match_awards (
 match_id uuid not null references public.feature_match_events(match_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 captures integer not null, hider_win boolean not null, hunt_points integer not null,
 primary key(match_id,user_id)
);
create index badge_match_awards_user on public.badge_match_awards(user_id);
create table public.feedback_questionnaires (
 version bigint generated always as identity primary key,
 questions jsonb not null check(jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 2 and 20),
 created_at timestamptz not null default now()
);
create table public.feedback_settings (
 id integer primary key check(id=1), version bigint not null references public.feedback_questionnaires(version),
 introduced_at timestamptz not null default now()
);
create index feedback_settings_version on public.feedback_settings(version);
create table public.feedback_offers (
 id uuid primary key default extensions.gen_random_uuid(), match_id uuid not null references public.feature_match_events(match_id),
 user_id uuid not null references auth.users(id) on delete cascade,
 version bigint not null references public.feedback_questionnaires(version), questions jsonb not null,
 modes text[] not null, status text not null default 'offered' check(status in('offered','completed','skipped')),
 offered_at timestamptz not null default now(), answered_at timestamptz,
 unique(match_id,user_id)
);
create index feedback_offers_user on public.feedback_offers(user_id,offered_at desc);
create index feedback_offers_version on public.feedback_offers(version);
create index feedback_offers_time on public.feedback_offers(offered_at desc);
create index feedback_offers_modes on public.feedback_offers using gin(modes);
create table public.feedback_answers (
 offer_id uuid primary key references public.feedback_offers(id) on delete cascade,
 answers jsonb not null check(jsonb_typeof(answers)='object'), overall integer check(overall between 1 and 5),
 recommendation text, created_at timestamptz not null default now()
);

insert into public.badge_definitions(id,definition) values('beta-tester','{"id":"beta-tester","name":"Beta-Tester","description":"Sende einen vollständigen Fragebogen ab. Positive und negative Bewertungen zählen gleichermaßen.","icon":"flask","metric":"feedback","thresholds":[1],"stageNames":["Beta-Tester"],"unit":"Feedback"}'::jsonb);
insert into public.badge_definitions(id,definition) values('hunter','{"id":"hunter","name":"Hunter","description":"Fange Spieler in gültig abgeschlossenen Matches.","icon":"hunter","metric":"captures","thresholds":[1,20,50,100,200,350,550,800,1200,2000],"stageNames":["Erster Fang","Spurenleser","Verfolger","Jäger","Pro Hunter","Fährtenmeister","Nachtjäger","Elite Hunter","Meisterjäger","Ultimate Hunter"],"unit":"Fänge"}'::jsonb);
insert into public.badge_definitions(id,definition) values('hider','{"id":"hider","name":"Hider","description":"Gewinne als überlebender Hider gültig abgeschlossene Matches.","icon":"shield","metric":"hiderWins","thresholds":[1,5,10,20,35,55,80,120,175,250],"stageNames":["Entkommen","Unentdeckt","Leise Schritte","Schatten","Pro Hider","Phantom","Unsichtbar","Elite Hider","Schattenmeister","Ultimate Hider"],"unit":"Hider-Siege"}'::jsonb);
insert into public.badge_definitions(id,definition) values('veteran','{"id":"veteran","name":"Veteran","description":"Spiele gültige Matches bis zum Ende mit.","icon":"trophy","metric":"games","thresholds":[1,5,10,20,35,50,75,100,150,250],"stageNames":["Debüt","Wieder dabei","Erfahren","Stammspieler","Ausdauernd","Veteran","Routinier","Feldprofi","Legende","Manhunt X"],"unit":"Matches"}'::jsonb);
insert into public.badge_definitions(id,definition) values('xp-scout','{"id":"xp-scout","name":"XP-Scout","description":"Sammle XP-Jagd-Punkte in gültig abgeschlossenen Matches. Account-XP zählen hierfür nicht.","icon":"pin","metric":"huntPoints","thresholds":[1,10,25,50,100,175,275,400,600,1000],"stageNames":["Erster Punkt","Entdecker","Pfadfinder","Sammler","Scout","Navigator","Zielsicher","Wegmeister","Elite Scout","Ultimate Scout"],"unit":"XP-Jagd-Punkte"}'::jsonb);
insert into public.feedback_questionnaires(questions) values('[{"id":"overall","label":"Wie hat dir das Spiel insgesamt gefallen?","type":"rating","required":true,"feature":"all"},{"id":"location","label":"Wie zuverlässig haben Karte und Standort funktioniert?","type":"rating","required":true,"feature":"all"},{"id":"clarity","label":"Wie verständlich waren Rollen, Regeln und Spielablauf?","type":"rating","required":true,"feature":"all"},{"id":"zombie","label":"Wie gut haben Infektion und Teamwechsel funktioniert?","type":"rating","required":true,"feature":"zombie"},{"id":"apocalypse","label":"Wie gut haben Schrumpfzonen und Zonenwarnungen funktioniert?","type":"rating","required":true,"feature":"apocalypse"},{"id":"xpHunt","label":"Wie gut haben XP-Punkte und das Einsammeln funktioniert?","type":"rating","required":true,"feature":"xpHunt"},{"id":"design","label":"Wie findest du Bedienung und Design?","type":"rating","required":true,"feature":"all"},{"id":"improve","label":"Was sollten wir verbessern?","type":"choices","required":false,"feature":"all","options":["Karte","Spielmodi","Rollen","Standort","Bedienung","Stabilität"]},{"id":"recommend","label":"Würdest du das Spiel weiterempfehlen?","type":"recommendation","required":true,"feature":"all","options":["Ja","Vielleicht","Nein"]},{"id":"notes","label":"Möchtest du uns noch etwas mitteilen?","type":"text","required":false,"feature":"all"}]'::jsonb);
insert into public.feedback_settings(id,version) select 1,max(version) from public.feedback_questionnaires;

-- Auth's tables are intentionally not readable by service_role. Expose only
-- the one eligibility bit required here, in the existing private schema.
create function manhunt_private.feature_user_registered(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not coalesce(is_anonymous,false) from auth.users where id=p_user
 and ((select auth.uid()) is null or (select auth.uid())=p_user
 or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role');
$$;
revoke all on function manhunt_private.feature_user_registered(uuid) from public,anon,authenticated;
grant execute on function manhunt_private.feature_user_registered(uuid) to service_role;

create function public.refresh_player_badges(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c public.achievement_counters; d public.badge_definitions; n bigint; tier integer; previous integer;
begin
 select * into c from public.achievement_counters where user_id=p_user for update;
 if not found or not coalesce(manhunt_private.feature_user_registered(p_user),false) then return; end if;
 for d in select * from public.badge_definitions order by id loop
  n:=case d.definition->>'metric' when 'feedback' then c.feedback when 'captures' then c.captures when 'hiderWins' then c.hider_wins when 'games' then c.games when 'huntPoints' then c.hunt_points else 0 end;
  select count(*) into tier from jsonb_array_elements_text(d.definition->'thresholds') threshold where threshold::bigint<=n;
  select level into previous from public.player_badges where user_id=p_user and badge_id=d.id;
  if tier>coalesce(previous,0) then
   insert into public.player_badges(user_id,badge_id,level) values(p_user,d.id,tier)
    on conflict(user_id,badge_id) do update set level=excluded.level,upgraded_at=now();
   insert into public.badge_notices(user_id,badge_id,level) values(p_user,d.id,tier) on conflict do nothing;
  end if;
 end loop;
end;
$$;
create function public.read_player_badges(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('registered',coalesce(manhunt_private.feature_user_registered(p_user),false),
 'badges',coalesce((select jsonb_agg(d.definition || jsonb_build_object(
   'level',coalesce(b.level,0),'unlockedAt',b.unlocked_at,'upgradedAt',b.upgraded_at,
   'progress',coalesce(case d.definition->>'metric' when 'feedback' then c.feedback when 'captures' then c.captures when 'hiderWins' then c.hider_wins when 'games' then c.games when 'huntPoints' then c.hunt_points end,0)) order by d.id)
   from public.badge_definitions d left join public.player_badges b on b.badge_id=d.id and b.user_id=p_user
   left join public.achievement_counters c on c.user_id=p_user),'[]'::jsonb),
 'selected',(select jsonb_build_object('id',d.id,'name',d.definition->>'name','icon',d.definition->>'icon','level',b.level,'stageName',d.definition->'stageNames'->>(b.level-1))
   from public.badge_equipped e join public.player_badges b on b.user_id=e.user_id and b.badge_id=e.badge_id join public.badge_definitions d on d.id=e.badge_id where e.user_id=p_user),
 'notices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'badgeId',n.badge_id,'name',d.definition->>'name','level',n.level,'at',n.created_at) order by n.created_at)
   from public.badge_notices n join public.badge_definitions d on d.id=n.badge_id where n.user_id=p_user and n.seen_at is null),'[]'::jsonb));
$$;
create function public.choose_profile_badge(p_user uuid,p_badge text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(manhunt_private.feature_user_registered(p_user),false) then raise exception 'registered_required'; end if;
 if p_badge is null then delete from public.badge_equipped where user_id=p_user;
 else
  if not exists(select 1 from public.player_badges where user_id=p_user and badge_id=p_badge) then raise exception 'badge_locked'; end if;
  insert into public.badge_equipped(user_id,badge_id) values(p_user,p_badge) on conflict(user_id) do update set badge_id=excluded.badge_id;
 end if;
 return public.read_player_badges(p_user);
end;
$$;
create function public.respond_game_feedback(p_user uuid,p_offer uuid,p_skip boolean,p_answers jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.feedback_offers;
begin
 select * into o from public.feedback_offers where id=p_offer and user_id=p_user for update;
 if not found then raise exception 'feedback_not_found'; end if;
 if o.status='completed' and not p_skip then return public.read_player_badges(p_user); end if;
 if o.status='skipped' and p_skip then return public.read_player_badges(p_user); end if;
 if o.status<>'offered' then raise exception 'feedback_closed'; end if;
 if p_skip then update public.feedback_offers set status='skipped',answered_at=now() where id=o.id;
 else
  insert into public.feedback_answers(offer_id,answers,overall,recommendation) values(o.id,p_answers,(p_answers->'overall'->>'rating')::integer,p_answers->>'recommend');
  update public.feedback_offers set status='completed',answered_at=now() where id=o.id;
  if coalesce(manhunt_private.feature_user_registered(p_user),false) then
   insert into public.achievement_counters(user_id,feedback) values(p_user,1) on conflict(user_id) do update set feedback=public.achievement_counters.feedback+1;
   perform public.refresh_player_badges(p_user);
  end if;
 end if;
 return public.read_player_badges(p_user);
end;
$$;
create function public.configure_feedback(p_expected bigint,p_questions jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_version bigint; next_version bigint;
begin
 select version into current_version from public.feedback_settings where id=1 for update;
 if current_version is distinct from p_expected then raise exception 'settings_changed'; end if;
 insert into public.feedback_questionnaires(questions) values(p_questions) returning version into next_version;
 update public.feedback_settings set version=next_version where id=1;
 return jsonb_build_object('version',next_version::text);
end;
$$;

-- The existing engine statistics are the sole source. No client can call this
-- trigger, submit a result or supply counters. Old finished matches are ignored.
create function public.finalize_match_features() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb:=new.state; cfg public.feedback_settings; p jsonb; uid uuid; captured integer; points integer; survived boolean; won boolean; winner text;
 registered_players integer; active_modes text[]; qs jsonb; selected_questions jsonb;
begin
 if tg_op='UPDATE' and old.state->>'status'='finished' then return new; end if;
 if s->>'status'<>'finished' or jsonb_typeof(s->'result')<>'object' or s->'result'->>'winner'='aborted' or jsonb_typeof(s#>'{_engine,stats}')<>'object' then return new; end if;
 select * into cfg from public.feedback_settings where id=1;
 if (s->'result'->>'endedAt')::numeric<extract(epoch from cfg.introduced_at)*1000 then return new; end if;
 insert into public.feature_match_events(match_id) values(new.id) on conflict do nothing;
 if not found then return new; end if;
 select count(*) into registered_players from jsonb_array_elements(s->'players') member join auth.users u on u.id=(member->>'id')::uuid where member->>'role'<>'spectator' and not coalesce(u.is_anonymous,false);
 winner:=s->'result'->>'winner';
 active_modes:=array[coalesce(s->'settings'->>'mode','normal')];
 if coalesce((s#>>'{settings,rules,zombie}')::boolean,false) or (s#>'{settings,rules}' is null and s#>>'{settings,mode}' in('zombie','infection_rush')) then active_modes:=array_append(active_modes,'zombie'); end if;
 if coalesce((s#>>'{settings,rules,apocalypse}')::boolean,false) or (s#>'{settings,rules}' is null and s#>>'{settings,mode}'='apocalypse') then active_modes:=array_append(active_modes,'apocalypse'); end if;
 if coalesce((s#>>'{settings,rules,xpHunt}')::boolean,false) then active_modes:=array_append(active_modes,'xpHunt'); end if;
 select questions into qs from public.feedback_questionnaires where version=cfg.version;
 select coalesce(jsonb_agg(q order by n),'[]'::jsonb) into selected_questions from jsonb_array_elements(qs) with ordinality t(q,n) where q->>'feature'='all' or q->>'feature'=any(active_modes);
 for p in select value from jsonb_array_elements(s->'players') order by value->>'id' loop
  uid:=(p->>'id')::uuid;
  if p->>'role'='spectator' or not exists(select 1 from auth.users where id=uid) or coalesce(s#>'{_engine,leftIds}','[]') ? uid::text then continue; end if;
  if registered_players>=2 and not coalesce((select is_anonymous from auth.users where id=uid),true) and (s->'result'->>'endedAt')::numeric-(s->>'startedAt')::numeric>=300000
   and (select count(*) from public.badge_match_awards a join public.feature_match_events e on e.match_id=a.match_id where a.user_id=uid and e.created_at>=date_trunc('day',now()))<5 then
   survived:=p->>'role'='hider' and coalesce(s#>'{result,survivors}','[]') ? uid::text;
   won:=winner='hiders' or winner=uid::text or winner='team_'||(p->>'team') or winner=p->>'team';
   captured:=least(40,greatest(0,coalesce((s#>'{_engine,stats}'->uid::text->>'captures')::integer,0)));
   points:=least(100,greatest(0,coalesce((s#>'{_engine,stats}'->uid::text->>'points')::integer,0)));
   insert into public.badge_match_awards(match_id,user_id,captures,hider_win,hunt_points) values(new.id,uid,captured,survived and won,points) on conflict do nothing;
   if found then
    insert into public.achievement_counters(user_id,captures,hider_wins,games,hunt_points) values(uid,captured,(survived and won)::integer,1,points)
     on conflict(user_id) do update set captures=public.achievement_counters.captures+excluded.captures,hider_wins=public.achievement_counters.hider_wins+excluded.hider_wins,games=public.achievement_counters.games+1,hunt_points=public.achievement_counters.hunt_points+excluded.hunt_points;
    perform public.refresh_player_badges(uid);
   end if;
  end if;
  insert into public.feedback_offers(match_id,user_id,version,questions,modes) values(new.id,uid,cfg.version,selected_questions,active_modes);
 end loop;
 return new;
end;
$$;
create trigger finalize_match_features after insert or update of state on public.game_checkpoints for each row execute function public.finalize_match_features();

create function public.read_feedback_report(p_from timestamptz,p_until timestamptz,p_mode text,p_rating integer,p_page integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as (
  select o.*,a.answers,a.overall,a.recommendation,p.username from public.feedback_offers o
  left join public.feedback_answers a on a.offer_id=o.id left join public.profiles p on p.id=o.user_id
  where o.offered_at>=p_from and o.offered_at<p_until and (p_mode is null or p_mode=any(o.modes)) and (p_rating is null or a.overall=p_rating)
 ), page as(select * from filtered order by offered_at desc,id limit 30 offset p_page*30),
 ratings as(select key,avg((value->>'rating')::numeric) as average from filtered cross join lateral jsonb_each(coalesce(answers,'{}')) where jsonb_typeof(value)='object' and jsonb_typeof(value->'rating')='number' group by key),
 recommendations as(select recommendation,count(*) as amount from filtered where recommendation is not null group by recommendation)
 select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,
  'offered',(select count(*) from filtered),'completed',(select count(*) from filtered where status='completed'),'skipped',(select count(*) from filtered where status='skipped'),
  'average',(select avg(overall) from filtered),'ratings',coalesce((select jsonb_object_agg(key,average) from ratings),'{}'::jsonb),
  'recommendations',coalesce((select jsonb_object_agg(recommendation,amount) from recommendations),'{}'::jsonb),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'matchId',match_id,'userId',user_id,'username',username,'version',version::text,'questions',questions,'answers',answers,'modes',modes,'status',status,'offeredAt',offered_at,'answeredAt',answered_at,'rating',overall,'recommendation',recommendation) order by offered_at desc,id) from page),'[]'::jsonb));
$$;
create function public.update_badge_definition(p_id text,p_definition jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare previous jsonb; u record;
begin
 select definition into previous from public.badge_definitions where id=p_id for update;
 if previous is null or p_definition->>'id'<>p_id or p_definition->>'metric'<>previous->>'metric' or (p_id='beta-tester' and p_definition->'thresholds'<>'[1]'::jsonb) then raise exception 'invalid_badge_definition'; end if;
 update public.badge_definitions set definition=p_definition,updated_at=now() where id=p_id;
 -- Existing levels never decrease when a threshold is raised.
 for u in select user_id from public.achievement_counters order by user_id loop perform public.refresh_player_badges(u.user_id); end loop;
end;
$$;
create function public.read_badge_holders(p_badge text,p_page integer) returns jsonb language sql stable security invoker set search_path='' as $$
 with holders as(select b.*,p.username from public.player_badges b join public.profiles p on p.id=b.user_id where p_badge is null or b.badge_id=p_badge),
 page as(select * from holders order by upgraded_at desc,user_id,badge_id limit 30 offset p_page*30)
 select jsonb_build_object('total',(select count(*) from holders),'page',p_page,
 'definitions',(select jsonb_agg(d.definition||jsonb_build_object('unlockedPlayers',(select count(*) from public.player_badges b where b.badge_id=d.id)) order by d.id) from public.badge_definitions d),
 'players',coalesce((select jsonb_agg(jsonb_build_object('userId',user_id,'username',username,'badgeId',badge_id,'level',level,'unlockedAt',unlocked_at,'upgradedAt',upgraded_at) order by upgraded_at desc,user_id,badge_id) from page),'[]'::jsonb));
$$;

do $$ declare t text; f record; begin
 foreach t in array array['admin_simulations','badge_definitions','achievement_counters','player_badges','badge_equipped','badge_notices','feature_match_events','badge_match_awards','feedback_questionnaires','feedback_settings','feedback_offers','feedback_answers'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('valid_badge_definition','refresh_player_badges','read_player_badges','choose_profile_badge','respond_game_feedback','configure_feedback','finalize_match_features','read_feedback_report','update_badge_definition','read_badge_holders') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.name);
  execute format('grant execute on function %s to service_role',f.name);
 end loop;
end $$;
grant usage,select on sequence public.feedback_questionnaires_version_seq to service_role;
grant select on public.player_badges,public.achievement_counters,public.badge_equipped to authenticated;
create policy own_badges on public.player_badges for select to authenticated using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));
create policy own_achievement_counters on public.achievement_counters for select to authenticated using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));
create policy own_equipped_badge on public.badge_equipped for select to authenticated using(user_id=(select auth.uid()) and (select manhunt_private.account_usable(false)));
commit;
