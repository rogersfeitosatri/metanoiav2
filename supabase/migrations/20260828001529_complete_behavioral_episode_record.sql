-- Completa o registro invisivel do episodio sem criar um segundo modelo.
-- conversation_state continua permitindo retomada; estas colunas tornam os dados
-- comportamentais consultaveis e preservam evidencias de fato versus hipotese.

alter table public.behavioral_episodes
  add column if not exists context_tags text[] not null default '{}'::text[],
  add column if not exists physical_state text[] not null default '{}'::text[],
  add column if not exists hunger_level integer,
  add column if not exists satiety_level integer,
  add column if not exists urge text,
  add column if not exists urge_intensity integer,
  add column if not exists automatic_thought text,
  add column if not exists emotions text[] not null default '{}'::text[],
  add column if not exists emotion_intensity integer,
  add column if not exists behavior text,
  add column if not exists immediate_consequence text,
  add column if not exists later_consequence text,
  add column if not exists recovery_outcome public.recovery_outcome,
  add column if not exists compensatory_behavior text,
  add column if not exists decision_point text,
  add column if not exists main_influencing_factor text,
  add column if not exists captured_evidence jsonb not null default '[]'::jsonb;

alter table public.behavioral_episodes
  add constraint behavioral_episodes_hunger_range
    check (hunger_level is null or hunger_level between 0 and 10),
  add constraint behavioral_episodes_satiety_range
    check (satiety_level is null or satiety_level between 0 and 10),
  add constraint behavioral_episodes_urge_range
    check (urge_intensity is null or urge_intensity between 0 and 10),
  add constraint behavioral_episodes_emotion_range
    check (emotion_intensity is null or emotion_intensity between 0 and 10),
  add constraint behavioral_episodes_main_factor_valid
    check (
      main_influencing_factor is null
      or main_influencing_factor in (
        'physical', 'practical', 'emotional', 'cognitive', 'social', 'mixed', 'unknown'
      )
    ),
  add constraint behavioral_episodes_evidence_array
    check (jsonb_typeof(captured_evidence) = 'array');

alter table public.difficulty_events
  add column if not exists event_time_description text,
  add column if not exists event_time_precision text;

alter table public.difficulty_events
  add constraint difficulty_events_time_precision_valid
    check (
      event_time_precision is null
      or event_time_precision in ('exact', 'approximate', 'date_only', 'relative', 'unknown')
    );

create index if not exists idx_episodes_user_factor_time
  on public.behavioral_episodes(user_id, main_influencing_factor, event_occurred_at desc)
  where main_influencing_factor is not null;
