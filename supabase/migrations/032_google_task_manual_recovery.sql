begin;
create table public.google_task_recovery_audit (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,evidence text not null,previous_state text not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.google_task_recovery_audit enable row level security;
revoke all on public.google_task_recovery_audit from public,anon,authenticated,service_role;
-- DB owner only. Evidence must identify termination of the old invocation and the verified remote outcome.
-- Use normal GET reconciliation first. Never use this for an event that exists but is not yet mapped.
create function public.recover_google_task_no_write(p_user_id uuid,p_operation_id uuid,p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype;
begin
  if length(btrim(coalesce(p_evidence,'')))<12 then raise exception 'RECOVERY_EVIDENCE_REQUIRED';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  if op.state is null or op.state not in ('reserved','running','uncertain') then raise exception 'OPERATION_NOT_PENDING';end if;
  insert into public.google_task_recovery_audit(user_id,operation_id,evidence,previous_state) values(p_user_id,p_operation_id,p_evidence,op.state);
  update public.google_task_outbound_operations set state='aborted',result=jsonb_build_object('reason','verified-no-write','evidence',p_evidence)
    where user_id=p_user_id and operation_id=p_operation_id;
end $$;
revoke all on function public.recover_google_task_no_write(uuid,uuid,text) from public,anon,authenticated,service_role;
commit;
