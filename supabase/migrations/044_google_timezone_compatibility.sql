-- An old client must not reinstate an independently selected sync zone.
begin;
alter function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) rename to bind_verified_google_calendar_account_core;
revoke all on function public.bind_verified_google_calendar_account_core(uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.bind_verified_google_calendar(p_user_id uuid,p_refresh_token text,p_subject text,
 p_grant_version uuid,p_expected_generation uuid,p_calendar_id text,p_timezone text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.google_calendar_connections%rowtype;zone text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
 select * into c from public.google_calendar_connections where user_id=p_user_id for update;
 select data->'appSettings'->>'timezone' into zone from public.settings where user_id=p_user_id and id='app_settings';
 if c.calendar_id=p_calendar_id and c.google_subject=p_subject and c.calendar_verified_at is not null and c.sync_timezone is not null then
   -- Only apply_google_account_timezone can rebase a live connection.
   zone:=c.sync_timezone;
 elsif zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone:=p_timezone;end if;
 return public.bind_verified_google_calendar_account_core(p_user_id,p_refresh_token,p_subject,p_grant_version,p_expected_generation,p_calendar_id,zone,p_email);
end $$;
revoke all on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) to service_role;

alter function public.claim_google_task_sync(uuid,uuid) rename to claim_google_task_sync_account_core;
revoke all on function public.claim_google_task_sync_account_core(uuid,uuid) from public,anon,authenticated,service_role;
create function public.claim_google_task_sync(p_generation uuid,p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;zone text;pinned text;
begin
 u:=public.google_task_actor();
 select sync_timezone into pinned from public.google_calendar_connections where user_id=u and connection_generation=p_generation for update;
 select data->'appSettings'->>'timezone' into zone from public.settings where user_id=u and id='app_settings' for share;
 if zone is not null and pinned is distinct from zone and exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
   raise exception 'ACCOUNT_TIMEZONE_PENDING' using errcode='40001';end if;
 return public.claim_google_task_sync_account_core(p_generation,p_owner);
end $$;
revoke all on function public.claim_google_task_sync(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_google_task_sync(uuid,uuid) to authenticated;
commit;
