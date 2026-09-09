begin;
-- Project-wide: one Google account can be linked from several FocusFlow users,
-- and the subject of a new authorization code is unknown before its exchange.
create table public.google_oauth_operations (
  operation_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check(kind in ('connect','disconnect')),
  state text not null default 'running' check(state in ('running','uncertain','completed')),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  recovery_evidence text
);
create unique index google_one_oauth_operation on public.google_oauth_operations((true)) where state<>'completed';
alter table public.google_oauth_operations enable row level security;
revoke all on public.google_oauth_operations from public,anon,authenticated,service_role;

create function public.begin_google_oauth_operation(p_operation_id uuid,p_user_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare active public.google_oauth_operations%rowtype;
begin
  if p_operation_id is null or p_user_id is null or p_kind is null or p_kind not in ('connect','disconnect') then
    raise exception 'INVALID_OAUTH_OPERATION' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(270027);
  select * into active from public.google_oauth_operations where operation_id=p_operation_id;
  if found then
    return jsonb_build_object('acquired',active.user_id=p_user_id and active.kind=p_kind and active.state='running');
  end if;
  select * into active from public.google_oauth_operations where state<>'completed';
  if found then return jsonb_build_object('acquired',false,'uncertain',active.state='uncertain'); end if;
  insert into public.google_oauth_operations(operation_id,user_id,kind) values(p_operation_id,p_user_id,p_kind);
  return jsonb_build_object('acquired',true);
end $$;
create function public.finish_google_oauth_operation(p_operation_id uuid,p_user_id uuid,p_state text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_state text;
begin
  if p_state is null or p_state not in ('completed','uncertain') then raise exception 'INVALID_OAUTH_STATE' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(270027);
  select state into old_state from public.google_oauth_operations where operation_id=p_operation_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('finished',false); end if;
  if old_state=p_state then return jsonb_build_object('finished',true); end if;
  if old_state<>'running' then return jsonb_build_object('finished',false); end if;
  update public.google_oauth_operations set state=p_state,
    completed_at=case when p_state='completed' then clock_timestamp() else null end where operation_id=p_operation_id;
  return jsonb_build_object('finished',true);
end $$;
-- Administrative recovery only; never granted to the application service role.
-- Operator must first terminate the old invocation and verify remote completion.
create function public.recover_google_oauth_operation(p_operation_id uuid,p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if length(btrim(coalesce(p_evidence,'')))=0 then raise exception 'RECOVERY_EVIDENCE_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(270027);
  update public.google_oauth_operations set state='completed',completed_at=clock_timestamp(),recovery_evidence=p_evidence
    where operation_id=p_operation_id and state<>'completed';
  if not found then raise exception 'OAUTH_OPERATION_NOT_PENDING'; end if;
end $$;
revoke all on function public.begin_google_oauth_operation(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.finish_google_oauth_operation(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.recover_google_oauth_operation(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_google_oauth_operation(uuid,uuid,text) to service_role;
grant execute on function public.finish_google_oauth_operation(uuid,uuid,text) to service_role;
commit;
