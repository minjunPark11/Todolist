-- Staged infrastructure. DO NOT enable an account until all task writers use
-- revision RPCs, legacy mappings are registered, and the new sync UI is deployed.
-- The migration itself does not enable inbound sync or contact Google.
begin;

alter table public.tasks add column if not exists revision bigint not null default 1;
alter table public.google_calendar_connections
  add column if not exists connection_generation uuid not null default gen_random_uuid(),
  add column if not exists sync_revision bigint not null default 0,
  add column if not exists sync_timezone text,
  add column if not exists lease_owner uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists lease_fence bigint not null default 0;

-- Persists across disconnect: disconnect must not re-enable legacy task writes.
create table public.google_task_sync_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false
);
create table public.google_task_mappings (
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  calendar_id text not null,
  event_id text not null check (length(event_id) > 0),
  task_id text not null,
  state text not null default 'active' check (state in ('active', 'trashed', 'deleted')),
  base jsonb,
  etag text,
  source jsonb,
  primary key (user_id, generation, calendar_id, event_id)
);
create unique index google_task_one_live_event on public.google_task_mappings
  (user_id, generation, calendar_id, task_id) where state <> 'deleted';
create table public.google_task_inbound_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  calendar_id text not null,
  event_id text not null,
  source jsonb not null,
  decision jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, generation, calendar_id, event_id)
);
create table public.google_task_inbound_passes (
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  pass_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  primary key (user_id, generation, pass_id)
);
create table public.task_revision_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  revision bigint not null,
  primary key (user_id, task_id)
);
create table public.task_write_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  write_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  primary key (user_id, write_id)
);

do $$
declare t text;
begin
  foreach t in array array['google_task_sync_accounts', 'google_task_mappings',
    'google_task_inbound_records', 'google_task_inbound_passes', 'task_revision_tombstones', 'task_write_receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_read on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Invoker trigger: direct REST writes run as authenticated/service_role; the
-- narrow SECURITY DEFINER RPCs run as the table owner. No spoofable HTTP header.
create function public.guard_task_revision() returns trigger
language plpgsql set search_path = '' as $$
declare u uuid; enabled_account boolean;
begin
  u := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  select enabled into enabled_account from public.google_task_sync_accounts where user_id = u;
  if coalesce(enabled_account, false) and current_user <>
      pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class where oid = 'public.tasks'::regclass)) then
    raise exception 'TASK_REVISION_REQUIRED: update the client' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and (new.id <> old.id or new.user_id <> old.user_id) then
    raise exception 'TASK_ID_IMMUTABLE' using errcode = '22023';
  end if;
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  return new;
end $$;
-- Guard lookup is granted for the invoker trigger, including legacy service writes.
grant select on public.google_task_sync_accounts to service_role;
create trigger guard_task_revision before insert or update or delete on public.tasks
  for each row execute function public.guard_task_revision();

create function public.guard_google_task_connection() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
      where oid = 'public.google_calendar_connections'::regclass)) then
    if tg_op = 'INSERT' then
      new.connection_generation := gen_random_uuid(); new.sync_revision := 0;
      new.sync_token := null; new.sync_timezone := null;
      new.lease_owner := null; new.lease_until := null; new.lease_fence := 0;
    elsif (new.connection_generation, new.sync_revision, new.sync_token, new.sync_timezone,
           new.lease_owner, new.lease_until, new.lease_fence) is distinct from
          (old.connection_generation, old.sync_revision, old.sync_token, old.sync_timezone,
           old.lease_owner, old.lease_until, old.lease_fence) then
      raise exception 'SYNC_RPC_REQUIRED' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.calendar_id, new.account_email) is distinct from (old.calendar_id, old.account_email) then
    -- Identity verification/mapping transfer belongs in the reconnect flow.
    new.connection_generation := gen_random_uuid(); new.sync_revision := 0;
    new.sync_token := null; new.sync_timezone := null;
    new.lease_owner := null; new.lease_until := null; new.lease_fence := old.lease_fence + 1;
  end if;
  return new;
end $$;
create trigger guard_google_task_connection before insert or update on public.google_calendar_connections
  for each row execute function public.guard_google_task_connection();

-- Shared authenticated account lock. No user_id argument can redirect an RPC.
create function public.google_task_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 21));
  if not exists (select 1 from public.google_task_sync_accounts where user_id = u and enabled) then
    raise exception 'TASK_SYNC_NOT_ENABLED' using errcode = '42501';
  end if;
  return u;
end $$;

-- General task writer. Full payload writes remain possible, but only against
-- the exact revision loaded by the caller. expected=0 means insert, NULL data delete.
create function public.write_task_revision(p_task_id text, p_expected_revision bigint, p_data jsonb,
  p_write_id uuid default null, p_expected_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; current_task public.tasks%rowtype; saved public.tasks%rowtype;
  receipt public.task_write_receipts%rowtype; request_body jsonb; result_body jsonb;
begin
  u := public.google_task_actor();
  if p_expected_user_id is not null and p_expected_user_id <> u then
    raise exception 'AUTH_ACCOUNT_CHANGED' using errcode = '42501';
  end if;
  request_body := jsonb_build_object('taskId',p_task_id,'expectedRevision',p_expected_revision,'data',p_data);
  if p_write_id is not null then
    select * into receipt from public.task_write_receipts where user_id=u and write_id=p_write_id;
    if found then
      if receipt.request <> request_body then raise exception 'WRITE_ID_REUSED' using errcode='22023'; end if;
      return receipt.result;
    end if;
  end if;
  if p_task_id is null or p_task_id = '' or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_TASK_WRITE' using errcode = '22023';
  end if;
  select * into current_task from public.tasks where user_id = u and id = p_task_id for update;
  if coalesce(current_task.revision, 0) <> p_expected_revision then
    raise exception 'TASK_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if p_data is null then
    if current_task.id is null then raise exception 'TASK_REVISION_CONFLICT' using errcode = '40001'; end if;
    update public.google_task_mappings set state = 'deleted' where user_id = u and task_id = p_task_id;
    insert into public.task_revision_tombstones values(u,p_task_id,current_task.revision)
      on conflict(user_id,task_id) do update set revision=excluded.revision;
    delete from public.tasks where user_id = u and id = p_task_id;
    result_body := jsonb_build_object('id', p_task_id, 'deleted', true);
    if p_write_id is not null then insert into public.task_write_receipts values(u,p_write_id,request_body,result_body); end if;
    return result_body;
  end if;
  if jsonb_typeof(p_data) <> 'object' or p_data->>'id' is distinct from p_task_id then
    raise exception 'INVALID_TASK_WRITE' using errcode = '22023';
  end if;
  if current_task.id is null then
    if exists (select 1 from public.google_task_mappings where user_id = u and task_id = p_task_id)
      or exists (select 1 from public.task_revision_tombstones where user_id = u and task_id = p_task_id) then
      raise exception 'TASK_ID_RETIRED' using errcode = '22023';
    end if;
    insert into public.tasks(id, user_id, data) values(p_task_id, u, p_data) returning * into saved;
  else
    update public.tasks set data = p_data where user_id = u and id = p_task_id returning * into saved;
  end if;
  if coalesce(p_data->>'deletedAt','') <> '' then
    update public.google_task_mappings set state='trashed' where user_id=u and task_id=p_task_id and state='active';
  end if;
  result_body := jsonb_build_object('id', saved.id, 'data', saved.data, 'revision', saved.revision);
  if p_write_id is not null then insert into public.task_write_receipts values(u,p_write_id,request_body,result_body); end if;
  return result_body;
end $$;

-- Task revision sync is account-scoped and continues after Google disconnect.
create function public.read_task_revision_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; result_body jsonb;
begin
  u := public.google_task_actor();
  select jsonb_build_object('userId',u,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data,'revision',revision))
      from public.tasks where user_id=u),'[]'::jsonb),
    'tombstones',coalesce((select jsonb_agg(task_id) from public.task_revision_tombstones where user_id=u),'[]'::jsonb))
    into result_body;
  return result_body;
end $$;

create function public.claim_google_task_sync(p_generation uuid, p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; c public.google_calendar_connections%rowtype;
begin
  u := public.google_task_actor();
  select * into c from public.google_calendar_connections where user_id = u for update;
  if p_owner is null or c.connection_generation is distinct from p_generation or c.sync_timezone is null then
    raise exception 'SYNC_CONNECTION_CHANGED' using errcode = '40001';
  end if;
  if c.lease_until > clock_timestamp() and c.lease_owner is distinct from p_owner then
    raise exception 'SYNC_BUSY' using errcode = '55P03';
  end if;
  update public.google_calendar_connections set
    lease_fence = case when lease_owner = p_owner and lease_until > clock_timestamp() then lease_fence else lease_fence + 1 end,
    lease_owner = p_owner, lease_until = clock_timestamp() + interval '120 seconds'
    where user_id = u returning * into c;
  return jsonb_build_object('generation', c.connection_generation, 'calendarId', c.calendar_id,
    'syncRevision', c.sync_revision, 'syncToken', c.sync_token, 'timezone', c.sync_timezone,
    'fence', c.lease_fence, 'leaseUntil', c.lease_until);
end $$;

create function public.release_google_task_sync(p_generation uuid, p_owner uuid, p_fence bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  u := public.google_task_actor();
  update public.google_calendar_connections set lease_owner=null,lease_until=null
    where user_id=u and connection_generation=p_generation and lease_owner=p_owner and lease_fence=p_fence;
  return found;
end $$;

-- Validate the only JSON fields an inbound patch may write.
create function public.valid_google_task_fields(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'object'
    and v ?& array['title','description','startDate','dueDate','startTime','endTime']
    and not exists (select 1 from jsonb_object_keys(v) k where k <> all(array['title','description','startDate','dueDate','startTime','endTime']))
    and not exists (select 1 from jsonb_each(v) f where jsonb_typeof(f.value) <> 'string'), false);
$$;

create function public.commit_google_task_inbound(
  p_generation uuid, p_calendar_id text, p_sync_revision bigint,
  p_owner uuid, p_fence bigint, p_pass_id uuid, p_next_sync_token text, p_entries jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid; c public.google_calendar_connections%rowtype; receipt public.google_task_inbound_passes%rowtype;
  entry jsonb; d jsonb; expected jsonb; t public.tasks%rowtype; m public.google_task_mappings%rowtype;
  eid text; kind text; tid text; fields jsonb; request_body jsonb; result_body jsonb;
  seen text[] := '{}'; changed jsonb := '[]'::jsonb;
begin
  u := public.google_task_actor();
  select * into c from public.google_calendar_connections where user_id = u for update;
  if c.connection_generation is distinct from p_generation or c.calendar_id is distinct from p_calendar_id then
    raise exception 'SYNC_CONNECTION_CHANGED' using errcode = '40001';
  end if;
  if p_pass_id is null or p_next_sync_token is null or p_next_sync_token = '' or jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'INVALID_SYNC_PASS' using errcode = '22023';
  end if;
  request_body := jsonb_build_object('calendarId', p_calendar_id, 'syncRevision', p_sync_revision,
    'owner', p_owner, 'fence', p_fence, 'nextSyncToken', p_next_sync_token, 'entries', p_entries);
  select * into receipt from public.google_task_inbound_passes where user_id = u and generation = p_generation and pass_id = p_pass_id;
  if found then
    if receipt.request <> request_body then raise exception 'PASS_ID_REUSED' using errcode = '22023'; end if;
    return receipt.result;
  end if;
  if c.sync_revision is distinct from p_sync_revision or c.lease_owner is distinct from p_owner or p_owner is null
      or c.lease_fence is distinct from p_fence or c.lease_until is null or c.lease_until <= clock_timestamp() then
    raise exception 'SYNC_PRECONDITION_FAILED' using errcode = '40001';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    eid := entry->>'eventId'; d := entry->'decision'; kind := d->>'kind';
    if eid is null or eid = '' or eid = any(seen) or entry->'source'->>'id' is distinct from eid
        or jsonb_typeof(entry->'source') is distinct from 'object'
        or jsonb_typeof(entry->'expected') is distinct from 'array' then
      raise exception 'INVALID_SYNC_ENTRY' using errcode = '22023';
    end if;
    seen := array_append(seen, eid);
    select * into m from public.google_task_mappings where user_id = u and generation = p_generation
      and calendar_id = p_calendar_id and event_id = eid for update;
    if jsonb_array_length(entry->'expected') > 1 then
      raise exception 'AMBIGUOUS_MAPPING_REQUIRES_MIGRATION' using errcode = '22023';
    end if;
    expected := entry->'expected'->0;
    if m.task_id is not null then
      if expected->>'taskId' is distinct from m.task_id then raise exception 'MAPPING_CHANGED' using errcode = '40001'; end if;
      select * into t from public.tasks where user_id = u and id = m.task_id for update;
      if m.state <> 'deleted' and (t.id is null or t.revision is distinct from (expected->>'revision')::bigint) then
        raise exception 'TASK_REVISION_CONFLICT' using errcode = '40001';
      end if;
    elsif expected is not null then
      raise exception 'MAPPING_CHANGED' using errcode = '40001';
    end if;
    if kind = 'create' then
      fields := d->'fields';
      if m.task_id is not null then raise exception 'MAPPING_CHANGED' using errcode = '40001'; end if;
      if not public.valid_google_task_fields(fields) or coalesce(d->>'listId', '') = '' then
        raise exception 'INVALID_SHARED_FIELDS' using errcode = '22023';
      end if;
      if not exists (select 1 from public.lists where user_id=u and id=d->>'listId'
          and data->>'kind'='inbox' and coalesce(data->>'archivedAt','')='' and coalesce(data->>'deletedAt','')='') then
        raise exception 'INBOX_CHANGED' using errcode = '40001';
      end if;
      if entry->'source'->>'status' = 'cancelled' or entry->'source' ?| array['recurringEventId','originalStartTime']
          or coalesce(jsonb_array_length(entry->'source'->'recurrence'),0)>0 then
        raise exception 'INVALID_PROMOTION' using errcode = '22023';
      end if;
      tid := gen_random_uuid()::text;
      insert into public.tasks(id,user_id,data) values(tid,u, fields || jsonb_build_object(
        'id',tid,'listId',d->>'listId','status','open','priority','none',
        'createdAt',clock_timestamp(),'updatedAt',clock_timestamp(),
        'googleEventId',eid,'googleEtag',entry->'source'->>'etag')) returning * into t;
      insert into public.google_task_mappings(user_id,generation,calendar_id,event_id,task_id,base,etag,source)
        values(u,p_generation,p_calendar_id,eid,tid,fields,entry->'source'->>'etag',entry->'source');
      changed := changed || jsonb_build_array(jsonb_build_object('id',t.id,'data',t.data,'revision',t.revision));
    elsif kind in ('update','acknowledge','keep-local','trash','conflict') then
      if m.task_id is null or m.state <> 'active' or t.id is null then
        raise exception 'MAPPING_CHANGED' using errcode = '40001';
      end if;
      if kind in ('update','acknowledge') then
        fields := case when kind = 'update' then d->'fields' else d->'base' end;
        if not public.valid_google_task_fields(fields) then raise exception 'INVALID_SHARED_FIELDS' using errcode = '22023'; end if;
        if kind = 'update' then
          update public.tasks set data = data || fields || jsonb_build_object('updatedAt',clock_timestamp())
            where user_id = u and id = m.task_id returning * into t;
          changed := changed || jsonb_build_array(jsonb_build_object('id',t.id,'data',t.data,'revision',t.revision));
        end if;
        update public.google_task_mappings set base = fields, etag = entry->'source'->>'etag', source = entry->'source'
          where user_id=u and generation=p_generation and calendar_id=p_calendar_id and event_id=eid;
      elsif kind = 'trash' then
        if entry->'source'->>'status' is distinct from 'cancelled' or
            entry->'source' ?| array['recurringEventId','originalStartTime'] then
          raise exception 'INVALID_CANCELLATION' using errcode = '22023';
        end if;
        update public.tasks set data = data || jsonb_build_object('deletedAt',clock_timestamp(),'updatedAt',clock_timestamp())
          where user_id = u and id = m.task_id returning * into t;
        update public.google_task_mappings set state='trashed', source=entry->'source'
          where user_id=u and generation=p_generation and calendar_id=p_calendar_id and event_id=eid;
        changed := changed || jsonb_build_array(jsonb_build_object('id',t.id,'data',t.data,'revision',t.revision));
      elsif kind = 'conflict' then
        if not public.valid_google_task_fields(d->'local') or not public.valid_google_task_fields(d->'remote') then
          raise exception 'INVALID_CONFLICT' using errcode = '22023';
        end if;
      end if;
      -- keep-local/conflict do not advance base, etag, or googleSyncedAt.
    elsif kind not in ('skip','review') or kind is null or coalesce(d->>'reason','') = '' then
      raise exception 'INVALID_SYNC_DECISION' using errcode = '22023';
    end if;
    insert into public.google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision)
      values(u,p_generation,p_calendar_id,eid,entry->'source',d)
      on conflict(user_id,generation,calendar_id,event_id) do update set
        source=excluded.source,decision=excluded.decision,revision=public.google_task_inbound_records.revision+1,updated_at=clock_timestamp();
  end loop;
  if c.lease_until <= clock_timestamp() then
    raise exception 'SYNC_LEASE_EXPIRED' using errcode = '40001';
  end if;
  update public.google_calendar_connections set sync_token=p_next_sync_token,sync_revision=sync_revision+1
    where user_id=u returning * into c;
  result_body := jsonb_build_object('syncRevision',c.sync_revision,'syncToken',c.sync_token,'tasks',changed);
  insert into public.google_task_inbound_passes values(u,p_generation,p_pass_id,request_body,result_body);
  return result_body;
end $$;

-- One statement returns a consistent account-scoped read for planning. It is
-- not a replacement for commit-time preconditions: local edits may follow it.
create function public.read_google_task_sync_snapshot(p_generation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; result_body jsonb;
begin
  u := public.google_task_actor();
  select jsonb_build_object(
    'generation',c.connection_generation,'calendarId',c.calendar_id,
    'syncRevision',c.sync_revision,'syncToken',c.sync_token,'timezone',c.sync_timezone,
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'data',t.data,'revision',t.revision))
      from public.tasks t where t.user_id=u),'[]'::jsonb),
    'mappings',coalesce((select jsonb_agg(to_jsonb(m)-'user_id') from public.google_task_mappings m
      where m.user_id=u and m.generation=p_generation and m.calendar_id=c.calendar_id),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(to_jsonb(r)-'user_id') from public.google_task_inbound_records r
      where r.user_id=u and r.generation=p_generation and r.calendar_id=c.calendar_id),'[]'::jsonb)
  ) into result_body from public.google_calendar_connections c
    where c.user_id=u and c.connection_generation=p_generation;
  if result_body is null then raise exception 'SYNC_CONNECTION_CHANGED' using errcode='40001'; end if;
  return result_body;
end $$;

revoke all on function public.google_task_actor() from public, anon, authenticated, service_role;
revoke all on function public.valid_google_task_fields(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.write_task_revision(text,bigint,jsonb,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_task_revision_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.claim_google_task_sync(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_google_task_sync(uuid,uuid,bigint) from public, anon, authenticated, service_role;
revoke all on function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.read_google_task_sync_snapshot(uuid) from public, anon, authenticated, service_role;
grant execute on function public.write_task_revision(text,bigint,jsonb,uuid,uuid) to authenticated;
grant execute on function public.read_task_revision_snapshot() to authenticated;
grant execute on function public.claim_google_task_sync(uuid,uuid) to authenticated;
grant execute on function public.release_google_task_sync(uuid,uuid,bigint) to authenticated;
grant execute on function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) to authenticated;
grant execute on function public.read_google_task_sync_snapshot(uuid) to authenticated;
commit;
