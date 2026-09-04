-- Google Calendar sync (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4.1).
--
-- Two tables and not one, on purpose. The split is the security property:
-- someone reading this file should be able to see what cannot leak without
-- also having to notice a column-level `revoke` further down.

-- What the app is allowed to know about the connection. No secrets here.
create table if not exists public.google_calendar_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The dedicated "FocusFlow" calendar (§4.1). Everything inbound and outbound
  -- is scoped to this one id, which is what keeps a work calendar's thousands
  -- of events from arriving as tasks.
  calendar_id text not null,
  -- Which Google account this is, so the settings screen can say so. A person
  -- with a work and a personal account needs to see which one they connected.
  account_email text not null default '',
  -- The inbound cursor (§6.1). Null until the first full list; a 410 clears it
  -- and the next pass re-lists from scratch — which is exactly the moment §7.1
  -- forbids reading absence as deletion.
  sync_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

drop trigger if exists set_google_calendar_connections_updated_at on public.google_calendar_connections;
create trigger set_google_calendar_connections_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;

drop policy if exists "Users can read own google connection" on public.google_calendar_connections;
create policy "Users can read own google connection"
on public.google_calendar_connections
for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own google connection" on public.google_calendar_connections;
create policy "Users can insert own google connection"
on public.google_calendar_connections
for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own google connection" on public.google_calendar_connections;
create policy "Users can update own google connection"
on public.google_calendar_connections
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Disconnecting is the user's to do, and it has to remove the row here as well
-- as the secret below.
drop policy if exists "Users can delete own google connection" on public.google_calendar_connections;
create policy "Users can delete own google connection"
on public.google_calendar_connections
for delete using (auth.uid() = user_id);

-- The refresh token. Nothing that runs in a browser may ever read this.
--
-- RLS is ON and there is DELIBERATELY NOT ONE POLICY on this table. That is not
-- an omission — it is the whole point. Postgres denies every row to every role
-- that RLS applies to when no policy grants it, so `anon` and `authenticated`
-- get nothing at all. Only the service role, which bypasses RLS and lives only
-- in the Vercel functions' environment, can touch it (§4.4, chain step 4).
--
-- If you are here to add a policy: don't. A client that can read this can act
-- as the user's Google account until the token is revoked, and the app has no
-- reason to — the functions mint short-lived access tokens for it instead.
create table if not exists public.google_calendar_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  refresh_token text not null,
  -- The scopes the token was granted with. Stored so a build that starts
  -- needing a new one can tell "not granted" from "call failed" and ask for
  -- consent again instead of retrying forever.
  scope text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

drop trigger if exists set_google_calendar_tokens_updated_at on public.google_calendar_tokens;
create trigger set_google_calendar_tokens_updated_at
before update on public.google_calendar_tokens
for each row execute function public.set_updated_at();

alter table public.google_calendar_tokens enable row level security;
