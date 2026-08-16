-- Spaces (SPACES_REDESIGN_II.md §4, §36, H-INV-01).
--
-- The work area several Projects belong to — the level that was missing, and
-- the only structural change this redesign makes. `Project.spaceId` carries
-- the relation and rides inside the existing `projects.data` jsonb, so no
-- other table changes: moving a Project between Spaces is one row, and the
-- Folders, Lists and Tasks beneath it are never rewritten (H-INV-05).
--
-- Deliberately NOT a foreign key to a `space_id` column. Every collection here
-- stores its record as jsonb, so the relation lives where the rest of the
-- record does; a column plus an FK would be the only cross-table constraint in
-- the schema, and it would make an ordinary save fail whenever the two tables
-- reached the account in the wrong order. H-INV-06 (a Space with Projects
-- cannot be deleted) is enforced in the client, where it can explain itself.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb —
-- so a space gaining a field needs no schema change. The client treats this
-- table as optional (optionalRemoteTables in buildSyncPlan.ts), so an account
-- whose project has not run this migration keeps syncing everything else
-- instead of failing every save.

create table if not exists public.spaces (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_spaces_updated_at on public.spaces;
create trigger set_spaces_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();

alter table public.spaces enable row level security;

drop policy if exists "Users can read own spaces" on public.spaces;
create policy "Users can read own spaces"
  on public.spaces for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own spaces" on public.spaces;
create policy "Users can insert own spaces"
  on public.spaces for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own spaces" on public.spaces;
create policy "Users can update own spaces"
  on public.spaces for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own spaces" on public.spaces;
create policy "Users can delete own spaces"
  on public.spaces for delete using (auth.uid() = user_id);
