import { describe, expect, it } from "vitest";
import { resolveAlternativeThought } from "../alternative-thoughts";
import { orchestrateConversation } from "../ai/conversation-orchestrator";
import {
  createConversationState,
  runDeterministicTurn,
} from "../ai/conversation";
import { analyzeSafetyLocal } from "../ai/safety";
import {
  ConversationContextSchema,
  ConversationEngineStateSchema,
  ConversationRequestSchema,
} from "../ai/schemas";
import type { AIInput, AIProvider } from "../ai/provider";
import type { ZodSchema } from "zod";

const CONTEXT = ConversationContextSchema.parse({});

function cognitiveState(
  stage: "cognitive_examine" | "cognitive_perspective" | "alternative" | "alternative_belief" | "alternative_refine",
  patch: Record<string, unknown> = {}
) {
  return ConversationEngineStateSchema.parse({
    intent: "register_event",
    stage,
    asked: ["situation", "hunger", "cognitive_effect"],
    situation: "Comi pizza no almoço e pensei que já tinha estragado tudo",
    hunger_level: 4,
    automatic_thought: "já estraguei tudo",
    thought_self_identified: true,
    all_or_nothing: true,
    behavior: "continuei comendo",
    thought_effect: "continuei porque achei que não fazia diferença",
    main_influencing_factor: "cognitive",
    ...patch,
  });
}

describe("habilidade cognitiva central", () => {
  it("examina um pensamento tudo-ou-nada sem entregar um clichê", () => {
    const first = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Comi uma coisa fora do plano e pensei que já tinha estragado tudo.",
      CONTEXT
    );
    expect(first.state.stage).toBe("hunger");

    const afterHunger = runDeterministicTurn(first.state, "4", CONTEXT);
    expect(afterHunger.state.stage).toBe("cognitive_effect");
    expect(afterHunger.decision.reply).toMatch(/o que aconteceu depois/i);
    expect(afterHunger.decision.reply).not.toMatch(/jornada|gentil consigo|pense positivo/i);

    const examined = runDeterministicTurn(
      afterHunger.state,
      "Continuei comendo porque achei que não fazia mais diferença.",
      CONTEXT
    );
    expect(examined.state.stage).toBe("cognitive_examine");
    expect(examined.decision.reply).toMatch(/o que exatamente foi estragado/i);
  });

  it("não pergunta novamente um pensamento já identificado", () => {
    const turn = runDeterministicTurn(
      cognitiveState("cognitive_examine"),
      "Na verdade foi só aquele almoço.",
      CONTEXT
    );
    expect(turn.state.stage).toBe("cognitive_perspective");
    expect(turn.decision.reply).not.toMatch(/o que passou pela tua cabeça/i);
  });

  it("persiste a alternativa construída com crença e estado inicial pendente", () => {
    const perspective = runDeterministicTurn(
      cognitiveState("cognitive_perspective", {
        cognitive_examination: "Foi só o almoço, não tudo.",
      }),
      "Não, o jantar ainda pode ser uma decisão separada.",
      CONTEXT
    );
    expect(perspective.state.stage).toBe("alternative");

    const built = runDeterministicTurn(
      perspective.state,
      "Foi uma refeição diferente, mas ainda posso seguir normalmente.",
      CONTEXT
    );
    expect(built.state.stage).toBe("alternative_belief");
    expect(built.decision.reply).toMatch(/0 a 10/i);

    const believed = runDeterministicTurn(built.state, "8", CONTEXT);
    expect(believed.state.stage).toBe("done");
    expect(believed.state.belief_level).toBe(8);
    expect(believed.actions).toContainEqual({
      type: "upsert_alternative_thought",
      original_thought: "já estraguei tudo",
      alternative: "Foi uma refeição diferente, mas ainda posso seguir normalmente.",
      belief_level: 8,
    });
    expect(believed.actions.some((action) => action.type === "record_difficulty")).toBe(true);
  });

  it("não conclui uma alternativa com crença 3 ou menor", () => {
    const turn = runDeterministicTurn(
      cognitiveState("alternative_belief", {
        alternative: "Eu consigo controlar tudo.",
        cognitive_stage: "checking_belief",
      }),
      "2",
      CONTEXT
    );
    expect(turn.state.stage).toBe("alternative_refine");
    expect(turn.state.belief_level).toBe(2);
    expect(turn.decision.captured_data?.alternative_thought).toBeUndefined();
    expect(turn.actions.some((action) => action.type === "upsert_alternative_thought"))
      .toBe(false);
  });

  it("oferece possibilidades quando a pessoa não sabe sem salvá-las", () => {
    const turn = runDeterministicTurn(
      cognitiveState("alternative", {
        cognitive_stage: "building_alternative",
      }),
      "Não sei",
      CONTEXT
    );
    expect(turn.state.stage).toBe("alternative");
    expect(turn.state.alternative).toBeUndefined();
    expect(turn.decision.quick_replies).toContain("Ainda posso decidir o que faço depois.");
    expect(turn.actions.some((action) => action.type === "upsert_alternative_thought"))
      .toBe(false);
  });

  it("questiona generalização sem aceitá-la como fato", () => {
    const first = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Eu nunca consigo me controlar.",
      CONTEXT
    );
    const examined = runDeterministicTurn(first.state, "Acabei continuando.", CONTEXT);
    expect(examined.state.stage).toBe("cognitive_examine");
    expect(examined.decision.reply).toMatch(/qualquer situação|momentos específicos/i);
  });

  it("mantém problema prático e fome alta antes do trabalho cognitivo", () => {
    const practical = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Não almocei porque fiquei em reunião até quatro da tarde.",
      CONTEXT
    );
    expect(practical.state.stage).toBe("context");

    const hunger = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Não comia desde o almoço, cheguei com fome 10 e pensei que tinha estragado tudo.",
      CONTEXT
    );
    expect(hunger.state.stage).toBe("physical_context");
    expect(hunger.decision.reply).not.toMatch(/o que exatamente foi estragado/i);
  });

  it("retoma o estágio cognitivo após serializar o estado", () => {
    const persisted = JSON.parse(JSON.stringify(cognitiveState("alternative_refine", {
      alternative: "Eu consigo controlar tudo.",
      belief_level: 2,
      cognitive_stage: "refining_alternative",
    })));
    const turn = runDeterministicTurn(
      ConversationEngineStateSchema.parse(persisted),
      "Talvez eu não controle a vontade, mas posso decidir depois que percebo.",
      CONTEXT
    );
    expect(turn.state.stage).toBe("alternative");
    expect(turn.state.alternative_doubt).toContain("Talvez");
  });
});

describe("persistência e segurança cognitiva", () => {
  it("reformula a mesma alternativa sem criar outro registro", () => {
    const created = resolveAlternativeThought(undefined, {
      user_id: "user-1",
      thought_record_id: "thought-1",
      original_thought: "Já estraguei tudo",
      alternative: "Ainda posso decidir o que faço depois.",
      belief_level: 5,
    }, "alt-1", "2026-08-31T10:00:00.000Z");
    const revised = resolveAlternativeThought(created, {
      user_id: "user-1",
      thought_record_id: "thought-1",
      original_thought: "Já estraguei tudo",
      alternative: "O almoço saiu diferente, mas eu ainda posso retomar.",
      belief_level: 8,
    }, "alt-2", "2026-08-31T10:05:00.000Z");
    expect(created.result).toBe("pending");
    expect(created.times_used).toBe(0);
    expect(revised.id).toBe("alt-1");
    expect(revised.alternative).toMatch(/ainda posso retomar/i);
    expect(revised.belief_level).toBe(8);
  });

  it("interrompe risco antes do modelo durante o trabalho cognitivo", async () => {
    class CountingProvider implements AIProvider {
      name = "gemini";
      calls = 0;
      async generateStructuredResponse<T>(
        _input: AIInput,
        _schema: ZodSchema<T>
      ): Promise<T> {
        this.calls += 1;
        return {} as T;
      }
    }
    const provider = new CountingProvider();
    const message = "Eu quero me matar";
    const request = ConversationRequestSchema.parse({
      operation: "message",
      message,
      intent: "register_event",
      state: cognitiveState("cognitive_examine"),
      history: [],
      context: CONTEXT,
    });
    const result = await orchestrateConversation(request, {
      llmConfigured: true,
      provider,
      safety: analyzeSafetyLocal(message),
    });
    expect(provider.calls).toBe(0);
    expect(result.source).toBe("safety");
    expect(result.safety.interrupted).toBe(true);
  });
});
