-- Daily plans (TickTick plan §6.18).
--
-- What the user decided about a task on one day: which bucket they moved it
-- to. Today itself stays a Query (§6.17), so nothing here says what belongs to
-- Today — only what was overridden once it got there.
--
-- Not a column on tasks. §6.19 refuses to make now/next/later a permanent
-- property of the work, because it is a decision about a date; the same task
-- tomorrow starts from the rules again. A column would also mean every plan
-- change rewrote a task row.
--
-- This replaces a device-local localStorage blob, which is why it exists at
-- all: a plan made on the desktop was invisible on the laptop.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- The client treats this table as optional (optionalRemoteTables in
-- buildSyncPlan.ts), so an account whose project has not run this migration
-- keeps syncing everything else instead of failing every save.

create table if not exists public.daily_plans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_daily_plans_updated_at on public.daily_plans;
create trigger set_daily_plans_updated_at
  before update on public.daily_plans
  for each row execute function public.set_updated_at();

alter table public.daily_plans enable row level security;

drop policy if exists "Users can read own daily plans" on public.daily_plans;
create policy "Users can read own daily plans"
  on public.daily_plans for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily plans" on public.daily_plans;
create policy "Users can insert own daily plans"
  on public.daily_plans for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily plans" on public.daily_plans;
create policy "Users can update own daily plans"
  on public.daily_plans for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own daily plans" on public.daily_plans;
create policy "Users can delete own daily plans"
  on public.daily_plans for delete using (auth.uid() = user_id);
