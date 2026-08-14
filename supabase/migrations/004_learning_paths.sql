-- Learning Paths (Horizons page, HORIZONS_DESIGN.md D3).
--
-- Goals used to live in a device-local blob outside the synced dataset. Once
-- they became a first-class page they had to sync: a goal you cannot see on
-- your other device is not a goal.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb —
-- so the nested milestones ride along inside `data` and no schema change is
-- needed when a milestone gains a field. The client treats this table as
-- optional (optionalRemoteTables in buildSyncPlan.ts), so an account whose
-- project has not run this migration keeps syncing everything else instead of
-- failing every save.

create table if not exists public.learning_paths (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_learning_paths_updated_at on public.learning_paths;
create trigger set_learning_paths_updated_at
  before update on public.learning_paths
  for each row execute function public.set_updated_at();

alter table public.learning_paths enable row level security;

drop policy if exists "Users can read own learning_paths" on public.learning_paths;
create policy "Users can read own learning_paths"
  on public.learning_paths for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own learning_paths" on public.learning_paths;
create policy "Users can insert own learning_paths"
  on public.learning_paths for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own learning_paths" on public.learning_paths;
create policy "Users can update own learning_paths"
  on public.learning_paths for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own learning_paths" on public.learning_paths;
create policy "Users can delete own learning_paths"
  on public.learning_paths for delete using (auth.uid() = user_id);
