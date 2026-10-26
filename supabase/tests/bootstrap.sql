-- TEST ONLY: minimal Supabase auth/storage platform contracts for local PostgreSQL WASM.
-- These fixtures never run in a Supabase migration or a deployed app.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create schema auth;
create schema storage;
grant usage on schema public,auth,storage to anon,authenticated,service_role,supabase_auth_admin;
create table auth.users(id uuid primary key, is_anonymous boolean not null default false, raw_user_meta_data jsonb not null default '{}'::jsonb);
grant select,delete on auth.users to supabase_auth_admin;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1];
$$;
