-- Lists (SPACES_CLICKUP_REDESIGN.md §4, D3/D5/D7).
--
-- Where Items will live once P4 attaches them. Every Space gets one by
-- default, undeletable, so an Item always has somewhere to be — and so the
-- tree can hide the List level entirely until a second one exists.
--
-- A List's optional status override rides inside `data` alongside everything
-- else; statuses are a value the user edits, not a table to join against.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- The client treats this table as optional (optionalRemoteTables in
-- buildSyncPlan.ts), so an account whose project has not run this migration
-- keeps syncing everything else instead of failing every save.

create table if not exists public.lists (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_lists_updated_at on public.lists;
create trigger set_lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

alter table public.lists enable row level security;

drop policy if exists "Users can read own lists" on public.lists;
create policy "Users can read own lists"
  on public.lists for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own lists" on public.lists;
create policy "Users can insert own lists"
  on public.lists for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own lists" on public.lists;
create policy "Users can update own lists"
  on public.lists for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own lists" on public.lists;
create policy "Users can delete own lists"
  on public.lists for delete using (auth.uid() = user_id);
