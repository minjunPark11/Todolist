begin;
create table public.google_task_restore_receipts (
 user_id uuid not null references auth.users(id) on delete cascade, write_id uuid not null,
 version_id uuid not null, expected_revision bigint not null, result jsonb not null, primary key(user_id,write_id)
);
alter table public.google_task_restore_receipts enable row level security;
revoke all on public.google_task_restore_receipts from public,anon,authenticated,service_role;
create function public.restore_google_task_version(p_version_id uuid,p_expected_revision bigint,p_write_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;v public.google_task_versions%rowtype;t public.tasks%rowtype;r public.google_task_restore_receipts%rowtype;answer jsonb;patch jsonb;
begin
 u:=public.google_task_actor();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,21));
 select * into r from public.google_task_restore_receipts where user_id=u and write_id=p_write_id;
 if found then
  if r.version_id is distinct from p_version_id or r.expected_revision is distinct from p_expected_revision then raise exception 'WRITE_ID_REUSED' using errcode='22023';end if;
  return r.result;
 end if;
 if p_write_id is null then raise exception 'WRITE_ID_REQUIRED' using errcode='22023';end if;
 select * into v from public.google_task_versions where user_id=u and id=p_version_id and created_at>=clock_timestamp()-interval '30 days';
 if not found then raise exception 'VERSION_UNAVAILABLE' using errcode='40001';end if;
 select * into t from public.tasks where user_id=u and id=v.task_id for update;
 if not found or t.revision is distinct from p_expected_revision or coalesce(t.data->>'deletedAt','')<>'' then raise exception 'TASK_REVISION_CONFLICT' using errcode='40001';end if;
 patch:=public.google_task_shared_fields(v.data)||jsonb_build_object('repeatType',coalesce(v.data->>'repeatType','none'),
   'repeatInterval',coalesce(v.data->'repeatInterval','1'::jsonb),'repeatDays',coalesce(v.data->'repeatDays','[]'::jsonb),'repeatEndDate',coalesce(v.data->>'repeatEndDate',''));
 answer:=public.write_task_revision(t.id,t.revision,t.data||patch||jsonb_build_object('updatedAt',clock_timestamp()),p_write_id,u);
 insert into public.google_task_restore_receipts values(u,p_write_id,p_version_id,p_expected_revision,answer);
 return answer;
end $$;
revoke all on function public.restore_google_task_version(uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.restore_google_task_version(uuid,bigint,uuid) to authenticated;
commit;
