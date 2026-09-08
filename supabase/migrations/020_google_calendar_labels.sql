-- NULL = not probed yet; FALSE = explicit unsupported-feature response.
alter table public.google_calendar_connections
  add column if not exists labels_supported boolean;
