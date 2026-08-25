-- A Task's checklist lines (Task Detail spec §11, Chapter 26 §26.4).
--
-- A CheckItem is NOT a Subtask. A Subtask is a Task — it has dates, a
-- priority, tags and children of its own, and it lives in `tasks` like any
-- other. This is text plus a tick. The two look alike on screen and are
-- different records on purpose, so that an item needing a date is promoted
-- rather than quietly growing fields the shape cannot hold.
--
-- §11.3 forbids the obvious shortcut of an array inside the task's own jsonb.
-- A checklist stored there makes every tick a rewrite of the whole Task —
-- the write amplification this schema has removed twice — and it makes
-- "which copy is the truth" a live question the moment anything caches one.
--
-- `taskId` lives inside `data`, so the parent link is not declarable here as
-- a foreign key, the same way `list_sections` cannot constrain `sectionId`.
-- The client answers it instead: `removeCheckItemsForTask` takes the lines
-- with the Task, and `checkItemsForTask` shows only lines whose Task is the
-- one being read.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- Optional client-side (optionalRemoteTables in buildSyncPlan.ts), so an
-- account whose project has not run this migration keeps syncing the rest.

create table if not exists public.check_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_check_items_updated_at on public.check_items;
create trigger set_check_items_updated_at
  before update on public.check_items
  for each row execute function public.set_updated_at();

alter table public.check_items enable row level security;

drop policy if exists "Users can read own check items" on public.check_items;
create policy "Users can read own check items"
  on public.check_items for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own check items" on public.check_items;
create policy "Users can insert own check items"
  on public.check_items for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own check items" on public.check_items;
create policy "Users can update own check items"
  on public.check_items for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own check items" on public.check_items;
create policy "Users can delete own check items"
  on public.check_items for delete using (auth.uid() = user_id);
