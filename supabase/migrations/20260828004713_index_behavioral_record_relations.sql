-- O registro de pensamento e atualizado pelo evento do episodio.
create index if not exists idx_thought_records_difficulty_event
  on public.thought_records(difficulty_event_id);
