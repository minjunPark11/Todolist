-- Administrative, pre-activation import only. Historical ownership evidence must
-- be independently verified by the caller; no client can invoke this function.
begin;
create table public.google_legacy_mapping_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  import_id uuid not null,
  request jsonb not null,
  primary key(user_id,generation,import_id)
);
alter table public.google_legacy_mapping_imports enable row level security;
revoke all on public.google_legacy_mapping_imports from public,anon,authenticated,service_role;

create function public.import_google_legacy_mappings(
  p_user_id uuid, p_generation uuid, p_calendar_id text, p_import_id uuid, p_entries jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.google_task_sync_accounts%rowtype;
  c public.google_calendar_connections%rowtype;
  saved jsonb; entry jsonb; actual jsonb; t public.tasks%rowtype;
begin
  if p_user_id is null or p_generation is null or p_import_id is null or
    coalesce(p_calendar_id,'')='' or jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'INVALID_IMPORT' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into c from public.google_calendar_connections where user_id=p_user_id for update;
  if not found or c.connection_generation<>p_generation or c.calendar_id<>p_calendar_id then
    raise exception 'STALE_IMPORT_SCOPE' using errcode='40001';
  end if;
  select request into saved from public.google_legacy_mapping_imports
    where user_id=p_user_id and generation=p_generation and import_id=p_import_id;
  if found then
    if saved is distinct from p_entries then raise exception 'IMPORT_ID_REUSED' using errcode='22023'; end if;
    return jsonb_build_object('importId',p_import_id,'replayed',true);
  end if;
  select * into a from public.google_task_sync_accounts where user_id=p_user_id for update;
  if not found or a.enabled or a.minimum_google_protocol<>2 or a.google_protocol_cutover_at is null
    or a.google_protocol_cutover_at+interval '65 minutes'>clock_timestamp()
    or coalesce(a.legacy_google_token_valid_until+interval '5 minutes','-infinity'::timestamptz)>clock_timestamp()
    or coalesce(c.lease_until,'-infinity'::timestamptz)>clock_timestamp() then
    raise exception 'IMPORT_REQUIRES_DRAINED_INACTIVE_ACCOUNT' using errcode='42501';
  end if;
  -- Legacy writers do not use advisory locks. A short table SHARE lock prevents
  -- phantom duplicate IDs during this admin transaction. Never do network I/O here.
  lock table public.tasks in share mode;
  if exists(select 1 from jsonb_array_elements(p_entries) e group by e->>'eventId' having count(*)>1) then
    raise exception 'DUPLICATE_IMPORT_EVENT' using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if coalesce(entry->>'eventId','')='' or jsonb_typeof(entry->'expected') is distinct from 'array'
      or coalesce(entry->'decision'->>'kind','') not in ('register','review') then
      raise exception 'INVALID_IMPORT_ENTRY' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('taskId',id,'revision',revision) order by id),'[]'::jsonb)
      into actual from public.tasks where user_id=p_user_id and data->>'googleEventId'=entry->>'eventId';
    if jsonb_array_length(actual)=0 or actual is distinct from
      (select jsonb_agg(v order by v->>'taskId') from jsonb_array_elements(entry->'expected') v) then
      raise exception 'STALE_IMPORT_TASKS' using errcode='40001';
    end if;
    if entry->'decision'->>'kind'='register' then
      if jsonb_array_length(actual)<>1 or actual->0->>'taskId' is distinct from entry->'decision'->>'taskId'
        or length(btrim(coalesce(entry->'decision'->>'evidenceRef','')))=0
        or entry->'source'->>'id' is distinct from entry->>'eventId'
        or entry->'source' ? 'recurringEventId' or entry->'source' ? 'originalStartTime' then
        raise exception 'UNVERIFIED_IMPORT_MAPPING' using errcode='22023';
      end if;
      if exists(select 1 from public.google_task_mappings where user_id=p_user_id and generation=p_generation
        and calendar_id=p_calendar_id and (event_id=entry->>'eventId' or task_id=entry->'decision'->>'taskId')) then
        raise exception 'EXISTING_IMPORT_MAPPING' using errcode='40001';
      end if;
      select * into t from public.tasks where user_id=p_user_id and id=entry->'decision'->>'taskId';
      insert into public.google_task_mappings(user_id,generation,calendar_id,event_id,task_id,state,source)
        values(p_user_id,p_generation,p_calendar_id,entry->>'eventId',t.id,
          case when coalesce(t.data->>'deletedAt','')<>'' then 'trashed' else 'active' end,entry->'source');
      -- Intentionally no base/etag/Task patch: old googleSyncedAt proves no content agreement.
    else
      insert into public.google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision)
        values(p_user_id,p_generation,p_calendar_id,entry->>'eventId',
          coalesce(entry->'source',jsonb_build_object('id',entry->>'eventId')),
          jsonb_build_object('kind','review','reason','ambiguous-mapping','legacyReason',entry->'decision'->>'reason',
            'taskIds',(select jsonb_agg(v->>'taskId') from jsonb_array_elements(actual) v)));
    end if;
  end loop;
  insert into public.google_legacy_mapping_imports values(p_user_id,p_generation,p_import_id,p_entries);
  return jsonb_build_object('importId',p_import_id,'replayed',false);
end $$;
revoke all on function public.import_google_legacy_mappings(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_google_legacy_mappings(uuid,uuid,text,uuid,jsonb) to service_role;
commit;
