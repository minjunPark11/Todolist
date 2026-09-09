begin;
alter table public.google_calendar_tokens add column grant_version uuid not null default gen_random_uuid();
alter table public.google_calendar_connections add column google_subject text, add column calendar_verified_at timestamptz;
create function public.rotate_google_grant_version() returns trigger language plpgsql set search_path='' as $$
begin new.grant_version:=gen_random_uuid(); return new; end $$;
create trigger rotate_google_grant_version before insert or update on public.google_calendar_tokens
for each row execute function public.rotate_google_grant_version();

-- Metadata such as labels may still be written by clients. Connection scope is server-owned.
create or replace function public.guard_google_task_connection() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user <> pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
    where oid='public.google_calendar_connections'::regclass)) then
    if tg_op='INSERT' then raise exception 'VERIFIED_CALENDAR_REQUIRED' using errcode='42501'; end if;
    if (new.user_id,new.calendar_id,new.account_email,new.google_subject,new.calendar_verified_at,
      new.connection_generation,new.sync_revision,new.sync_token,new.sync_timezone,new.lease_owner,new.lease_until,new.lease_fence)
      is distinct from
      (old.user_id,old.calendar_id,old.account_email,old.google_subject,old.calendar_verified_at,
      old.connection_generation,old.sync_revision,old.sync_token,old.sync_timezone,old.lease_owner,old.lease_until,old.lease_fence) then
      raise exception 'VERIFIED_CALENDAR_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end $$;

-- Never expose this credential snapshot to authenticated clients.
create function public.read_google_binding_snapshot(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  return (select jsonb_build_object('refreshToken',t.refresh_token,'subject',t.google_subject,
    'grantVersion',t.grant_version,'generation',c.connection_generation,
    'boundCalendarId',case when c.google_subject=t.google_subject then c.calendar_id else null end)
    from public.google_calendar_tokens t left join public.google_calendar_connections c on c.user_id=t.user_id
    where t.user_id=p_user_id);
end $$;

create function public.bind_verified_google_calendar(p_user_id uuid,p_refresh_token text,p_subject text,
  p_grant_version uuid,p_expected_generation uuid,p_calendar_id text,p_timezone text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.google_calendar_tokens%rowtype; c public.google_calendar_connections%rowtype; had_connection boolean;
begin
  if p_user_id is null or p_grant_version is null or length(btrim(coalesce(p_subject,'')))=0 or
    length(btrim(coalesce(p_calendar_id,'')))=0 or p_calendar_id='primary' or
    not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'INVALID_CALENDAR_BINDING' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into t from public.google_calendar_tokens where user_id=p_user_id for update;
  if not found or t.google_subject is distinct from p_subject or t.refresh_token is distinct from p_refresh_token
    or t.grant_version is distinct from p_grant_version then return jsonb_build_object('bound',false); end if;
  select * into c from public.google_calendar_connections where user_id=p_user_id for update;
  had_connection:=found;
  if c.connection_generation is distinct from p_expected_generation or
    coalesce(c.lease_until,'-infinity'::timestamptz)>clock_timestamp() then return jsonb_build_object('bound',false); end if;
  if had_connection and c.google_subject is not null then
    if c.google_subject<>p_subject or c.calendar_id<>p_calendar_id or c.sync_timezone is distinct from p_timezone then
      return jsonb_build_object('bound',false);
    end if;
    -- Same verified scope: preserve generation, mappings, base, cursor, pinned timezone.
    update public.google_calendar_connections set account_email=coalesce(p_email,''),calendar_verified_at=clock_timestamp()
      where user_id=p_user_id;
  elsif had_connection then
    -- A live observation is not proof of historical scope. Start a fresh generation;
    -- old mappings and records remain isolated in their original generation.
    if exists(select 1 from public.google_task_sync_accounts where user_id=p_user_id and enabled) then
      return jsonb_build_object('bound',false);
    end if;
    update public.google_calendar_connections set calendar_id=p_calendar_id,account_email=coalesce(p_email,''),
      google_subject=p_subject,calendar_verified_at=clock_timestamp(),connection_generation=gen_random_uuid(),
      sync_timezone=p_timezone,sync_revision=0,sync_token=null,lease_owner=null,lease_until=null,lease_fence=lease_fence+1
      where user_id=p_user_id;
  else
    insert into public.google_calendar_connections(user_id,calendar_id,account_email,google_subject,calendar_verified_at,sync_timezone)
      values(p_user_id,p_calendar_id,coalesce(p_email,''),p_subject,clock_timestamp(),p_timezone);
  end if;
  return jsonb_build_object('bound',true);
end $$;
revoke all on function public.read_google_binding_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_google_binding_snapshot(uuid) to service_role;
grant execute on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) to service_role;
commit;
