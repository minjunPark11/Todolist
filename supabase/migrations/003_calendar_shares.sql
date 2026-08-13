create table if not exists public.calendar_shares (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  enabled boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

drop trigger if exists set_calendar_shares_updated_at on public.calendar_shares;
create trigger set_calendar_shares_updated_at
before update on public.calendar_shares
for each row execute function public.set_updated_at();

alter table public.calendar_shares enable row level security;

drop policy if exists "Users can read own calendar shares" on public.calendar_shares;
create policy "Users can read own calendar shares"
on public.calendar_shares
for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own calendar shares" on public.calendar_shares;
create policy "Users can insert own calendar shares"
on public.calendar_shares
for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own calendar shares" on public.calendar_shares;
create policy "Users can update own calendar shares"
on public.calendar_shares
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own calendar shares" on public.calendar_shares;
create policy "Users can delete own calendar shares"
on public.calendar_shares
for delete using (auth.uid() = user_id);
