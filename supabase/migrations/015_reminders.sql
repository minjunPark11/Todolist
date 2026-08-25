-- A Task's reminders (Task Detail spec §6.2, §6.3).
--
-- A row per reminder, because §6.3 forbids the field this replaces. A Task
-- carried one `reminder` preset inside its own jsonb, and a Task can want
-- reminding a day before AND an hour before — §6.15 — which a single value
-- cannot hold. The old field is still written in accounts and is still read
-- once, by `migrateReminders`, which turns it into one of these.
--
-- `taskId` lives inside `data`, so the parent link is not declarable here as a
-- foreign key, the same way `check_items` cannot constrain its own. The client
-- answers it: `pruneOrphanReminders` takes the rows with the Task, and
-- `remindersForTask` shows only the rows whose Task is the one being read.
--
-- Nothing about DELIVERY is stored here (Chapter 26 §26.6). Whether a
-- notification was sent is the adapter's business and the platform's, and
-- keeping it out of this table is what lets "it was never saved" and "there
-- was no way to send it" stay two different answers.
--
-- Same uniform shape as every other collection table — id/user_id/data jsonb.
-- Optional client-side (optionalRemoteTables in buildSyncPlan.ts), so an
-- account whose project has not run this migration keeps syncing the rest.

create table if not exists public.reminders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

drop trigger if exists set_reminders_updated_at on public.reminders;
create trigger set_reminders_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;

drop policy if exists "Users can read own reminders" on public.reminders;
create policy "Users can read own reminders"
  on public.reminders for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own reminders" on public.reminders;
create policy "Users can insert own reminders"
  on public.reminders for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own reminders" on public.reminders;
create policy "Users can update own reminders"
  on public.reminders for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own reminders" on public.reminders;
create policy "Users can delete own reminders"
  on public.reminders for delete using (auth.uid() = user_id);
