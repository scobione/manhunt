-- Result references must be erased in every participant's history, not only
-- in the departing user's own rows. Only the trusted backend may call these.
create function public.erase_result_identity(p_result jsonb, p_actor uuid)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare cleaned jsonb := p_result;
begin
  if jsonb_typeof(cleaned) is distinct from 'object' then return cleaned; end if;
  cleaned := jsonb_set(cleaned,'{survivors}',coalesce((
    select jsonb_agg(v) from jsonb_array_elements(coalesce(cleaned->'survivors','[]'::jsonb)) v
    where v#>>'{}' <> p_actor::text
  ),'[]'::jsonb));
  if cleaned->>'winner'=p_actor::text then
    cleaned := cleaned || jsonb_build_object('winner','deleted_player','reason','Der Sieger hat sein Konto gelöscht.');
  end if;
  return cleaned;
end;
$$;
revoke all on function public.erase_result_identity(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.erase_result_identity(jsonb,uuid) to service_role;

create or replace function public.delete_account(p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare row public.game_checkpoints; cleaned jsonb; next_revision bigint;
begin
  -- Use the same lock order as edge_commit. This transaction invalidates any
  -- snapshot read before erasure, including when only historical data remains.
  update public.edge_runtime set revision=revision+1 where id=1;
  for row in select * from public.game_checkpoints
    where state::text like '%' || p_actor::text || '%' order by id for update loop
    cleaned := row.state;
    cleaned := jsonb_set(cleaned,'{players}',coalesce((select jsonb_agg(p - 'location' - 'captureCode')
      from jsonb_array_elements(coalesce(cleaned->'players','[]'::jsonb)) p
      where p->>'id' <> p_actor::text),'[]'::jsonb));
    cleaned := cleaned || jsonb_build_object('pins','[]'::jsonb,'events','[]'::jsonb,'captures','[]'::jsonb);
    if jsonb_typeof(cleaned->'result')='object' then
      cleaned := jsonb_set(cleaned,'{result}',public.erase_result_identity(cleaned->'result',p_actor));
    end if;
    if jsonb_typeof(cleaned->'_engine')='object' then
      cleaned := jsonb_set(cleaned,'{_engine,players}',coalesce(cleaned#>'{_engine,players}','{}'::jsonb)-p_actor::text);
      cleaned := jsonb_set(cleaned,'{_engine,leftIds}',coalesce((select jsonb_agg(v)
        from jsonb_array_elements(coalesce(cleaned#>'{_engine,leftIds}','[]'::jsonb)) v
        where v#>>'{}'<>p_actor::text),'[]'::jsonb));
    end if;
    if cleaned->>'hostId'=p_actor::text then
      delete from public.game_checkpoints where id=row.id;
      update public.lobbies set status='closed',revision=revision+1,updated_at=now() where id=row.id;
    else
      select greatest(revision,coalesce((cleaned->>'revision')::bigint,0))+1 into next_revision
        from public.lobbies where id=row.id;
      cleaned := jsonb_set(cleaned,'{revision}',to_jsonb(next_revision));
      update public.lobbies set revision=next_revision where id=row.id;
      -- Preserve the retention timestamp: erasure must not extend GPS retention.
      update public.game_checkpoints set state=cleaned where id=row.id;
    end if;
  end loop;
  update public.match_results set result=public.erase_result_identity(result,p_actor)
    where result->>'winner'=p_actor::text or result->'survivors' ? p_actor::text;
  delete from public.notifications where payload->>'from'=p_actor::text;
  delete from public.audit_logs where actor_id=p_actor;
  -- Storage bytes and the Auth user are removed by their supported APIs.
end;
$$;
revoke all on function public.delete_account(uuid) from public,anon,authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- Repair orphan identities left by the old erasure routine. Do not read or
-- delete any live account. UUID references to existing profiles are preserved.
do $$
declare orphan uuid;
begin
  for orphan in
    select distinct case when ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ref::uuid end
    from (
      select result->>'winner' as ref from public.match_results
      union select jsonb_array_elements_text(coalesce(result->'survivors','[]'::jsonb)) from public.match_results
      union select state#>>'{result,winner}' from public.game_checkpoints
      union select jsonb_array_elements_text(coalesce(state#>'{result,survivors}','[]'::jsonb)) from public.game_checkpoints
      union select jsonb_object_keys(coalesce(state#>'{_engine,players}','{}'::jsonb)) from public.game_checkpoints
      union select jsonb_array_elements_text(coalesce(state#>'{_engine,leftIds}','[]'::jsonb)) from public.game_checkpoints
    ) refs
    where ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists(select 1 from public.profiles p where p.id::text=lower(ref))
  loop
    if orphan is not null then perform public.delete_account(orphan); end if;
  end loop;
end;
$$;

-- Historical winner names are unnecessary in free text. The winner reference
-- and the existing player/profile records are sufficient for display.
update public.match_results set result=jsonb_set(result,'{reason}','"Der letzte Hider gewinnt."'::jsonb)
  where result->>'winner' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
update public.game_checkpoints set state=jsonb_set(state,'{result,reason}','"Der letzte Hider gewinnt."'::jsonb)
  where state#>>'{result,winner}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
