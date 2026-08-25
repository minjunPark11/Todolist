-- Saved Task shapes, reusable (Task Detail spec §25.8).
--
-- A template is not a Task. §25.8 draws that line: Duplicate makes a Task now,
-- this makes a definition to make Tasks from later, and the Task it was saved
-- from goes on existing untouched. Storing them in `tasks` with a flag would
-- put a row that is not work into every query that asks for work.
--
-- The whole shape rides in `data.items` as one array. Unlike the checklist —
-- which §11.3 keeps out of the Task's jsonb because every tick would rewrite
-- the Task — a template's items are never edited one at a time. It is written
-- once when saved and read whole when used, so an array is the honest shape
-- and a second table would be rows nothing ever addresses individually.
--
-- Nothing inside points at another record: no Task id, no List, no Tag id, no
-- dates. That is what lets a template outlive the Task it came from, survive
-- the List being archived, and still mean something in March.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- Optional client-side (optionalRemoteTables in buildSyncPlan.ts), so an
-- account whose project has not run this migration keeps syncing the rest.

create table if not exists public.task_templates (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_task_templates_updated_at on public.task_templates;
create trigger set_task_templates_updated_at
  before update on public.task_templates
  for each row execute function public.set_updated_at();

alter table public.task_templates enable row level security;

drop policy if exists "Users can read own task templates" on public.task_templates;
create policy "Users can read own task templates"
  on public.task_templates for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own task templates" on public.task_templates;
create policy "Users can insert own task templates"
  on public.task_templates for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own task templates" on public.task_templates;
create policy "Users can update own task templates"
  on public.task_templates for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own task templates" on public.task_templates;
create policy "Users can delete own task templates"
  on public.task_templates for delete using (auth.uid() = user_id);
