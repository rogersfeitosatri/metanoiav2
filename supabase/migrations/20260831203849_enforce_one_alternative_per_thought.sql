-- Cada registro cognitivo mantém uma única resposta alternativa vigente.
-- Revisões atualizam a mesma linha, preservando a origem e o histórico de uso.
create unique index if not exists idx_alternative_thoughts_thought_record_unique
  on public.alternative_thoughts(thought_record_id)
  where thought_record_id is not null;

alter table public.alternative_thoughts
  drop constraint if exists alternative_thoughts_belief_level_range,
  add constraint alternative_thoughts_belief_level_range
    check (belief_level is null or belief_level between 0 and 10),
  drop constraint if exists alternative_thoughts_times_used_nonnegative,
  add constraint alternative_thoughts_times_used_nonnegative
    check (times_used >= 0);
