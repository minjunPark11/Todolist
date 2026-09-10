-- Automatic field merge, validated at the transaction boundary. No account activation.
begin;
create function public.merge_google_task_fields(b jsonb,l jsonb,r jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; keys text[]; key text;
begin
  if not public.valid_google_task_fields(b) or not public.valid_google_task_fields(l) or not public.valid_google_task_fields(r) then return null; end if;
  b:=public.google_task_shared_fields(b); l:=public.google_task_shared_fields(l); r:=public.google_task_shared_fields(r); result:=l;
  foreach keys slice 1 in array array[['title','','',''],['description','','',''],['startDate','dueDate','startTime','endTime']] loop
    keys:=array_remove(keys,'');
    if (select bool_and(l->k is not distinct from r->k) from unnest(keys) k)
       or (select bool_and(r->k is not distinct from b->k) from unnest(keys) k) then continue;end if;
    if not (select bool_and(l->k is not distinct from b->k) from unnest(keys) k) then return null;end if;
    foreach key in array keys loop result:=jsonb_set(result,array[key],r->key);end loop;
  end loop;
  return result;
end $$;
revoke all on function public.merge_google_task_fields(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Keep connected task versions for 30 days, including the local side before a merge.
create table public.google_task_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null, revision bigint not null, data jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,task_id,revision)
);
create index google_task_versions_recent on public.google_task_versions(user_id,created_at desc);
alter table public.google_task_versions enable row level security;
create policy own_read on public.google_task_versions for select to authenticated using(user_id=auth.uid());
revoke all on public.google_task_versions from public,anon,authenticated,service_role;
grant select on public.google_task_versions to authenticated;
create function public.save_google_task_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.data is distinct from new.data and exists(select 1 from public.google_task_mappings where user_id=old.user_id and task_id=old.id) then
    insert into public.google_task_versions(user_id,task_id,revision,data) values(old.user_id,old.id,old.revision,old.data) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.save_google_task_version() from public,anon,authenticated,service_role;
create trigger save_google_task_version after update on public.tasks for each row execute function public.save_google_task_version();

do $$
declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.commit_google_task_inbound_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb)'::regprocedure);
  changed:=replace(definition,$s$kind in ('update','acknowledge','keep-local','trash','conflict')$s$,$s$kind in ('update','merge','acknowledge','keep-local','trash','conflict')$s$);
  changed:=replace(changed,$s$kind in ('update','acknowledge')$s$,$s$kind in ('update','merge','acknowledge')$s$);
  changed:=replace(changed,$s$kind = 'update'$s$,$s$kind in ('update','merge')$s$);
  changed:=replace(changed,$s$if kind in ('update','merge') then$s$, $code$if kind='merge' and (d->'fields' is distinct from public.merge_google_task_fields(m.base,public.google_task_shared_fields(t.data),d->'remote')
          or public.merge_google_task_fields(m.base,public.google_task_shared_fields(t.data),d->'remote') is null) then
          raise exception 'INVALID_AUTOMATIC_MERGE' using errcode='40001'; end if;
        if kind in ('update','merge') then$code$);
  changed:=replace(changed,'set base = fields, etag',$s$set base = case when kind='merge' then d->'remote' else fields end, etag$s$);
  changed:=replace(changed,'-- keep-local/conflict do not advance base',$s$if kind='merge' then d:=jsonb_build_object('kind','keep-local','autoMerged',true);end if;
      -- keep-local/conflict do not advance base$s$);
  if changed=definition or position('INVALID_AUTOMATIC_MERGE' in changed)=0 then raise exception 'MERGE_CORE_DRIFT';end if;
  execute changed;
end $$;

alter function public.prune_google_task_history(uuid) rename to prune_google_task_history_versions_core;
revoke all on function public.prune_google_task_history_versions_core(uuid) from public,anon,authenticated,service_role;
create function public.prune_google_task_history(p_user_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; k integer;
begin
 n:=public.prune_google_task_history_versions_core(p_user_id);
 delete from public.google_task_versions where user_id=p_user_id and created_at<clock_timestamp()-interval '30 days';
 get diagnostics k=row_count;return n+k;
end $$;
revoke all on function public.prune_google_task_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prune_google_task_history(uuid) to service_role;
commit;
