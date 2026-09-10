-- 회차 영수증에 보존 규칙을 준다.
--
-- 037 이 `google_task_occurrence_receipts` 를 만들었는데 034 의 정리 경로가 그것을
-- 모른다. 034 는 037 보다 먼저 쓰였으니 당연한 일이고, 037 이 채우지 않았다.
--
-- 이 표는 나이로 지울 수 없다. 이것은 기록이 아니라 **멱등 장부**다 — 어떤 회차를
-- 이미 보냈다는 사실이고, 지우면 다음 패스가 같은 것을 다시 보낸다. 30일이 지났다는
-- 것은 다시 보내도 된다는 뜻이 아니다.
--
-- 안전하게 지울 수 있는 것은 하나뿐이다: **지금 연결의 세대가 아닌 행.** 스냅샷은
-- 언제나 현재 세대로만 조회하므로 (037), 다른 세대의 행은 다시 읽힐 수 없다. 세대는
-- 연결을 끊고 다시 붙일 때 새로 발급되고, 그때 옛 행은 그 자리에서 도달 불가능한
-- 쓰레기가 된다 — 그리고 지금은 영원히 남는다. 표의 PK 에 generation 이 들어 있고
-- on delete cascade 는 user_id 에만 걸려 있기 때문이다.
--
-- 연결이 아예 없는 계정은 건드리지 않는다. 연결 해제와 재연결 사이에 정리가 돌면
-- 026 이 되살릴 수도 있는 것을 미리 버리게 된다.
begin;

alter function public.prune_google_task_history(uuid) rename to prune_google_task_history_occurrence_core;
revoke all on function public.prune_google_task_history_occurrence_core(uuid) from public,anon,authenticated,service_role;

create function public.prune_google_task_history(p_user_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; k integer;
begin
  n:=public.prune_google_task_history_occurrence_core(p_user_id);
  -- 락은 core 가 이미 같은 트랜잭션에서 잡았다. 같은 키를 다시 잡는 것은 무해하다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  delete from public.google_task_occurrence_receipts r
    where r.user_id=p_user_id
      and exists(select 1 from public.google_calendar_connections c where c.user_id=p_user_id)
      and not exists(select 1 from public.google_calendar_connections c
        where c.user_id=p_user_id and c.connection_generation=r.generation and c.calendar_id=r.calendar_id);
  get diagnostics k=row_count;
  return n+k;
end $$;
revoke all on function public.prune_google_task_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prune_google_task_history(uuid) to service_role;

commit;
