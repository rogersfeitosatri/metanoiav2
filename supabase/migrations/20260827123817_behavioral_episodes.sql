-- Cada situacao comportamental passa a ter ciclo de vida e estado proprios.
-- O historico visual continua em conversations/conversation_messages.

create table if not exists public.behavioral_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  episode_type text not null default 'open' check (
    episode_type in ('open','event','help_now','preparation','strategy_review','meal_checkin')
  ),
  entry_intent text not null default 'default' check (
    entry_intent in ('default','help_now','register_event','prepare','review_strategy','meal_checkin')
  ),
  current_intent text not null default 'default' check (
    current_intent in ('default','help_now','register_event','prepare','review_strategy','meal_checkin')
  ),
  status text not null default 'active' check (
    status in ('active','resolved','waiting_followup','abandoned')
  ),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  situation text,
  event_occurred_at timestamptz,
  event_time_description text,
  event_time_precision text check (
    event_time_precision is null
    or event_time_precision in ('exact','approximate','date_only','relative','unknown')
  ),
  current_stage text,
  awaiting_field text,
  conversation_state jsonb not null default '{}'::jsonb check (
    jsonb_typeof(conversation_state) = 'object'
  ),
  result_summary text,
  followup_required boolean not null default false,
  followup_reason text,
  followup_at timestamptz,
  related_meal_checkin_id uuid references public.meal_checkins(id) on delete set null,
  related_strategy_trial_id uuid references public.strategy_trials(id) on delete set null,
  related_difficulty_event_id uuid references public.difficulty_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

alter table public.conversation_messages
  add column if not exists episode_id uuid;
alter table public.meal_checkins
  add column if not exists episode_id uuid;
alter table public.difficulty_events
  add column if not exists episode_id uuid;
alter table public.strategy_trials
  add column if not exists episode_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversation_messages_episode_fk') then
    alter table public.conversation_messages
      add constraint conversation_messages_episode_fk
      foreign key (episode_id) references public.behavioral_episodes(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meal_checkins_episode_fk') then
    alter table public.meal_checkins
      add constraint meal_checkins_episode_fk
      foreign key (episode_id) references public.behavioral_episodes(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'difficulty_events_episode_fk') then
    alter table public.difficulty_events
      add constraint difficulty_events_episode_fk
      foreign key (episode_id) references public.behavioral_episodes(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'strategy_trials_episode_fk') then
    alter table public.strategy_trials
      add constraint strategy_trials_episode_fk
      foreign key (episode_id) references public.behavioral_episodes(id) on delete set null;
  end if;
end $$;

create index if not exists idx_episodes_user_status_updated
  on public.behavioral_episodes(user_id, status, updated_at desc);
create index if not exists idx_episodes_user_event_time
  on public.behavioral_episodes(user_id, event_occurred_at desc)
  where event_occurred_at is not null;
create index if not exists idx_episodes_conversation_started
  on public.behavioral_episodes(conversation_id, started_at);
create index if not exists idx_episodes_followup_due
  on public.behavioral_episodes(followup_at)
  where status = 'waiting_followup' and followup_required;
create index if not exists idx_messages_episode_time
  on public.conversation_messages(episode_id, created_at)
  where episode_id is not null;
create index if not exists idx_checkins_episode
  on public.meal_checkins(episode_id)
  where episode_id is not null;
create index if not exists idx_difficulties_episode
  on public.difficulty_events(episode_id)
  where episode_id is not null;
create index if not exists idx_trials_episode
  on public.strategy_trials(episode_id)
  where episode_id is not null;

alter table public.behavioral_episodes enable row level security;

-- Desde 2026, tabelas novas podem nao receber grants da Data API automaticamente.
grant select, insert, update on public.behavioral_episodes to authenticated;
grant select, insert, update, delete on public.behavioral_episodes to service_role;

drop policy if exists episodes_read on public.behavioral_episodes;
create policy episodes_read on public.behavioral_episodes
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select private.has_active_access()))
    or private.is_linked_professional(user_id)
    or (select private.is_admin())
  );

drop policy if exists episodes_insert on public.behavioral_episodes;
create policy episodes_insert on public.behavioral_episodes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.has_active_access())
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists episodes_update on public.behavioral_episodes;
create policy episodes_update on public.behavioral_episodes
  for update to authenticated
  using (user_id = (select auth.uid()) and (select private.has_active_access()))
  with check (
    user_id = (select auth.uid())
    and (select private.has_active_access())
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- Politicas restritivas preservam a coerencia sem bloquear dados antigos sem episodio.
drop policy if exists messages_episode_integrity on public.conversation_messages;
create policy messages_episode_integrity on public.conversation_messages
  as restrictive for all to authenticated
  using (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.conversation_id = conversation_messages.conversation_id
    )
  )
  with check (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.conversation_id = conversation_messages.conversation_id
    )
  );

drop policy if exists checkins_episode_integrity on public.meal_checkins;
create policy checkins_episode_integrity on public.meal_checkins
  as restrictive for all to authenticated
  using (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.user_id = meal_checkins.user_id
    )
  )
  with check (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.user_id = meal_checkins.user_id
    )
  );

drop policy if exists difficulties_episode_integrity on public.difficulty_events;
create policy difficulties_episode_integrity on public.difficulty_events
  as restrictive for all to authenticated
  using (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.user_id = difficulty_events.user_id
    )
  )
  with check (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.user_id = difficulty_events.user_id
    )
  );

drop policy if exists trials_episode_integrity on public.strategy_trials;
create policy trials_episode_integrity on public.strategy_trials
  as restrictive for all to authenticated
  using (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.user_id = strategy_trials.user_id
    )
  )
  with check (
    episode_id is null
    or exists (
      select 1 from public.behavioral_episodes e
      where e.id = episode_id and e.user_id = strategy_trials.user_id
    )
  );
