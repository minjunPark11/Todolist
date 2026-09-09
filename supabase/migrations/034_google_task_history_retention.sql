-- Compact resolved comparison copies, retaining request/result fingerprints and operation IDs.
begin;
create function public.google_task_receipt_digest(v jsonb) returns jsonb
language sql immutable strict set search_path='' as $$
  select jsonb_build_object('$googleReceiptDigest',encode(sha256(convert_to(v::text,'UTF8')),'hex'));
$$;
create function public.google_task_receipt_matches(saved jsonb,incoming jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(saved)='object' and saved ? '$googleReceiptDigest'
    and saved-'$googleReceiptDigest'='{}'::jsonb then saved=public.google_task_receipt_digest(incoming)
    else saved is not distinct from incoming end;
$$;
revoke all on function public.google_task_receipt_digest(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.google_task_receipt_matches(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Change only receipt comparisons in the known entry points and private cores. Fail closed on drift.
do $$
declare signature text;definition text;replacement text;
begin
  foreach signature in array array[
    'public.reserve_google_task_outbound(uuid,jsonb)',
    'public.reserve_google_task_event(uuid,jsonb)',
    'public.reserve_google_task_recurrence(uuid,jsonb)',
    'public.resolve_google_task_review(uuid,jsonb)',
    'public.commit_google_task_inbound_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb)',
    'public.finish_google_task_outbound(uuid,uuid,uuid,text,jsonb,jsonb)',
    'public.finish_google_task_patch(uuid,uuid,uuid,text,jsonb,jsonb)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    replacement:=replace(definition,'op.request is distinct from p_request','not public.google_task_receipt_matches(op.request,p_request)');
    replacement:=replace(replacement,'receipt.request is distinct from p_request','not public.google_task_receipt_matches(receipt.request,p_request)');
    replacement:=replace(replacement,'receipt.request <> request_body','not public.google_task_receipt_matches(receipt.request,request_body)');
    replacement:=replace(replacement,'op.result is distinct from answer','not public.google_task_receipt_matches(op.result,answer)');
    replacement:=replace(replacement,'op.result=answer','public.google_task_receipt_matches(op.result,answer)');
    if replacement=definition then raise exception 'RECEIPT_FUNCTION_CHANGED: %',signature;end if;
    execute replacement;
  end loop;
end $$;

alter table public.google_task_outbound_operations add column resolved_at timestamptz;
update public.google_task_outbound_operations set resolved_at=clock_timestamp() where state in ('completed','aborted');
create function public.google_task_operation_resolved() returns trigger language plpgsql set search_path='' as $$
begin
  if new.state in ('completed','aborted') and new.resolved_at is null then new.resolved_at:=clock_timestamp();end if;
  return new;
end $$;
create trigger google_task_operation_resolved before insert or update on public.google_task_outbound_operations
  for each row execute function public.google_task_operation_resolved();
alter table public.google_task_inbound_passes add column created_at timestamptz not null default clock_timestamp();
alter table public.google_task_inbound_records add column resolved_at timestamptz;
update public.google_task_inbound_records set resolved_at=clock_timestamp() where decision->>'kind' not in ('conflict','review');
create function public.google_task_record_resolved() returns trigger language plpgsql set search_path='' as $$
begin
  if new.decision->>'kind' in ('conflict','review') then new.resolved_at:=null;
  elsif new.resolved_at is null then new.resolved_at:=clock_timestamp();end if;
  return new;
end $$;
create trigger google_task_record_resolved before insert or update on public.google_task_inbound_records
  for each row execute function public.google_task_record_resolved();

create function public.prune_google_task_history(p_user_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz:=clock_timestamp()-interval '30 days';n integer:=0;k integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  update public.google_task_outbound_operations o set request=public.google_task_receipt_digest(o.request),
    result=public.google_task_receipt_digest(o.result),desired='{}',remote='{}',repeat_task=null
    where o.user_id=p_user_id and o.state in ('completed','aborted') and o.resolved_at<cutoff
      and not(o.request ? '$googleReceiptDigest') and not exists(select 1 from public.google_task_inbound_records r
        where r.user_id=o.user_id and r.generation=o.generation and r.event_id=o.event_id
        and (r.resolved_at is null or r.resolved_at>=cutoff));
  get diagnostics k=row_count;n:=n+k;
  update public.google_task_review_receipts o set request=public.google_task_receipt_digest(o.request),
    result=(o.result-'decision')||jsonb_build_object('historyCompacted',true)
    where o.user_id=p_user_id and o.created_at<cutoff and not(o.request ? '$googleReceiptDigest')
      and not exists(select 1 from public.google_task_inbound_records r where r.user_id=o.user_id
        and r.generation::text=o.request->>'generation' and r.event_id=o.request->>'eventId'
        and (r.resolved_at is null or r.resolved_at>=cutoff));
  get diagnostics k=row_count;n:=n+k;
  update public.google_task_inbound_passes o set request=public.google_task_receipt_digest(o.request),
    result=(o.result-'tasks')||jsonb_build_object('tasks','[]'::jsonb,'historyCompacted',true)
    where o.user_id=p_user_id and o.created_at<cutoff and not(o.request ? '$googleReceiptDigest')
      and not exists(select 1 from jsonb_array_elements(o.request->'entries') e join public.google_task_inbound_records r
        on r.user_id=o.user_id and r.generation=o.generation and r.event_id=e->>'eventId'
        where r.resolved_at is null or r.resolved_at>=cutoff);
  get diagnostics k=row_count;return n+k;
end $$;
revoke all on function public.prune_google_task_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prune_google_task_history(uuid) to service_role;

-- Active accounts clean up automatically on snapshot reads, without a browser-supplied cutoff.
alter function public.read_google_task_sync_snapshot(uuid) rename to read_google_task_sync_snapshot_retention_core;
revoke all on function public.read_google_task_sync_snapshot_retention_core(uuid) from public,anon,authenticated,service_role;
create function public.read_google_task_sync_snapshot(p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
  u:=public.google_task_actor();perform public.prune_google_task_history(u);
  return public.read_google_task_sync_snapshot_retention_core(p_generation);
end $$;
revoke all on function public.read_google_task_sync_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_google_task_sync_snapshot(uuid) to authenticated;

create function public.prune_all_google_task_history() returns integer
language plpgsql security definer set search_path='' as $$
declare u uuid;n integer:=0;
begin
  for u in select user_id from public.google_task_sync_accounts order by user_id loop
    n:=n+public.prune_google_task_history(u);
  end loop;
  return n;
end $$;
revoke all on function public.prune_all_google_task_history() from public,anon,authenticated,service_role;
grant execute on function public.prune_all_google_task_history() to service_role;
-- Supabase Cron, when installed, also covers accounts that do not open the app.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $job$select cron.schedule('google-task-history-retention','17 3 * * *','select public.prune_all_google_task_history()')$job$;
  end if;
end $$;
commit;
