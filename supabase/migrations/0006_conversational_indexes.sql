-- Indices para as novas relacoes consultadas no historico conversacional.

create index if not exists idx_user_memories_source_conversation
  on user_memories(source_conversation_id)
  where source_conversation_id is not null;

create index if not exists idx_scheduled_interventions_meal_schedule
  on scheduled_interventions(meal_schedule_id)
  where meal_schedule_id is not null;
