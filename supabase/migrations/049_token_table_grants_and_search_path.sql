-- 자물쇠가 하나뿐인 표가 하나 더 있었다 — 하필 리프레시 토큰이 든 표다.
--
-- Supabase 린터의 INFO 0008 ("RLS Enabled No Policy")이 표 8개를 짚는다.
-- 지난번에 나는 그것을 "전부 `revoke all` 된 채 definer 함수로만 쓰이는
-- 표라 의도된 deny-all 로 보인다"고 **추정**만 하고 넘어갔다. 실제로 재보니
-- 여덟 중 일곱만 그랬다 [실측]:
--
--   표                                  anon/auth 권한   정책
--   google_legacy_mapping_imports       없음             0
--   google_oauth_operations             없음             0
--   google_sync_protocol_state          없음             0
--   google_task_occurrence_receipts     없음             0
--   google_task_recovery_audit          없음             0
--   google_task_restore_receipts        없음             0
--   google_verified_connection_history  없음             0
--   google_calendar_tokens              SELECT·INSERT·UPDATE·DELETE   0   ←
--
-- 형제 표들은 `revoke all on public.<t> from public,anon,authenticated,
-- service_role` 을 저마다 달고 있다. 017 이 이 표를 만들 때 그 줄이 없었고,
-- 그 뒤로 아무도 채우지 않았다.
--
--
-- 지금 새고 있지는 않다
--
-- RLS 가 켜져 있고 정책이 없으므로 막힌다 [실측]:
--
--   [지금] authenticated 가 SELECT : 빈 결과 0행 (RLS 가 막는다 — 권한은 있다)
--   [지금] anon 이 SELECT          : 빈 결과 0행
--
-- 그러니 이것은 오늘의 유출이 아니라 **자물쇠의 개수** 문제다. 형제 일곱은
-- 권한과 RLS 둘로 막혀 있고, 리프레시 토큰이 든 표만 RLS 하나로 막혀 있다.
-- `create policy` 한 줄을 잘못 얹거나 `disable row level security` 를 한 번
-- 하면, 앞의 일곱은 아무 일 없고 이 표만 모든 로그인 사용자에게 열린다.
-- 가장 민감한 표가 가장 얇게 막혀 있었다.
--
--
-- service_role 은 남긴다 — 형제들과 다른 점
--
-- 형제 표들은 `service_role` 에서도 거둔다. 그 표들은 definer 함수로만
-- 닿기 때문이다. 이 표는 다르다: `src/integrations/google/store.ts` 가
-- 서비스 롤 키로 PostgREST 를 **직접** 때린다
-- (`google_calendar_tokens?user_id=eq...&select=refresh_token`). 형제를
-- 그대로 베껴 service_role 까지 거뒀다면 구글 연결·해제가 죽는다.
--
-- 거둔 상태로 확인했다 [실측]:
--
--   [거둔 뒤] authenticated SELECT : 막힘 42501 permission denied
--   [거둔 뒤] service_role SELECT  : 읽음 (2행) — store.ts 경로 정상
--   [거둔 뒤] service_role UPDATE  : 통과 — 연결/해제가 쓰는 길 정상
revoke all on public.google_calendar_tokens from public, anon, authenticated;

-- `set_updated_at` 의 search_path 를 못 박는다 (린터 WARN 0011).
--
-- 047·048 에서 내가 만진 함수들은 이미 못 박았고, 남아 있던 마지막 하나다.
-- 본문은 `new.updated_at = now()` 뿐이고 `now()` 는 pg_catalog 에 있으므로
-- 빈 search_path 에서도 그대로 풀린다. `alter function` 을 쓰는 것은 본문을
-- 다시 적지 않기 위해서다 — 001 의 정의가 유일한 원본으로 남는다.
alter function public.set_updated_at() set search_path = '';

-- 자기 점검 둘.
do $$
declare offenders text;
begin
  -- 1. RLS 는 켜졌는데 정책이 없는 표 가운데, 아직 anon/authenticated 에게
  --    권한이 열려 있는 것이 남았는가.
  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'DELETE'));

  if offenders is not null then
    raise exception 'These policy-less tables are still granted to anon/authenticated: %', offenders;
  end if;

  -- 2. search_path 가 안 박힌 public 함수가 남았는가.
  select string_agg(p.proname, ', ' order by p.proname) into offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%';

  if offenders is not null then
    raise exception 'These functions still have a mutable search_path: %', offenders;
  end if;
end
$$;
