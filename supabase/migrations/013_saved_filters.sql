-- Filters the user saved (TickTick plan §6.49).
--
-- Only user-made Filters are rows. §6.48 is explicit that the built-in Smart
-- Lists must not become a row per user — Today is code, not data.
--
-- The spec inside `data` is structured JSON, never a query string (§6.50),
-- and carries a `version` (§6.51). That is what lets this client refuse a
-- spec written by a newer one instead of half-reading it and selecting the
-- wrong tasks while looking like it worked.
--
-- Optional client-side (optionalRemoteTables in buildSyncPlan.ts), so an
-- account whose project has not run this migration keeps syncing the rest.

create table if not exists public.saved_filters (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_saved_filters_updated_at on public.saved_filters;
create trigger set_saved_filters_updated_at
  before update on public.saved_filters
  for each row execute function public.set_updated_at();

alter table public.saved_filters enable row level security;

drop policy if exists "Users can read own saved filters" on public.saved_filters;
create policy "Users can read own saved filters"
  on public.saved_filters for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own saved filters" on public.saved_filters;
create policy "Users can insert own saved filters"
  on public.saved_filters for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own saved filters" on public.saved_filters;
create policy "Users can update own saved filters"
  on public.saved_filters for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own saved filters" on public.saved_filters;
create policy "Users can delete own saved filters"
  on public.saved_filters for delete using (auth.uid() = user_id);
