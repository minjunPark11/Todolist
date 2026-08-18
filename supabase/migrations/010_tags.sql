-- Tags, and the join that connects them to tasks (TickTick plan §6.45).
--
-- A tag used to be a bare string inside a task's `data`. That works until the
-- tag itself has to be a thing: renamed, coloured, or the subject of its own
-- Scope (§12.10). Renaming a string means rewriting every task that carries
-- it; renaming a record touches one row.
--
-- `task_tags` is the many-to-many. §6.46 asks for UNIQUE(taskId, tagId): the
-- client derives the record id from both ends, so the pair cannot produce two
-- rows, and the primary key below is what enforces it here.
--
-- The task's own `tags` array is NOT removed. Both are true at once until the
-- plan's Migration Phase 6 (§6.74) picks one source of truth, so an older
-- client keeps reading the strings it knows.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- Both are optional client-side (optionalRemoteTables in buildSyncPlan.ts), so
-- an account whose project has not run this migration keeps syncing the rest.

create table if not exists public.tags (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.task_tags (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_tags_updated_at on public.tags;
create trigger set_tags_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

drop trigger if exists set_task_tags_updated_at on public.task_tags;
create trigger set_task_tags_updated_at
  before update on public.task_tags
  for each row execute function public.set_updated_at();

alter table public.tags enable row level security;
alter table public.task_tags enable row level security;

drop policy if exists "Users can read own tags" on public.tags;
create policy "Users can read own tags"
  on public.tags for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own tags" on public.tags;
create policy "Users can insert own tags"
  on public.tags for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own tags" on public.tags;
create policy "Users can update own tags"
  on public.tags for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own tags" on public.tags;
create policy "Users can delete own tags"
  on public.tags for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own task tags" on public.task_tags;
create policy "Users can read own task tags"
  on public.task_tags for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own task tags" on public.task_tags;
create policy "Users can insert own task tags"
  on public.task_tags for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own task tags" on public.task_tags;
create policy "Users can update own task tags"
  on public.task_tags for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own task tags" on public.task_tags;
create policy "Users can delete own task tags"
  on public.task_tags for delete using (auth.uid() = user_id);
