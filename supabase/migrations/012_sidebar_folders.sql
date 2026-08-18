-- The Tasks sidebar's own grouping of Lists (TickTick plan §6.33-§6.35, D18).
--
-- Not the domain `folders` table. That one is a level inside a Project and
-- says where a List belongs; this one says where the user wants to SEE it,
-- and one group happily spans two Projects. Moving a List between groups
-- writes `sidebarFolderId` on the list row and changes nothing about the
-- Project above it (D19), so nothing below the List is ever rewritten.
--
-- Groups Lists only (§6.35) and does not nest, so there is no parent column
-- to add here — every field lives in `data` as with every other collection.
--
-- Optional client-side (optionalRemoteTables in buildSyncPlan.ts), so an
-- account whose project has not run this migration keeps syncing the rest.

create table if not exists public.sidebar_folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_sidebar_folders_updated_at on public.sidebar_folders;
create trigger set_sidebar_folders_updated_at
  before update on public.sidebar_folders
  for each row execute function public.set_updated_at();

alter table public.sidebar_folders enable row level security;

drop policy if exists "Users can read own sidebar folders" on public.sidebar_folders;
create policy "Users can read own sidebar folders"
  on public.sidebar_folders for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own sidebar folders" on public.sidebar_folders;
create policy "Users can insert own sidebar folders"
  on public.sidebar_folders for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own sidebar folders" on public.sidebar_folders;
create policy "Users can update own sidebar folders"
  on public.sidebar_folders for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own sidebar folders" on public.sidebar_folders;
create policy "Users can delete own sidebar folders"
  on public.sidebar_folders for delete using (auth.uid() = user_id);
