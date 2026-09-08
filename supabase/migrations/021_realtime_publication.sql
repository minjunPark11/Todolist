-- Let the account tell a device that something changed
-- (MULTI_DEVICE_SYNC_DESIGN.md §3.2).
--
-- Supabase Realtime only forwards `postgres_changes` for tables in the
-- `supabase_realtime` publication. Without this the client subscribes happily,
-- receives nothing, and the only sign of it is that the app feels exactly as
-- stale as it did before — which is why it is a migration and not a setting
-- somebody remembers to tick.
--
-- What the client does with these events is ring a doorbell: it re-reads the
-- account through the path it already had. Nothing here needs the row contents
-- to be right or complete, and RLS still decides who is allowed to hear them.
do $$
declare
  target text;
begin
  foreach target in array array[
    'settings',
    'tasks',
    'projects',
    'subtasks',
    'focus_sessions',
    'learning_paths',
    'spaces',
    'folders',
    'lists',
    'sidebar_folders',
    'list_sections',
    'saved_filters',
    'daily_plans',
    'tags',
    'task_tags',
    'check_items',
    'reminders',
    'task_templates'
  ]
  loop
    -- The table may not exist (the optional ones arrived after the original
    -- schema) and it may already be published (this migration re-running, or a
    -- project where it was added by hand). Neither is a reason to fail.
    if to_regclass('public.' || target) is null then
      continue;
    end if;
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      continue;
    end if;
    execute format('alter publication supabase_realtime add table public.%I', target);
  end loop;
end;
$$;
