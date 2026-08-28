import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withDatabaseDefaults } from "../supabase/data";

const ROOT = process.cwd();
const HOME = readFileSync(
  join(ROOT, "src/components/chat/ConversationHome.tsx"),
  "utf8"
);
const STORE = readFileSync(join(ROOT, "src/lib/store.tsx"), "utf8");
const EPISODES = readFileSync(
  join(ROOT, "src/lib/behavioral-episodes.ts"),
  "utf8"
);
const migrationName = readdirSync(join(ROOT, "supabase/migrations")).find((name) =>
  name.endsWith("_behavioral_episodes.sql")
);
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations", migrationName!),
  "utf8"
);
const hardeningMigrationName = readdirSync(join(ROOT, "supabase/migrations")).find(
  (name) => name.endsWith("_harden_behavioral_episode_privileges.sql")
);
const HARDENING_MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations", hardeningMigrationName!),
  "utf8"
);
const relationIndexMigrationName = readdirSync(join(ROOT, "supabase/migrations")).find(
  (name) => name.endsWith("_index_behavioral_episode_relations.sql")
);
const RELATION_INDEX_MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations", relationIndexMigrationName!),
  "utf8"
);
const behavioralRecordMigrationName = readdirSync(
  join(ROOT, "supabase/migrations")
).find((name) => name.endsWith("_complete_behavioral_episode_record.sql"));
const BEHAVIORAL_RECORD_MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations", behavioralRecordMigrationName!),
  "utf8"
);
const behavioralRecordIndexMigrationName = readdirSync(
  join(ROOT, "supabase/migrations")
).find((name) => name.endsWith("_index_behavioral_record_relations.sql"));
const BEHAVIORAL_RECORD_INDEX_MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations", behavioralRecordIndexMigrationName!),
  "utf8"
);

describe("integração dos episódios persistentes", () => {
  it("mensagens e ações recebem o episódio atual", () => {
    expect(HOME).toContain("episode_id: episodeId");
    expect(HOME).toContain("episode_id: episodeId,");
    expect(HOME).toContain("episodeId || undefined");
    expect(EPISODES).toContain("related_difficulty_event_id");
    expect(EPISODES).toContain("related_strategy_trial_id");
  });

  it("o histórico enviado ao motor fica limitado ao episódio atual", () => {
    expect(HOME).toContain("item.episodeId === episodeRef.current?.id");
    expect(HOME).toContain("episode.conversation_state");
    expect(HOME).not.toContain("history.slice(-20).map");
  });

  it("a store serializa gravações com dependências de chave estrangeira", () => {
    expect(STORE).toContain("supabaseWritesRef.current");
    expect(STORE).toContain(".then(operation)");
    expect(STORE).toContain('sbInsert("behavioral_episodes"');
  });

  it("atualiza dificuldade e pensamento do mesmo episódio em modo local e Supabase", () => {
    expect(STORE).toContain("existingEvent");
    expect(STORE).toContain("item.episode_id === episodeId");
    expect(STORE).toContain('sbUpdate("difficulty_events"');
    expect(STORE).toContain('sbUpdate("thought_records"');
    expect(HOME).toContain("event_occurred_at");
    expect(HOME).toContain("event_time_precision");
  });

  it("dados locais antigos ganham coleções ausentes sem perder as existentes", () => {
    const legacy = withDatabaseDefaults({
      profiles: [],
      conversations: [],
      conversation_messages: [],
    });
    expect(legacy.behavioral_episodes).toEqual([]);
    expect(legacy.alternative_thoughts).toEqual([]);
    expect(legacy.meal_checkins).toEqual([]);
  });
});

describe("migration de episódios", () => {
  it("cria estado estruturado e separa evento de registro", () => {
    expect(MIGRATION).toContain("create table if not exists public.behavioral_episodes");
    expect(MIGRATION).toContain("event_occurred_at timestamptz");
    expect(MIGRATION).toContain("conversation_state jsonb");
    expect(MIGRATION).toContain("followup_at timestamptz");
    expect(MIGRATION).toMatch(/status in \('active','resolved','waiting_followup','abandoned'\)/);
  });

  it("preserva dados antigos com referências opcionais e delete set null", () => {
    expect(MIGRATION).toContain("add column if not exists episode_id uuid");
    expect(MIGRATION).toContain("conversation_messages_episode_fk");
    expect(MIGRATION).toContain("meal_checkins_episode_fk");
    expect(MIGRATION).toContain("difficulty_events_episode_fk");
    expect(MIGRATION).toContain("strategy_trials_episode_fk");
    expect(MIGRATION.match(/on delete set null/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it("protege episódios por dono e mantém leitura profissional/admin", () => {
    expect(MIGRATION).toContain("alter table public.behavioral_episodes enable row level security");
    expect(MIGRATION).toContain("user_id = (select auth.uid())");
    expect(MIGRATION).toContain("private.is_linked_professional(user_id)");
    expect(MIGRATION).toContain("(select private.is_admin())");
    expect(MIGRATION).toMatch(/episodes_update[\s\S]*using[\s\S]*with check/);
    expect(MIGRATION).not.toMatch(/grant[^;]*delete[^;]*to authenticated/i);
  });

  it("remove privilégios herdados e libera somente leitura e gravação necessárias", () => {
    expect(HARDENING_MIGRATION).toContain(
      "revoke all privileges on table public.behavioral_episodes from authenticated"
    );
    expect(HARDENING_MIGRATION).toContain(
      "grant select, insert, update on table public.behavioral_episodes to authenticated"
    );
  });

  it("valida que relações pertençam ao mesmo usuário ou conversa", () => {
    expect(MIGRATION).toContain("messages_episode_integrity");
    expect(MIGRATION).toContain("e.conversation_id = conversation_messages.conversation_id");
    expect(MIGRATION).toContain("e.user_id = meal_checkins.user_id");
    expect(MIGRATION).toContain("e.user_id = difficulty_events.user_id");
    expect(MIGRATION).toContain("e.user_id = strategy_trials.user_id");
    expect(MIGRATION.match(/as restrictive for all to authenticated/g)?.length).toBe(4);
  });

  it("inclui índices para retomada, evento, follow-up e relações", () => {
    expect(MIGRATION).toContain("idx_episodes_user_status_updated");
    expect(MIGRATION).toContain("idx_episodes_user_event_time");
    expect(MIGRATION).toContain("idx_episodes_followup_due");
    expect(MIGRATION).toContain("idx_messages_episode_time");
    expect(RELATION_INDEX_MIGRATION).toContain("idx_episodes_related_meal_checkin");
    expect(RELATION_INDEX_MIGRATION).toContain("idx_episodes_related_strategy_trial");
    expect(RELATION_INDEX_MIGRATION).toContain("idx_episodes_related_difficulty_event");
  });

  it("conecta o registro comportamental ao episódio existente", () => {
    for (const column of [
      "context_tags",
      "physical_state",
      "automatic_thought",
      "emotions",
      "behavior",
      "immediate_consequence",
      "later_consequence",
      "recovery_outcome",
      "decision_point",
      "captured_evidence",
    ]) {
      expect(BEHAVIORAL_RECORD_MIGRATION).toContain(column);
    }
    expect(BEHAVIORAL_RECORD_MIGRATION).toContain("event_time_description");
    expect(BEHAVIORAL_RECORD_MIGRATION).toContain("event_time_precision");
    expect(BEHAVIORAL_RECORD_INDEX_MIGRATION).toContain(
      "idx_thought_records_difficulty_event"
    );
  });
});
