begin;
-- Each rematch has a new match/lobby identity. Historical rounds retain their
-- original code and result; only one open round may hold the invitation code.
alter table public.lobbies drop constraint lobbies_code_key;
create unique index lobbies_open_code on public.lobbies(code) where status not in('finished','closed');

-- No historical counters are inferred: new metrics begin at this introduction.
alter table public.achievement_counters add column wins bigint not null default 0 check(wins>=0), add column survivals bigint not null default 0 check(survivals>=0);
alter table public.badge_match_awards add column win boolean not null default false, add column survival boolean not null default false;
alter table public.badge_definitions add column introduced_at timestamptz not null default now();
create or replace function public.valid_badge_definition(d jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
 select jsonb_typeof(d->'thresholds')='array' and jsonb_typeof(d->'stageNames')='array'
 and d->>'metric' in('feedback','captures','hiderWins','games','huntPoints','wins','survivals')
 and jsonb_array_length(d->'thresholds')=case when d->>'metric'='feedback' then 1 else 10 end
 and jsonb_array_length(d->'stageNames')=jsonb_array_length(d->'thresholds')
 and not exists(select 1 from jsonb_array_elements_text(d->'thresholds') with ordinality t(v,n)
   where v !~ '^[1-9][0-9]{0,8}$' or (n>1 and v::bigint <= (d->'thresholds'->>(n::int-2))::bigint));
$$;

create or replace function public.refresh_player_badges(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c public.achievement_counters; d public.badge_definitions; n bigint; tier integer; previous integer;
begin
 select * into c from public.achievement_counters where user_id=p_user for update;
 if not found or not coalesce(manhunt_private.feature_user_registered(p_user),false) then return; end if;
 for d in select * from public.badge_definitions order by id loop
  n:=case d.definition->>'metric' when 'feedback' then c.feedback when 'captures' then c.captures when 'hiderWins' then c.hider_wins when 'games' then c.games when 'huntPoints' then c.hunt_points when 'wins' then c.wins when 'survivals' then c.survivals else 0 end;
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

create or replace function public.read_player_badges(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('registered',coalesce(manhunt_private.feature_user_registered(p_user),false),
 'badges',coalesce((select jsonb_agg(d.definition || jsonb_build_object(
   'level',coalesce(b.level,0),'unlockedAt',b.unlocked_at,'upgradedAt',b.upgraded_at,
   'progress',coalesce(case d.definition->>'metric' when 'feedback' then c.feedback when 'captures' then c.captures when 'hiderWins' then c.hider_wins when 'games' then c.games when 'huntPoints' then c.hunt_points when 'wins' then c.wins when 'survivals' then c.survivals end,0)) order by d.id)
   from public.badge_definitions d left join public.player_badges b on b.badge_id=d.id and b.user_id=p_user
   left join public.achievement_counters c on c.user_id=p_user),'[]'::jsonb),
 'selected',(select jsonb_build_object('id',d.id,'name',d.definition->>'name','icon',d.definition->>'icon','level',b.level,'stageName',d.definition->'stageNames'->>(b.level-1))
   from public.badge_equipped e join public.player_badges b on b.user_id=e.user_id and b.badge_id=e.badge_id join public.badge_definitions d on d.id=e.badge_id where e.user_id=p_user and not exists(select 1 from public.badge_visibility v where v.user_id=p_user and v.badge_id=e.badge_id and not v.visible)),
 'visibleBadgeIds',coalesce((select jsonb_agg(b.badge_id order by b.badge_id) from public.player_badges b where b.user_id=p_user and not exists(select 1 from public.badge_visibility v where v.user_id=b.user_id and v.badge_id=b.badge_id and not v.visible)),'[]'::jsonb),
 'notices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'badgeId',n.badge_id,'name',d.definition->>'name','level',n.level,'at',n.created_at) order by n.created_at)
   from public.badge_notices n join public.badge_definitions d on d.id=n.badge_id where n.user_id=p_user and n.seen_at is null),'[]'::jsonb));
$$;

create or replace function public.finalize_match_features() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb:=new.state; cfg public.feedback_settings; p jsonb; uid uuid; captured integer; points integer; survived boolean; won boolean; winner text;
 registered_players integer; active_modes text[]; qs jsonb; selected_questions jsonb; new_metrics boolean;
begin
 if tg_op='UPDATE' and old.state->>'status'='finished' then return new; end if;
 if s->>'status'<>'finished' or jsonb_typeof(s->'result')<>'object' or s->'result'->>'winner'='aborted' or jsonb_typeof(s#>'{_engine,stats}')<>'object' then return new; end if;
 select * into cfg from public.feedback_settings where id=1;
 if (s->'result'->>'endedAt')::numeric<extract(epoch from cfg.introduced_at)*1000 then return new; end if;
 insert into public.feature_match_events(match_id) values(new.id) on conflict do nothing;
 if not found then return new; end if;
 select count(*) into registered_players from jsonb_array_elements(s->'players') member join auth.users u on u.id=(member->>'id')::uuid where member->>'role'<>'spectator' and not coalesce(u.is_anonymous,false);
 winner:=s->'result'->>'winner';
 new_metrics:=(s->'result'->>'endedAt')::numeric>=coalesce((select min(extract(epoch from d.introduced_at)*1000) from public.badge_definitions d where d.definition->>'metric' in('wins','survivals')),1e30);
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
   won:=winner=uid::text or (winner='hiders' and survived) or (winner in('hunters','infected') and p->>'role' in('hunter','zombie')) or winner='team_'||(p->>'team') or winner=p->>'team';
   captured:=least(40,greatest(0,coalesce((s#>'{_engine,stats}'->uid::text->>'captures')::integer,0)));
   points:=least(100,greatest(0,coalesce((s#>'{_engine,stats}'->uid::text->>'points')::integer,0)));
   insert into public.badge_match_awards(match_id,user_id,captures,hider_win,hunt_points,win,survival) values(new.id,uid,captured,survived and won,points,won and new_metrics,survived and new_metrics) on conflict do nothing;
   if found then
    insert into public.achievement_counters(user_id,captures,hider_wins,games,hunt_points,wins,survivals) values(uid,captured,(survived and won)::integer,1,points,(won and new_metrics)::integer,(survived and new_metrics)::integer)
     on conflict(user_id) do update set captures=public.achievement_counters.captures+excluded.captures,hider_wins=public.achievement_counters.hider_wins+excluded.hider_wins,games=public.achievement_counters.games+1,hunt_points=public.achievement_counters.hunt_points+excluded.hunt_points,wins=public.achievement_counters.wins+excluded.wins,survivals=public.achievement_counters.survivals+excluded.survivals;
    perform public.refresh_player_badges(uid);
   end if;
  end if;
  insert into public.feedback_offers(match_id,user_id,version,questions,modes) values(new.id,uid,cfg.version,selected_questions,active_modes);
 end loop;
 return new;
end;
$$;
insert into public.badge_definitions(id,definition) values('winner','{"id": "winner", "name": "Sieger", "description": "Gewinne gültig abgeschlossene Matches als Hunter, Hider oder im Team.", "icon": "trophy", "metric": "wins", "thresholds": [1, 5, 10, 20, 35, 55, 80, 120, 175, 250], "stageNames": ["Erster Sieg", "Auf Erfolgskurs", "Siegesserie", "Durchstarter", "Champion", "Titelträger", "Spitzenklasse", "Elite Champion", "Triumphator", "Ultimate Champion"], "unit": "Siege"}'::jsonb);
insert into public.badge_definitions(id,definition) values('survivor','{"id": "survivor", "name": "Überlebenskünstler", "description": "Beende gültige Matches als überlebender Hider – auch wenn dein Team das Spiel nicht gewinnt.", "icon": "shield", "metric": "survivals", "thresholds": [1, 5, 10, 20, 35, 55, 80, 120, 175, 250], "stageNames": ["Durchgehalten", "Standhaft", "Zäh", "Unbeugsam", "Survival Pro", "Überlebensprofi", "Unerschütterlich", "Elite Survivor", "Unsterbliche Legende", "Ultimate Survivor"], "unit": "Überlebte Runden"}'::jsonb);
-- Existing functions retain their service-role-only ACLs; no client mutation grants.
commit;
