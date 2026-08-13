create table if not exists public.study_topics (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.concept_notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'study_topics',
    'concept_notes'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

alter table public.study_topics enable row level security;
alter table public.concept_notes enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'study_topics',
    'concept_notes'
  ]
  loop
    execute format(
      'drop policy if exists "Users can read own %I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "Users can read own %I" on public.%I for select using (auth.uid() = user_id)',
      table_name,
      table_name
    );

    execute format(
      'drop policy if exists "Users can insert own %I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "Users can insert own %I" on public.%I for insert with check (auth.uid() = user_id)',
      table_name,
      table_name
    );

    execute format(
      'drop policy if exists "Users can update own %I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "Users can update own %I" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name,
      table_name
    );

    execute format(
      'drop policy if exists "Users can delete own %I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "Users can delete own %I" on public.%I for delete using (auth.uid() = user_id)',
      table_name,
      table_name
    );
  end loop;
end $$;
