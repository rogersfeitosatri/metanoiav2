import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types";

// Tabelas cujas chaves no objeto Database são idênticas aos nomes no Postgres.
const TABLES: (keyof Database)[] = [
  "profiles",
  "professionals",
  "professional_user_links",
  "behavioral_goals",
  "coping_cards",
  "meal_checkins",
  "difficulty_events",
  "thought_records",
  "alternative_thoughts",
  "conversations",
  "conversation_messages",
  "strategies",
  "strategy_trials",
  "pattern_snapshots",
  "consistency_scores",
  "weekly_reports",
  "risk_flags",
  "professional_notes",
  "notification_preferences",
  "scheduled_interventions",
  "legal_documents",
  "legal_acceptances",
  "audit_logs",
];

function emptyDb(): Database {
  return {
    profiles: [],
    professionals: [],
    professional_user_links: [],
    behavioral_goals: [],
    coping_cards: [],
    meal_checkins: [],
    difficulty_events: [],
    thought_records: [],
    alternative_thoughts: [],
    conversations: [],
    conversation_messages: [],
    strategies: [],
    strategy_trials: [],
    pattern_snapshots: [],
    consistency_scores: [],
    weekly_reports: [],
    risk_flags: [],
    professional_notes: [],
    notification_preferences: [],
    scheduled_interventions: [],
    legal_documents: [],
    legal_acceptances: [],
    audit_logs: [],
  };
}

// Carrega tudo o que a sessão atual pode ver (a RLS filtra as linhas por papel).
export async function loadDatabase(supabase: SupabaseClient): Promise<Database> {
  const db = emptyDb();
  await Promise.all(
    TABLES.map(async (table) => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        // Não interrompe o carregamento por causa de uma tabela; registra e segue.
        console.warn(`Falha ao carregar ${table}:`, error.message);
        return;
      }
      // @ts-expect-error atribuição dinâmica por nome de tabela
      db[table] = (data || []) as unknown[];
    })
  );
  return db;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Remove chaves undefined antes de enviar ao Postgres.
export function clean<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}
