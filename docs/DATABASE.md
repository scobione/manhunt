# Database and access model

Apply `supabase/migrations/202610200001_initial.sql` using the Supabase CLI migration runner (`supabase db push`) or the project's SQL editor. The migration is transactional. It requires the standard Supabase `auth` and `storage` schemas and roles. It does not create an external project or enable Google OAuth. Use a European project region and the Free plan; do not enable paid upgrades.

## Data model

The 18 requested application tables are present: `profiles`, `friendships`, `friend_requests`, `blocked_users`, `lobbies`, `lobby_members`, `lobby_invites`, `game_sessions`, `game_participants`, `game_settings`, `game_zones`, `location_pins`, `capture_events`, `infection_events`, `zone_events`, `match_results`, `notifications`, and `audit_logs`.

Additional tables are `game_checkpoints`, `presets`, and `push_subscriptions`. All tables enable Row Level Security. All foreign keys, unique keys, and relevant lookup/retention indexes are declared in the migration. Profile usernames are unique without regard to case. Profile friend codes are 12 random uppercase hexadecimal characters, unrelated to the six-character lobby code. Friendships store one canonical pair (`user_id < friend_id`), not duplicate directed rows.

A successful Supabase Auth signup creates a profile through a database trigger. The generated `player_<16 hex>` name is unique; the user can rename it through the API. The avatar can be taken from Google's HTTPS avatar URL. Online status sharing is off by default.

## Trust boundaries

The browser uses only a Supabase public/anon key and the user's access token. The server verifies the access token using Supabase Auth and uses a separate service-role key. The service key must never appear in a `VITE_*` variable, the frontend bundle, a URL, a log, or Git.

Client roles have no direct writes to application tables. Mutations go through the authenticated API so permission checks, validation, rate limits, blocking, and audit behavior apply consistently. Browser SELECT policies expose the current user's account records and accepted friends' profiles. Membership and participant rows are self-only to avoid revealing pre-match roles. Private lobby rows, settings, and zone data are visible only to members. Match results and notifications are user-specific.

`game_checkpoints` and `push_subscriptions` have no client policies or client privileges. `audit_logs`, `capture_events`, `infection_events`, and `zone_events` are service-only. A checkpoint may contain live GPS and capture codes; it must never be broadcast directly. The backend uses the game engine's per-user projection when sending Socket.IO state. `location_pins` permits a player to read their own positions only; visibility of another player's pin is evaluated on the server, including its mode, time window, lifetime, and role.

RLS is a second boundary, not a replacement for API permissions. Supabase's service-role connection bypasses RLS. In particular, every service-role query must include the authenticated user where appropriate. Never forward client-supplied RPC actor IDs without replacing them with the validated session's user ID.

## Server RPC contract

All mutating functions revoke default `PUBLIC`, `anon`, and `authenticated` execution. Only `service_role` can call them. Security-definer functions fix an empty `search_path` and fully qualify application tables.

| RPC | Arguments | Behavior |
| --- | --- | --- |
| `request_friend` | `p_actor uuid, p_code text` | Exact friend-code lookup, self/block checks, at most 20 requests per 24 hours, deduplication, recipient notification. |
| `respond_friend` | `p_actor uuid, p_request uuid, p_accept boolean` | Receiver-only pending transition, friendship creation on acceptance, notification. |
| `remove_friend` | `p_actor uuid, p_target uuid` | Remove canonical friendship pair. |
| `block_user` | `p_actor uuid, p_target uuid` | Add a block, remove friendship, reject pending requests, remove mutual invitations and related notifications. |
| `invite_friend` | `p_actor uuid, p_friend uuid, p_code text` | Require accepted friendship, no block, membership in a waiting lobby; deduplicate valid invitation and notify recipient. |
| `is_blocked_pair` | `p_a uuid, p_b uuid` | Detect a block in either direction. |
| `save_game_checkpoint` | `p_state jsonb` | Atomically save the authoritative lobby snapshot and normalized projections. |
| `cleanup_expired_data` | none | Run retention cleanup; alias for `cleanup_manhunt`. |
| `delete_account` | `p_actor uuid` | Erase account-associated checkpoint references before Supabase Auth account deletion. |

Social RPCs return JSON with `user_ids` for realtime invalidation and an `id` for newly created requests/invitations. Pair-scoped transaction advisory locks serialize requests, responses, blocks, and invitations in both directions. Repeated pending requests and invitations do not create repeat notifications. Database constraints provide an additional concurrency safeguard.

A checkpoint's `id` is the lobby ID. A match's session ID uses the same UUID because each lobby runs one match. Saving after a match creates one result per participant. The transaction also updates settings, zone, memberships, participants, pins, and supported event projections. An older revision cannot overwrite a newer checkpoint. Any validation or foreign-key failure rolls back the whole save. A database error must prevent the backend from acknowledging a durable mutation as successful.

## Avatar Storage

`avatars` is a private bucket. It accepts JPEG, PNG, and WebP files up to 2 MiB. The browser may insert, update, and delete only objects under `<auth.uid()>/<filename>`. SVG and HTML uploads are not allowed. Do not make the bucket public to work around download authorization.

The API should issue expiring signed URLs for the requesting user's own, accepted friends', or current lobby members' avatar objects. Do not persist a short-lived signed URL as the canonical uploaded avatar reference. If Google's hosted avatar is used, its HTTPS URL may be stored directly. The backend must validate upload ownership before associating an object with a profile. Storage policy ownership checks also apply to upserts.

For account erasure: stop/leave the player's live match while holding the backend persistence queue; list and remove their avatar objects using the Storage API; call `delete_account` to scrub checkpoint references; then call `supabase.auth.admin.deleteUser`. Deleting Storage metadata through SQL is insufficient because it can orphan the underlying bytes. Auth deletion cascades account-owned profile/social/notification/preset/push rows. Match results for other users retain their own result but remove the deleted user's survivor ID. Audit entries for the deleted actor are erased. A restored checkpoint must never reintroduce a deleted identity.

## Retention and recovery

`cleanup_expired_data` runs on backend startup and once per minute. It deletes expired pins, checkpoints older than 24 hours, old waiting/closed lobbies, expired invitations after 7 days, and notifications/audits after 30 days. Old friendship requests expire after 30 days. Finished checkpoints are scrubbed immediately of all player GPS samples, capture codes, pins, and pending capture requests. Match history retains outcomes without the live GPS trace. If a host account is deleted, its abandoned checkpoint is removed and its lobby is closed.

Free hosts can sleep. Retention runs when the backend is next awake, so the wall-clock cleanup deadline is not guaranteed while hosting is suspended. For a stricter retention deadline, configure Supabase's own available scheduler under the selected plan; no paid scheduler is created by this repository.

Checkpoint recovery does not imply uninterrupted outdoor tracking. The backend must restore into a safe paused state after a process restart, mark participants disconnected, and demand fresh location samples before resuming zone enforcement. A stale point must not cause an unchecked elimination.

## Validation scope

The checked-in database regression script exercises migration syntax, RLS isolation, blocked friendship transitions, checkpoint atomicity, pin privacy, erasure, and retention using a PostgreSQL-compatible local engine. Its auth/storage schemas are explicitly test fixtures, not a replacement for the real Supabase services. Applying the migration and exercising Google OAuth, Storage byte uploads, signed URLs, and deployed RLS still require an authorized Supabase project. No live project has been claimed as configured by this migration alone.
