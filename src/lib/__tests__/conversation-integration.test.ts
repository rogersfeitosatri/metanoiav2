import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HOME = join(ROOT, "src/components/chat/ConversationHome.tsx");
const ROUTE = join(ROOT, "src/app/api/ai/chat/route.ts");
const STORE = join(ROOT, "src/lib/store.tsx");
const COGNITIVE_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260831203849_enforce_one_alternative_per_thought.sql"
);

describe("integração do motor canônico", () => {
  it("ConversationHome usa somente a rota canônica", () => {
    const source = readFileSync(HOME, "utf8");
    expect(source).toContain('fetch("/api/ai/chat"');
    expect(source).not.toMatch(/FlowChat|flow-engine|handleStructuredMoment|phaseRef/);
    expect(source).toContain("ConversationEngineResponseSchema.safeParse");
  });

  it("a interface persiste mensagens e só aplica ações estruturadas", () => {
    const source = readFileSync(HOME, "utf8");
    expect(source).toContain("store.addMessage");
    expect(source).toContain("applyActions(data.actions)");
    expect(source).not.toMatch(/automatic_thought|all_or_nothing|difficulty_hunger/);
  });

  it("a rota canônica delega toda decisão ao único orquestrador", () => {
    const source = readFileSync(ROUTE, "utf8");
    expect(source).toContain("orchestrateConversation");
    expect(source).not.toMatch(/localReply|motivationalPrompt|tccPrompt/);
  });

  it("não mantém FlowChat, flow-engine ou endpoint converse concorrente", () => {
    expect(existsSync(join(ROOT, "src/components/chat/FlowChat.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "src/lib/ai/flow-engine.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "src/app/api/ai/converse/route.ts"))).toBe(false);
  });

  it("liga a alternativa ao ThoughtRecord e protege contra duplicação", () => {
    const home = readFileSync(HOME, "utf8");
    const store = readFileSync(STORE, "utf8");
    const migration = readFileSync(COGNITIVE_MIGRATION, "utf8");
    expect(home).toContain('action.type === "upsert_alternative_thought"');
    expect(home).toContain("thought_record_id: linkedThoughtId");
    expect(store).toContain("item.thought_record_id === input.thought_record_id");
    expect(migration).toContain("idx_alternative_thoughts_thought_record_unique");
  });
});
