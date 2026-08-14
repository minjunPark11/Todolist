-- Space notes (SPACES_CLICKUP_REDESIGN.md D9, migration M1).
--
-- Notes were the last user *writing* still trapped in a device-local blob
-- (`todo-planner-space-hub-v1`, useSpaceHubData.ts). They never synced, so a
-- note written on one device did not exist on another and clearing site data
-- lost it. Same mistake Learning Paths made (004), fixed the same way.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb —
-- so a note gaining a field needs no schema change. The client treats this
-- table as optional (optionalRemoteTables in buildSyncPlan.ts), so an account
-- whose project has not run this migration keeps syncing everything else
-- instead of failing every save.

create table if not exists public.space_notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_space_notes_updated_at on public.space_notes;
create trigger set_space_notes_updated_at
  before update on public.space_notes
  for each row execute function public.set_updated_at();

alter table public.space_notes enable row level security;

drop policy if exists "Users can read own space_notes" on public.space_notes;
create policy "Users can read own space_notes"
  on public.space_notes for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own space_notes" on public.space_notes;
create policy "Users can insert own space_notes"
  on public.space_notes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own space_notes" on public.space_notes;
create policy "Users can update own space_notes"
  on public.space_notes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own space_notes" on public.space_notes;
create policy "Users can delete own space_notes"
  on public.space_notes for delete using (auth.uid() = user_id);
