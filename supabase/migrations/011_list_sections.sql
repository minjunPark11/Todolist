-- Board columns that belong to one List (TickTick plan §6.26/§6.27).
--
-- The plan's two Boards are not the same thing. An Inbox Board column is a
-- date bucket, derived from the task's own dates and stored nowhere; a List
-- Board column is something the user made and named, and only that one is a
-- record (§6.24, D24). Dragging in the first changes a date, dragging in the
-- second changes `sectionId` — Phase 7 (§16.30) needs both to already differ.
--
-- §6.28 forbids a task pointing at a Section of another List. That is not
-- declarable here: `list_sections.data` is one jsonb blob and the task's
-- `sectionId` lives inside another, so there is no column pair to constrain.
-- The client answers it on read instead (domain/tasks/sections.ts —
-- `sectionIdFor`), which also covers a Section deleted while a task still
-- named it: those tasks read as unsectioned rather than disappearing.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- Optional client-side (optionalRemoteTables in buildSyncPlan.ts), so an
-- account whose project has not run this migration keeps syncing the rest.

create table if not exists public.list_sections (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_list_sections_updated_at on public.list_sections;
create trigger set_list_sections_updated_at
  before update on public.list_sections
  for each row execute function public.set_updated_at();

alter table public.list_sections enable row level security;

drop policy if exists "Users can read own list sections" on public.list_sections;
create policy "Users can read own list sections"
  on public.list_sections for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own list sections" on public.list_sections;
create policy "Users can insert own list sections"
  on public.list_sections for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own list sections" on public.list_sections;
create policy "Users can update own list sections"
  on public.list_sections for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own list sections" on public.list_sections;
create policy "Users can delete own list sections"
  on public.list_sections for delete using (auth.uid() = user_id);
