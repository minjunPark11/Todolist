create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.projects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.subtasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.habits (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.habit_logs (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.focus_sessions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.task_templates (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.settings (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tasks',
    'projects',
    'subtasks',
    'habits',
    'habit_logs',
    'focus_sessions',
    'task_templates',
    'settings'
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

alter table public.tasks enable row level security;
alter table public.projects enable row level security;
alter table public.subtasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.task_templates enable row level security;
alter table public.settings enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tasks',
    'projects',
    'subtasks',
    'habits',
    'habit_logs',
    'focus_sessions',
    'task_templates',
    'settings'
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
