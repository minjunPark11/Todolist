-- Folders (SPACES_CLICKUP_REDESIGN.md §4, D4).
--
-- The optional middle level of Space -> Folder? -> List. A List may sit
-- straight under a Space, so this table stays empty until someone actually
-- groups something — the hierarchy costs nothing to anyone not using it.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb —
-- so a folder gaining a field needs no schema change. The client treats this
-- table as optional (optionalRemoteTables in buildSyncPlan.ts), so an account
-- whose project has not run this migration keeps syncing everything else
-- instead of failing every save.

create table if not exists public.folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_folders_updated_at on public.folders;
create trigger set_folders_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

alter table public.folders enable row level security;

drop policy if exists "Users can read own folders" on public.folders;
create policy "Users can read own folders"
  on public.folders for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own folders" on public.folders;
create policy "Users can insert own folders"
  on public.folders for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own folders" on public.folders;
create policy "Users can update own folders"
  on public.folders for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own folders" on public.folders;
create policy "Users can delete own folders"
  on public.folders for delete using (auth.uid() = user_id);
