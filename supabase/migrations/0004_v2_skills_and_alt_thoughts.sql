-- Metanoia v2 — o que medimos é COMO a pessoa lidou, não se "seguiu a dieta".
-- Aplicar no projeto Supabase (SQL Editor ou supabase db push).

create type recovery_outcome as enum ('retomou','retomou_depois','abandonou_dia','compensou','indefinido');
create type alt_thought_result as enum ('pending','helped_changed','thought_only','did_not_use','did_not_help');

-- Habilidades observadas em cada situação.
alter table thought_records
  add column if not exists thought_self_identified boolean,
  add column if not exists emotion_self_identified boolean,
  add column if not exists hunger_level int check (hunger_level between 0 and 10),
  add column if not exists noticed_hunger_early boolean,
  add column if not exists all_or_nothing boolean,
  add column if not exists guilt_level int check (guilt_level between 0 and 10),
  add column if not exists recovery_outcome recovery_outcome;

create index if not exists idx_thoughts_recovery on thought_records(user_id, recovery_outcome);

-- Pensamentos alternativos: guardados e depois verificados —
-- pensar diferente também mudou o comportamento?
create table if not exists alternative_thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  thought_record_id uuid references thought_records(id) on delete set null,
  original_thought text not null,
  alternative text not null,
  belief_level int check (belief_level between 0 and 10),
  result alt_thought_result not null default 'pending',
  times_used int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_alt_user on alternative_thoughts(user_id, created_at desc);

alter table alternative_thoughts enable row level security;
grant select, insert, update, delete on alternative_thoughts to authenticated;

create policy alt_owner on alternative_thoughts for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy alt_pro on alternative_thoughts for select to authenticated
  using ( private.is_linked_professional(user_id) or private.is_admin() );
