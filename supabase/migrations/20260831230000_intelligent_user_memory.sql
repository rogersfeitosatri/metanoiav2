-- Passo 7: fortalece a memoria existente sem criar um segundo repositorio.
-- O contexto conversacional usa estes campos para pesar evidencia, importancia
-- e deixar de tratar informacoes superadas como atuais.

alter table public.user_memories
  add column if not exists evidence_count integer not null default 1,
  add column if not exists importance smallint not null default 5,
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists superseded_at timestamptz;

alter table public.user_memories
  drop constraint if exists user_memories_evidence_count_positive,
  add constraint user_memories_evidence_count_positive
    check (evidence_count >= 1),
  drop constraint if exists user_memories_importance_range,
  add constraint user_memories_importance_range
    check (importance between 0 and 10);

update public.user_memories
set last_confirmed_at = coalesce(last_confirmed_at, updated_at)
where validation_status = 'confirmed' and last_confirmed_at is null;

create index if not exists idx_user_memories_retrieval
  on public.user_memories(
    user_id,
    validation_status,
    importance desc,
    updated_at desc
  )
  where superseded_at is null;

create index if not exists idx_user_memories_topic_active
  on public.user_memories(user_id, lower(topic), memory_kind)
  where superseded_at is null;
