-- Deploy after the focus-v2 clients. Reads and existing ownership policies stay intact.
-- This is a client compatibility gate, not an authentication credential.
-- Accounts without any v2 focus records are unaffected. Service-role maintenance
-- and the server repository bypass RLS as before and must use the shared normalizer.
create or replace function public.focus_v2_writer_allowed()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-focusflow-focus-schema', '') = '2'
    or not exists (
      select 1 from public.focus_sessions
      where user_id = auth.uid() and data ->> 'schemaVersion' = '2'
    );
$$;

-- A legacy client can update task totals before trying to write the focus row,
-- so protecting only focus_sessions would still permit partial old-format writes.
do $$
declare target text;
begin
  foreach target in array array['tasks', 'focus_sessions', 'settings'] loop
    execute format('drop policy if exists focus_v2_insert_guard on public.%I', target);
    execute format('drop policy if exists focus_v2_update_guard on public.%I', target);
    execute format('drop policy if exists focus_v2_delete_guard on public.%I', target);
    execute format('create policy focus_v2_insert_guard on public.%I as restrictive for insert to authenticated with check (public.focus_v2_writer_allowed())', target);
    execute format('create policy focus_v2_update_guard on public.%I as restrictive for update to authenticated using (public.focus_v2_writer_allowed()) with check (public.focus_v2_writer_allowed())', target);
    execute format('create policy focus_v2_delete_guard on public.%I as restrictive for delete to authenticated using (public.focus_v2_writer_allowed())', target);
  end loop;
end $$;
