-- Apply before the gated token/connect endpoints. No account is activated here.
begin;
do $$ begin
  if exists(select 1 from public.google_task_sync_accounts where enabled) then
    raise exception 'Disable inbound accounts before installing the protocol drain gate';
  end if;
end $$;
alter table public.google_task_sync_accounts
  add column minimum_google_protocol integer not null default 1 check (minimum_google_protocol in (1,2)),
  add column google_protocol_cutover_at timestamptz,
  add column legacy_google_token_valid_until timestamptz;

create function public.guard_google_protocol_activation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.minimum_google_protocol = 2 and (tg_op = 'INSERT' or old.minimum_google_protocol <> 2) then
    new.google_protocol_cutover_at := clock_timestamp();
  elsif new.minimum_google_protocol = 1 then
    new.google_protocol_cutover_at := null;
  end if;
  if new.enabled then
    -- 60-minute maximum returned token lifetime plus a 5-minute drain margin.
    -- Old endpoint deployments must already be retired before raising minimum.
    if new.minimum_google_protocol <> 2 or new.google_protocol_cutover_at is null
      or new.google_protocol_cutover_at + interval '65 minutes' > clock_timestamp()
      or coalesce(new.legacy_google_token_valid_until + interval '5 minutes', '-infinity'::timestamptz) > clock_timestamp() then
      raise exception 'GOOGLE_PROTOCOL_DRAIN_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_google_protocol_activation before insert or update on public.google_task_sync_accounts
  for each row execute function public.guard_google_protocol_activation();

-- Server-only: preflight before OAuth exchange/refresh; then recheck and record
-- the actual lifetime BEFORE releasing the access token to a client. Both calls
-- lock the account row, serializing with minimum-version and activation changes.
create function public.authorize_google_token(p_user_id uuid, p_protocol integer, p_expires_in integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.google_task_sync_accounts%rowtype;
begin
  if p_user_id is null or p_protocol is null or p_protocol not in (1,2) or
    (p_expires_in is not null and (p_expires_in < 1 or p_expires_in > 3600)) then
    raise exception 'INVALID_GOOGLE_TOKEN_PROTOCOL' using errcode='22023';
  end if;
  insert into public.google_task_sync_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into a from public.google_task_sync_accounts where user_id=p_user_id for update;
  if p_protocol < a.minimum_google_protocol or (a.enabled and p_protocol < 2) then
    return jsonb_build_object('allowed',false,'minimumProtocol',greatest(a.minimum_google_protocol,case when a.enabled then 2 else 1 end));
  end if;
  if p_expires_in is not null and p_protocol = 1 then
    update public.google_task_sync_accounts set legacy_google_token_valid_until = greatest(
      coalesce(legacy_google_token_valid_until,'-infinity'::timestamptz),
      clock_timestamp() + make_interval(secs => p_expires_in)) where user_id=p_user_id;
  end if;
  return jsonb_build_object('allowed',true,'minimumProtocol',a.minimum_google_protocol);
end $$;
revoke all on function public.authorize_google_token(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.authorize_google_token(uuid,integer,integer) to service_role;
commit;
