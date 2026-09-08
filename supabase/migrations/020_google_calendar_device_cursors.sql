-- Where each DEVICE stopped reading (MULTI_DEVICE_SYNC_DESIGN.md §5).
--
-- 019 put `sync_token` on `google_calendar_sources`, one row per account per
-- calendar. That is right for everything else in that row — the list, the name,
-- the colour, whether the person picked it — and wrong for the cursor, because
-- the cursor is not a fact about the account. It is a position in a stream, and
-- each device reads that stream into a mirror of its own
-- (`focusflow.externalCalendars.v1`, local storage, never uploaded).
--
-- Sharing one cursor between the web app and the desktop app means the first
-- one to poll consumes the incremental changes and moves the cursor past them.
-- The other asks from the new position, gets an empty answer, and never learns
-- what happened — until the cursor expires weeks later. Two devices, two
-- different partial mirrors, neither of them right.
--
-- The cursor moves here. It does NOT go into `google_calendar_sources` with a
-- device_id added to the key: that would copy the list itself once per device,
-- and a calendar ticked on the laptop would not be ticked on the phone.
create table if not exists public.google_calendar_device_cursors (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- This install, not this account. Minted locally on first use and kept in
  -- local storage; losing it costs exactly one full listing.
  device_id text not null,
  -- Google's own id for the calendar, matching `google_calendar_sources`. No
  -- foreign key: a cursor for a calendar the list has not caught up with is
  -- harmless, and a cascade here would make un-ticking a calendar on one device
  -- silently delete another device's position through the back door.
  calendar_id text not null,
  sync_token text,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, calendar_id)
);

drop trigger if exists set_google_calendar_device_cursors_updated_at on public.google_calendar_device_cursors;
create trigger set_google_calendar_device_cursors_updated_at
before update on public.google_calendar_device_cursors
for each row execute function public.set_updated_at();

alter table public.google_calendar_device_cursors enable row level security;

-- Same reasoning as `google_calendar_sources`: a cursor is not a credential.
-- It says where we stopped reading and is useless without an access token,
-- and the inbound pass runs in the browser, so the client writes it directly.
drop policy if exists "Users can read own google cursors" on public.google_calendar_device_cursors;
create policy "Users can read own google cursors"
on public.google_calendar_device_cursors
for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own google cursors" on public.google_calendar_device_cursors;
create policy "Users can insert own google cursors"
on public.google_calendar_device_cursors
for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own google cursors" on public.google_calendar_device_cursors;
create policy "Users can update own google cursors"
on public.google_calendar_device_cursors
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own google cursors" on public.google_calendar_device_cursors;
create policy "Users can delete own google cursors"
on public.google_calendar_device_cursors
for delete using (auth.uid() = user_id);

-- `google_calendar_sources.sync_token` is deliberately LEFT IN PLACE. Dropping
-- it would break any client still running the previous build the moment this
-- migration lands, and it costs one unread column. New code neither reads nor
-- writes it.
