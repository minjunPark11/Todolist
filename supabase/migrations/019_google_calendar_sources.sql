-- The calendars we READ from (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1).
--
-- 017 gave the connection one `calendar_id` and one `sync_token`, because M1
-- only ever wrote, and it wrote to exactly one place: the dedicated FocusFlow
-- calendar (§4.1). Reading is not like that. A person has a personal calendar,
-- a work one, a shared family one, and they want some of them and not others —
-- so which to read is a CHOICE, and there are several of it.
--
-- One row per calendar the account offers, and `selected` is the answer. Rows
-- for calendars nobody picked are kept rather than deleted: the settings screen
-- draws the whole list with its checkboxes, and re-listing on every visit would
-- make that list flicker and lose its order.
--
-- SEPARATE FROM `google_calendar_connections`, which stays what it was: where
-- Tasks are WRITTEN. The two answer different questions and a calendar can be
-- in one, the other, or both.
create table if not exists public.google_calendar_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Google's own id for the calendar. An email address for a primary calendar,
  -- an opaque string otherwise.
  calendar_id text not null,
  -- What Google calls it, so the checkbox has a label. Refreshed on each list:
  -- a calendar renamed in Google should not keep its old name here.
  summary text not null default '',
  -- Google's colour for it, so the app can draw it the way the account does.
  color text not null default '',
  -- Whether to read this one. The whole point of the table.
  selected boolean not null default false,
  -- Whether the account may WRITE to it — `accessRole` of `owner` or `writer`.
  -- Stored rather than assumed: a subscribed holiday calendar is readable and
  -- not writable, and offering an edit that Google will refuse is worse than
  -- not offering it (§6.2).
  writable boolean not null default false,
  -- The inbound cursor for THIS calendar (§6.1). Null until the first full
  -- list; a 410 clears it and the next pass re-lists from scratch — which is
  -- the exact moment §7.1 forbids reading absence as deletion.
  sync_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, calendar_id)
);

drop trigger if exists set_google_calendar_sources_updated_at on public.google_calendar_sources;
create trigger set_google_calendar_sources_updated_at
before update on public.google_calendar_sources
for each row execute function public.set_updated_at();

alter table public.google_calendar_sources enable row level security;

-- Policies, unlike `google_calendar_tokens` next door, and deliberately.
--
-- Nothing here is a credential. `sync_token` is a cursor: it says where we
-- stopped reading, and someone holding it can do nothing with it without an
-- access token they do not have. The inbound pass runs in the browser — the
-- same place the outbound pass already runs (`hooks/useGoogleOutboundSync.ts`)
-- — so the client must be able to read these rows and write the cursor back.
drop policy if exists "Users can read own google sources" on public.google_calendar_sources;
create policy "Users can read own google sources"
on public.google_calendar_sources
for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own google sources" on public.google_calendar_sources;
create policy "Users can insert own google sources"
on public.google_calendar_sources
for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own google sources" on public.google_calendar_sources;
create policy "Users can update own google sources"
on public.google_calendar_sources
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Disconnecting removes these too (`integrations/google/store.ts`), and a
-- calendar that disappears from the account should not linger in the list.
drop policy if exists "Users can delete own google sources" on public.google_calendar_sources;
create policy "Users can delete own google sources"
on public.google_calendar_sources
for delete using (auth.uid() = user_id);
