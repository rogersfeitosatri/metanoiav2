create index if not exists idx_episodes_related_meal_checkin
  on public.behavioral_episodes(related_meal_checkin_id);

create index if not exists idx_episodes_related_strategy_trial
  on public.behavioral_episodes(related_strategy_trial_id);

create index if not exists idx_episodes_related_difficulty_event
  on public.behavioral_episodes(related_difficulty_event_id);
