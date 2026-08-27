-- Validation Spike — 검증 2용 후보 정책 (설계 §6.5 / M5)
--
-- OAuth 클라이언트에게 발급된 토큰의 쓰기를 DB에서 거부한다.
-- 판단 근거: Supabase가 발급한 OAuth access token에는 `client_id` 클레임이 있고
-- 일반 세션 토큰에는 없다. 그 차이가 "사람이 앱에서 하는 쓰기"와
-- "AI 클라이언트의 쓰기"를 구분하는 유일한 단서다.
--
-- ⚠ 먼저 spike.mjs 를 정책 없이 한 번 돌려 검증 1이 PASS인지 확인하라.
--   client_id 클레임이 없다면 이 정책은 무의미하다(모든 쓰기를 허용하게 된다).
--
-- ⚠ 이 스크립트는 tasks 테이블만 바꾼다. 스파이크에 필요한 최소 범위다.
--   전체 적용(17개 테이블)은 아래 §2의 루프를 쓰되, 스파이크 결론이 난 뒤에 한다.

-- ============================================================
-- §1. 스파이크 범위 — tasks 만
-- ============================================================

-- SELECT 정책은 건드리지 않는다. 읽기는 OAuth 토큰에도 허용해야 한다.

drop policy if exists "Users can insert own tasks" on public.tasks;
create policy "Users can insert own tasks" on public.tasks
  for insert with check (
    auth.uid() = user_id
    and (auth.jwt() ->> 'client_id') is null
  );

drop policy if exists "Users can update own tasks" on public.tasks;
create policy "Users can update own tasks" on public.tasks
  for update
  using (
    auth.uid() = user_id
    and (auth.jwt() ->> 'client_id') is null
  )
  with check (
    auth.uid() = user_id
    and (auth.jwt() ->> 'client_id') is null
  );

drop policy if exists "Users can delete own tasks" on public.tasks;
create policy "Users can delete own tasks" on public.tasks
  for delete using (
    auth.uid() = user_id
    and (auth.jwt() ->> 'client_id') is null
  );

-- ============================================================
-- §2. 전체 적용 (스파이크 통과 후에 실행할 것 — 지금은 실행하지 않는다)
-- ============================================================
-- do $$
-- declare
--   t text;
-- begin
--   foreach t in array array[
--     'tasks','projects','subtasks','focus_sessions','learning_paths','spaces',
--     'folders','lists','sidebar_folders','list_sections','saved_filters',
--     'daily_plans','tags','task_tags','check_items','reminders','task_templates',
--     'settings'
--   ]
--   loop
--     execute format('drop policy if exists "Users can insert own %I" on public.%I', t, t);
--     execute format(
--       'create policy "Users can insert own %I" on public.%I for insert
--          with check (auth.uid() = user_id and (auth.jwt() ->> ''client_id'') is null)', t, t);
--     execute format('drop policy if exists "Users can update own %I" on public.%I', t, t);
--     execute format(
--       'create policy "Users can update own %I" on public.%I for update
--          using (auth.uid() = user_id and (auth.jwt() ->> ''client_id'') is null)
--          with check (auth.uid() = user_id and (auth.jwt() ->> ''client_id'') is null)', t, t);
--     execute format('drop policy if exists "Users can delete own %I" on public.%I', t, t);
--     execute format(
--       'create policy "Users can delete own %I" on public.%I for delete
--          using (auth.uid() = user_id and (auth.jwt() ->> ''client_id'') is null)', t, t);
--   end loop;
-- end $$;
--
-- 주의: 정책 이름이 테이블마다 다르다. 001_initial_schema.sql 은 루프로
-- "Users can insert own tasks" 형태를, 004~016 은 개별 선언으로
-- "Users can insert own calendar shares" 처럼 공백이 섞인 이름을 쓴다.
-- 위 루프의 drop 문은 전자만 맞춘다 — 전체 적용 전에 실제 정책 이름을 확인할 것:
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 3;

-- ============================================================
-- §3. 롤백 — 원래대로 (client_id 조건 없음)
-- ============================================================
-- drop policy if exists "Users can insert own tasks" on public.tasks;
-- create policy "Users can insert own tasks" on public.tasks
--   for insert with check (auth.uid() = user_id);
-- drop policy if exists "Users can update own tasks" on public.tasks;
-- create policy "Users can update own tasks" on public.tasks
--   for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- drop policy if exists "Users can delete own tasks" on public.tasks;
-- create policy "Users can delete own tasks" on public.tasks
--   for delete using (auth.uid() = user_id);
