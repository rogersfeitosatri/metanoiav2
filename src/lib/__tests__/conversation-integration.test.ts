import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HOME = join(ROOT, "src/components/chat/ConversationHome.tsx");
const ROUTE = join(ROOT, "src/app/api/ai/chat/route.ts");

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
});
