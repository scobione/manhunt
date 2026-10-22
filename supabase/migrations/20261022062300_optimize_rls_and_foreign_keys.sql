-- Preserve access rules while evaluating auth.uid() once per statement.
-- Service-only tables intentionally retain RLS with no client policies.
drop policy profiles_read_self on public.profiles;
drop policy profiles_read_friends on public.profiles;
drop policy friendships_read on public.friendships;
drop policy friend_requests_read on public.friend_requests;
drop policy blocked_users_read on public.blocked_users;
drop policy lobby_members_read on public.lobby_members;
drop policy lobbies_read on public.lobbies;
drop policy lobby_invites_read on public.lobby_invites;
drop policy game_participants_read on public.game_participants;
drop policy game_sessions_read on public.game_sessions;
drop policy game_settings_read on public.game_settings;
drop policy game_zones_read on public.game_zones;
drop policy location_pins_read_self on public.location_pins;
drop policy match_results_read on public.match_results;
drop policy notifications_read on public.notifications;
drop policy presets_read on public.presets;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists(select 1 from public.friendships f where (f.user_id = (select auth.uid()) and f.friend_id = id) or (f.friend_id = (select auth.uid()) and f.user_id = id))
);
create policy friendships_read on public.friendships for select to authenticated using(user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy friend_requests_read on public.friend_requests for select to authenticated using(sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy blocked_users_read on public.blocked_users for select to authenticated using(user_id = (select auth.uid()));
-- Membership is intentionally self-only: no policy recursion, no premature role disclosure.
create policy lobby_members_read on public.lobby_members for select to authenticated using(user_id = (select auth.uid()));
create policy lobbies_read on public.lobbies for select to authenticated using(
  host_id = (select auth.uid()) or exists(select 1 from public.lobby_members m where m.lobby_id = id and m.user_id = (select auth.uid()))
);
create policy lobby_invites_read on public.lobby_invites for select to authenticated using(inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));
create policy game_participants_read on public.game_participants for select to authenticated using(user_id = (select auth.uid()));
create policy game_sessions_read on public.game_sessions for select to authenticated using(
  exists(select 1 from public.game_participants p where p.session_id = id and p.user_id = (select auth.uid()))
);
create policy game_settings_read on public.game_settings for select to authenticated using(
  exists(select 1 from public.lobby_members m where m.lobby_id = game_settings.lobby_id and m.user_id = (select auth.uid()))
);
create policy game_zones_read on public.game_zones for select to authenticated using(user_id = (select auth.uid()) or
  exists(select 1 from public.lobby_members m where m.lobby_id = game_zones.lobby_id and m.user_id = (select auth.uid()))
);
-- Pins visible to a hunter are selected by the authoritative server, not by a broad lobby SELECT policy.
create policy location_pins_read_self on public.location_pins for select to authenticated using(player_id = (select auth.uid()));
create policy match_results_read on public.match_results for select to authenticated using(user_id = (select auth.uid()));
create policy notifications_read on public.notifications for select to authenticated using(user_id = (select auth.uid()));
create policy presets_read on public.presets for select to authenticated using(user_id = (select auth.uid()));


-- Support foreign-key checks and account deletion without full event-table scans.
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index capture_events_hunter_id_idx on public.capture_events(hunter_id);
create index capture_events_target_id_idx on public.capture_events(target_id);
create index infection_events_actor_id_idx on public.infection_events(actor_id);
create index infection_events_target_id_idx on public.infection_events(target_id);
create index lobby_invites_inviter_id_idx on public.lobby_invites(inviter_id);
create index location_pins_player_id_idx on public.location_pins(player_id);
create index zone_events_player_id_idx on public.zone_events(player_id);
