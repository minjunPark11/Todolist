begin;
create table public.google_verified_connection_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  google_subject text not null,
  calendar_id text not null,
  generation uuid not null,
  sync_timezone text not null,
  verified_at timestamptz not null,
  disconnected_at timestamptz not null default clock_timestamp(),
  primary key(user_id,google_subject,calendar_id)
);
alter table public.google_verified_connection_history enable row level security;
revoke all on public.google_verified_connection_history from public,anon,authenticated,service_role;

create function public.archive_verified_google_connection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.google_subject is not null and old.calendar_verified_at is not null and old.sync_timezone is not null
    and exists(select 1 from auth.users where id=old.user_id) then
    insert into public.google_verified_connection_history(user_id,google_subject,calendar_id,generation,sync_timezone,verified_at)
      values(old.user_id,old.google_subject,old.calendar_id,old.connection_generation,old.sync_timezone,old.calendar_verified_at)
      on conflict(user_id,google_subject,calendar_id) do update set generation=excluded.generation,
        sync_timezone=excluded.sync_timezone,verified_at=excluded.verified_at,disconnected_at=clock_timestamp();
  end if;
  return old;
end $$;
create trigger archive_verified_google_connection before delete on public.google_calendar_connections
  for each row execute function public.archive_verified_google_connection();

-- Keep the proven binding checks in 025, wrapped by one transaction for history transfer.
alter function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) rename to bind_verified_google_calendar_core;
revoke all on function public.bind_verified_google_calendar_core(uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.bind_verified_google_calendar(p_user_id uuid,p_refresh_token text,p_subject text,
  p_grant_version uuid,p_expected_generation uuid,p_calendar_id text,p_timezone text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.google_verified_connection_history%rowtype; result jsonb; new_generation uuid; had_connection boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  had_connection:=exists(select 1 from public.google_calendar_connections where user_id=p_user_id);
  select * into h from public.google_verified_connection_history
    where user_id=p_user_id and google_subject=p_subject and calendar_id=p_calendar_id;
  if not had_connection and h.generation is not null and h.sync_timezone is distinct from p_timezone then
    return jsonb_build_object('bound',false);
  end if;
  result:=public.bind_verified_google_calendar_core(p_user_id,p_refresh_token,p_subject,p_grant_version,
    p_expected_generation,p_calendar_id,p_timezone,p_email);
  if result->>'bound'='true' and not had_connection and h.generation is not null then
    select connection_generation into new_generation from public.google_calendar_connections where user_id=p_user_id;
    insert into public.google_task_mappings(user_id,generation,calendar_id,event_id,task_id,state,base,etag,source)
      select m.user_id,new_generation,m.calendar_id,m.event_id,m.task_id,
        case when m.state='deleted' or t.id is null then 'deleted'
          when coalesce(t.data->>'deletedAt','')<>'' then 'trashed' else m.state end,
        m.base,m.etag,m.source
      from public.google_task_mappings m left join public.tasks t on t.user_id=m.user_id and t.id=m.task_id
      where m.user_id=p_user_id and m.generation=h.generation and m.calendar_id=p_calendar_id;
    insert into public.google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision,revision,updated_at)
      select user_id,new_generation,calendar_id,event_id,source,decision,revision,updated_at
      from public.google_task_inbound_records where user_id=p_user_id and generation=h.generation and calendar_id=p_calendar_id;
    -- No passes, lease, cursor or task writes. The new generation starts a full read.
  end if;
  return result;
end $$;
revoke all on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) to service_role;

create or replace function public.read_google_binding_snapshot(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  return (select jsonb_build_object('refreshToken',t.refresh_token,'subject',t.google_subject,
    'grantVersion',t.grant_version,'generation',c.connection_generation,
    'boundCalendarId',case when c.google_subject=t.google_subject then c.calendar_id else null end,
    'historicalCalendarIds',coalesce((select jsonb_agg(h.calendar_id) from public.google_verified_connection_history h
      where h.user_id=t.user_id and h.google_subject=t.google_subject),'[]'::jsonb))
    from public.google_calendar_tokens t left join public.google_calendar_connections c on c.user_id=t.user_id
    where t.user_id=p_user_id);
end $$;

create function public.read_google_disconnect_snapshot(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  return jsonb_build_object('refreshToken',(select refresh_token from public.google_calendar_tokens where user_id=p_user_id),
    'grantVersion',(select grant_version from public.google_calendar_tokens where user_id=p_user_id),
    'generation',(select connection_generation from public.google_calendar_connections where user_id=p_user_id));
end $$;
create function public.disconnect_google_calendar(p_user_id uuid,p_grant_version uuid,p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actual_grant uuid; actual_generation uuid;
begin
  if p_user_id is null then raise exception 'INVALID_DISCONNECT' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select grant_version into actual_grant from public.google_calendar_tokens where user_id=p_user_id for update;
  select connection_generation into actual_generation from public.google_calendar_connections where user_id=p_user_id for update;
  if actual_grant is distinct from p_grant_version or actual_generation is distinct from p_generation then
    return jsonb_build_object('disconnected',false);
  end if;
  delete from public.google_calendar_connections where user_id=p_user_id;
  delete from public.google_calendar_tokens where user_id=p_user_id;
  delete from public.google_calendar_sources where user_id=p_user_id;
  return jsonb_build_object('disconnected',true);
end $$;
revoke all on function public.read_google_disconnect_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.disconnect_google_calendar(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_google_disconnect_snapshot(uuid) to service_role;
grant execute on function public.disconnect_google_calendar(uuid,uuid,uuid) to service_role;
commit;
