-- 앱이 동기화하려 했지만 이 프로젝트에 없던 표 일곱.
--
-- `buildSyncPlan` 의 `collectionTables` 는 이 일곱을 전부 동기화 대상으로
-- 매핑한다. 그런데 데이터베이스에는 없었다 [실측]:
--
--   READABLE_TABLES 14개 중 없던 것: check_items · spaces · folders ·
--   list_sections · tags · task_tags · daily_plans
--
-- `optionalRemoteTables` 가 그것을 견디게 해준다 — 주석이 목적을 적어뒀다:
-- "Tables added after the original schema: a client whose project predates
-- them keeps working without them instead of failing every sync." 즉 옛
-- 프로젝트를 위한 **호환 장치**이지 설계 선택이 아니다. 이 프로젝트가 그
-- 옛 프로젝트였다.
--
-- 견디는 방식이 `partial[key] = localAtStart[key]` 이므로, 그 일곱 컬렉션은
-- 지금까지 **기기 로컬 전용**이었다. 체크리스트 항목·태그·일일 계획이
-- 기기를 따라다니지 않았고, MCP 서버도 영영 보지 못했으며, 작업 관련 응답은
-- 전부 `meta.partial: true` 였다 — 늘 켜진 신호라 아무것도 말하지 않는다.
--
--
-- 표가 생기는 순간 무슨 일이 벌어지는가 [실측]
--
-- 처음에 나는 "표가 생기면 로컬 전용 행이 지워진다"고 적었다. 틀렸다.
-- 적재 경로에는 이미 그 방어가 있고(빈 답 + 선택 표 + 로컬에 행이 있음
-- → 로컬을 유지), `loadRace.test.tsx` 가 그것을 지키고 있다. 훅을 직접
-- 돌려 다시 쟀다:
--
--   표 없을 때 로컬 체크항목                     1개
--   표가 생긴 뒤 첫 적재, 로컬                   1개   ← 지워지지 않는다
--   그 뒤 무관한 편집을 해도 계정에 올라간 횟수  0회   ← 여기가 문제였다
--   그 항목 자체를 건드리면                      1회
--
-- 잃는 쪽이 아니라 **닿지 않는 쪽**이었다. 적재가 기준선에 화면의 값을 그대로
-- 복사했고, 그 값이 이 기기의 사본이라 저장은 "계정이 이미 들고 있다"고 읽었다.
-- 그래서 표를 만들어도 옛 행들은 사람이 하나씩 다시 건드릴 때까지 기기에만
-- 남아 있었다.
--
-- 이 파일은 그 수정(usePlannerData 의 `accountBaseline`,
-- optionalTableArrival.test.tsx)과 같은 커밋으로 간다. 수정 없이 이것만
-- 적용하면 표는 생기지만 옛 행은 계속 올라가지 않는다.

create table if not exists public.check_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.spaces (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.list_sections (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.tags (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.task_tags (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.daily_plans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

-- 나머지는 001 이 자기 표들에 한 것과 같은 모양으로, 같은 루프로.
do $$
declare
  t text;
begin
  foreach t in array array[
    'check_items', 'spaces', 'folders', 'list_sections', 'tags', 'task_tags', 'daily_plans'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Users can read own %I" on public.%I', t, t);
    execute format('create policy "Users can read own %I" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "Users can insert own %I" on public.%I', t, t);
    execute format('create policy "Users can insert own %I" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "Users can update own %I" on public.%I', t, t);
    execute format(
      'create policy "Users can update own %I" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t);
    execute format('drop policy if exists "Users can delete own %I" on public.%I', t, t);
    execute format('create policy "Users can delete own %I" on public.%I for delete using (auth.uid() = user_id)', t, t);

    -- 047 의 두 번째 자물쇠. 047 은 적용 시점의 표만 돌았으므로 새로 생기는
    -- 표는 저마다 붙여야 한다 — oauthWriteLock.test.ts 가 요구하는 것이 이것이다.
    execute format('drop trigger if exists reject_oauth_client_write on public.%I', t);
    execute format(
      'create trigger reject_oauth_client_write
         before insert or update or delete or truncate on public.%I
         for each statement execute function public.reject_oauth_client_write()',
      t);
  end loop;
end
$$;

-- 자기 점검 둘: 049 가 세운 두 규칙을 새 표들도 지키는가.
do $$
declare offenders text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('check_items','spaces','folders','list_sections','tags','task_tags','daily_plans')
    and not exists (
      select 1 from pg_trigger g
      where g.tgrelid = c.oid and g.tgname = 'reject_oauth_client_write' and not g.tgisinternal
    );
  if offenders is not null then
    raise exception 'These new tables have no write lock: %', offenders;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'INSERT'));
  if offenders is not null then
    raise exception 'These policy-less tables are still granted to anon/authenticated: %', offenders;
  end if;
end
$$;
