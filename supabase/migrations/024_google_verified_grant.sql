begin;
-- This is the identity of the grant, NOT proof of a calendar's historical owner.
alter table public.google_calendar_tokens
  add column google_subject text,
  add column verified_email text not null default '',
  add column identity_verified_at timestamptz;

create function public.guard_verified_google_grant() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
      where oid='public.google_calendar_tokens'::regclass)) then
    raise exception 'VERIFIED_GOOGLE_GRANT_REQUIRED' using errcode='42501';
  end if;
  return new;
end $$;
create trigger guard_verified_google_grant before insert or update on public.google_calendar_tokens
  for each row execute function public.guard_verified_google_grant();

create function public.store_verified_google_grant(p_user_id uuid,p_refresh_token text,p_scope text,p_subject text,p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_subject text; had_token boolean;
begin
  if p_user_id is null or length(btrim(coalesce(p_refresh_token,'')))=0 or
    length(btrim(coalesce(p_subject,'')))=0 or length(p_subject)>255 or p_subject<>btrim(p_subject) then
    raise exception 'INVALID_VERIFIED_GRANT' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select google_subject into old_subject from public.google_calendar_tokens where user_id=p_user_id for update;
  had_token := found;
  -- A legacy grant/connection has no trustworthy historical subject. Do not bind
  -- it to whichever account happened to authorize this new request.
  if (had_token and old_subject is distinct from p_subject) or
    (not had_token and exists(select 1 from public.google_calendar_connections where user_id=p_user_id)) then
    return jsonb_build_object('stored',false,'reason','identity-mismatch');
  end if;
  insert into public.google_calendar_tokens(user_id,refresh_token,scope,google_subject,verified_email,identity_verified_at)
    values(p_user_id,p_refresh_token,coalesce(p_scope,''),p_subject,coalesce(p_email,''),clock_timestamp())
    on conflict(user_id) do update set refresh_token=excluded.refresh_token,scope=excluded.scope,
      google_subject=excluded.google_subject,verified_email=excluded.verified_email,identity_verified_at=excluded.identity_verified_at;
  return jsonb_build_object('stored',true);
end $$;
revoke all on function public.store_verified_google_grant(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.store_verified_google_grant(uuid,text,text,text,text) to service_role;
commit;
