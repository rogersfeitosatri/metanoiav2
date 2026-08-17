-- Nucleo conversacional: memoria longitudinal, rotina de refeicoes e Meu Norte.

alter table coping_cards
  add column if not exists life_impacts jsonb not null default '{}'::jsonb;

create table if not exists meal_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  meal_type text,
  time_of_day time not null,
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',
  reminder_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(days_of_week) > 0)
);

create index if not exists idx_meal_schedules_user_time
  on meal_schedules(user_id, time_of_day)
  where active;

create table if not exists user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  memory_kind text not null check (
    memory_kind in ('fact','hypothesis','anchor','identity','protective_factor','pattern')
  ),
  topic text not null,
  content text not null,
  source text not null default 'user' check (source in ('user','ai','system')),
  validation_status text not null default 'confirmed' check (
    validation_status in ('confirmed','proposed','rejected')
  ),
  confidence real not null default 1 check (confidence >= 0 and confidence <= 1),
  source_conversation_id uuid references conversations(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_memories_context
  on user_memories(user_id, validation_status, memory_kind, updated_at desc);

alter table meal_checkins
  add column if not exists schedule_id uuid references meal_schedules(id) on delete set null;

create index if not exists idx_checkins_schedule
  on meal_checkins(schedule_id, occurred_at desc)
  where schedule_id is not null;

alter table scheduled_interventions
  add column if not exists meal_schedule_id uuid references meal_schedules(id) on delete cascade;

alter table meal_schedules enable row level security;
alter table user_memories enable row level security;

-- Projetos novos nao expoem tabelas automaticamente para a Data API.
grant select, insert, update, delete on meal_schedules to authenticated;
grant select, insert, update, delete on user_memories to authenticated;
grant select, insert, update, delete on meal_schedules to service_role;
grant select, insert, update, delete on user_memories to service_role;

create policy meal_schedules_read on meal_schedules
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select has_active_access()))
    or (select is_linked_professional(user_id))
    or (select is_admin())
  );

create policy meal_schedules_insert on meal_schedules
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_active_access()));

create policy meal_schedules_update on meal_schedules
  for update to authenticated
  using (user_id = (select auth.uid()) and (select has_active_access()))
  with check (user_id = (select auth.uid()) and (select has_active_access()));

create policy meal_schedules_delete on meal_schedules
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select has_active_access()));

create policy user_memories_read on user_memories
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select has_active_access()))
    or (select is_linked_professional(user_id))
    or (select is_admin())
  );

create policy user_memories_insert on user_memories
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_active_access()));

create policy user_memories_update on user_memories
  for update to authenticated
  using (user_id = (select auth.uid()) and (select has_active_access()))
  with check (user_id = (select auth.uid()) and (select has_active_access()));

create policy user_memories_delete on user_memories
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select has_active_access()));

-- Funcoes SECURITY DEFINER usadas pela RLS nao devem ficar no schema exposto.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.current_role_is(public.role) set schema private;
alter function public.is_admin() set schema private;
alter function public.my_professional_id() set schema private;
alter function public.is_linked_professional(uuid) set schema private;
alter function public.has_active_access() set schema private;

alter function private.current_role_is(public.role) set search_path = private, public;
alter function private.is_admin() set search_path = private, public;
alter function private.my_professional_id() set search_path = private, public;
alter function private.is_linked_professional(uuid) set search_path = private, public;
alter function private.has_active_access() set search_path = private, public;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
