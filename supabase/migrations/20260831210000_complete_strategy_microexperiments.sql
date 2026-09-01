-- Completa as tentativas sem criar um segundo modelo de estrategias.
-- strategy_id continua agrupando itens da biblioteca; strategy_key agrupa
-- microexperimentos personalizados que podem ter varias tentativas.

alter type public.trial_result add value if not exists 'did_not_use';
alter type public.trial_result add value if not exists 'discarded';

alter table public.strategy_trials
  add column if not exists strategy_key text,
  add column if not exists alternative_thought_id uuid
    references public.alternative_thoughts(id) on delete set null,
  add column if not exists trigger_context text,
  add column if not exists experiment_action text,
  add column if not exists test_objective text,
  add column if not exists confidence_level integer;

alter table public.strategy_trials
  add constraint strategy_trials_confidence_range
    check (confidence_level is null or confidence_level between 0 and 10);

create index if not exists idx_trials_user_strategy_key
  on public.strategy_trials(user_id, strategy_key, created_at desc)
  where strategy_key is not null;

create index if not exists idx_trials_alternative_thought
  on public.strategy_trials(alternative_thought_id, created_at desc)
  where alternative_thought_id is not null;

drop policy if exists trials_alternative_integrity on public.strategy_trials;
create policy trials_alternative_integrity on public.strategy_trials
  as restrictive for all to authenticated
  using (
    alternative_thought_id is null
    or exists (
      select 1 from public.alternative_thoughts alternative
      where alternative.id = alternative_thought_id
        and alternative.user_id = strategy_trials.user_id
    )
  )
  with check (
    alternative_thought_id is null
    or exists (
      select 1 from public.alternative_thoughts alternative
      where alternative.id = alternative_thought_id
        and alternative.user_id = strategy_trials.user_id
    )
  );
