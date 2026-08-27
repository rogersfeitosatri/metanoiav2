import { describe, expect, it } from "vitest";
import type { ZodSchema } from "zod";
import {
  createConversationState,
  createOpeningTurn,
  runDeterministicTurn,
} from "../ai/conversation";
import { orchestrateConversation } from "../ai/conversation-orchestrator";
import type { AIInput, AIProvider } from "../ai/provider";
import {
  ConversationContextSchema,
  ConversationDecisionSchema,
  ConversationEngineResponseSchema,
  ConversationEngineStateSchema,
  ConversationRequestSchema,
  type ConversationContext,
  type ConversationDecision,
  type ConversationRequest,
} from "../ai/schemas";
import { analyzeSafetyLocal } from "../ai/safety";

const EMPTY_CONTEXT = ConversationContextSchema.parse({});

class StubProvider implements AIProvider {
  calls = 0;

  constructor(
    public name: string,
    private value: unknown,
    private shouldFail = false
  ) {}

  async generateStructuredResponse<T>(
    _input: AIInput,
    _schema: ZodSchema<T>
  ): Promise<T> {
    this.calls += 1;
    if (this.shouldFail) throw new Error("provider unavailable");
    return this.value as T;
  }
}

function context(
  patch: Partial<ConversationContext> = {}
): ConversationContext {
  return ConversationContextSchema.parse(patch);
}

function request(
  patch: Partial<ConversationRequest> = {}
): ConversationRequest {
  return ConversationRequestSchema.parse({
    operation: "message",
    message: "Mensagem de teste",
    intent: patch.intent || patch.state?.intent || "default",
    context: EMPTY_CONTEXT,
    ...patch,
  });
}

describe("aberturas por intenção", () => {
  it.each([
    ["help_now", "O que tá pegando agora?", "situation"],
    ["register_event", "Me conta o que aconteceu", "situation"],
    ["prepare", "se preparar", "prepare_situation"],
    ["review_strategy", "estratégia", "strategy_review"],
    ["meal_checkin", "refeição", "meal_selection"],
  ] as const)("respeita %s", (intent, text, stage) => {
    const opening = createOpeningTurn(intent, EMPTY_CONTEXT);
    expect(opening.decision.reply).toContain(text);
    expect(opening.state.stage).toBe(stage);
  });

  it("retoma a estratégia pendente na revisão", () => {
    const opening = createOpeningTurn(
      "review_strategy",
      context({ pending_strategies: [{ id: "trial-1", title: "Fazer uma pausa" }] })
    );
    expect(opening.decision.reply).toContain("Fazer uma pausa");
    expect(opening.state.pending_strategy_id).toBe("trial-1");
  });

  it("reconhece a refeição devida no check-in", () => {
    const opening = createOpeningTurn(
      "meal_checkin",
      context({ meals: [{ id: "meal-1", name: "Almoço", time: "12:00", due: true }] })
    );
    expect(opening.state.stage).toBe("meal_status");
    expect(opening.decision.reply).toContain("Almoço");
  });

  it("default não ignora uma estratégia pendente relevante", () => {
    const opening = createOpeningTurn(
      "default",
      context({ pending_strategies: [{ id: "trial-2", title: "Levar um lanche" }] })
    );
    expect(opening.state.stage).toBe("strategy_review");
    expect(opening.decision.reply).toContain("Levar um lanche");
  });
});

describe("adaptação determinística", () => {
  it("reformula não entendi sem avançar nem capturar resposta", () => {
    const state = ConversationEngineStateSchema.parse({
      intent: "register_event",
      stage: "hunger",
      asked: ["situation"],
      situation: "Comi doce depois do almoço",
    });
    const turn = runDeterministicTurn(state, "Não entendi", EMPTY_CONTEXT);
    expect(turn.state.stage).toBe("hunger");
    expect(turn.state.hunger_level).toBeUndefined();
    expect(turn.decision.needs_clarification).toBe(true);
    expect(turn.decision.reply).toMatch(/falei meio complicado/i);
  });

  it("oferece outro caminho para não sei sem marcar o campo respondido", () => {
    const state = ConversationEngineStateSchema.parse({
      intent: "register_event",
      stage: "thought",
      asked: ["situation", "hunger"],
      situation: "Comi um monte de doce",
      hunger_level: 4,
    });
    const turn = runDeterministicTurn(state, "Não sei", EMPTY_CONTEXT);
    expect(turn.state.stage).toBe("thought");
    expect(turn.state.automatic_thought).toBeUndefined();
    expect(turn.decision.quick_replies).toContain("Já estraguei tudo");
  });

  it("reconhece fome física alta antes de interpretação emocional", () => {
    const state = createConversationState("register_event", EMPTY_CONTEXT);
    const turn = runDeterministicTurn(
      state,
      "Não comia desde o almoço e cheguei em casa com fome 10",
      EMPTY_CONTEXT
    );
    expect(turn.state.hunger_level).toBe(10);
    expect(turn.state.stage).toBe("physical_context");
    expect(turn.decision.reply).toMatch(/dado concreto|fome tava 10\/10/i);
    expect(turn.decision.reply).not.toMatch(/emoção|ansiedade/i);
  });

  it("não pergunta novamente fome e pensamento já fornecidos", () => {
    const state = createConversationState("register_event", EMPTY_CONTEXT);
    const first = runDeterministicTurn(
      state,
      "Fiquei seis horas sem comer, cheguei com fome 10 e pensei: já estraguei tudo",
      EMPTY_CONTEXT
    );
    const second = runDeterministicTurn(
      first.state,
      "Isso costuma acontecer",
      EMPTY_CONTEXT
    );
    expect(second.state.stage).toBe("consequence");
    expect(second.decision.reply).toContain("o que exatamente foi estragado");
    expect(second.decision.reply).not.toContain("quanto");
  });

  it("examina já estraguei tudo sem frase motivacional pronta", () => {
    const state = createConversationState("register_event", EMPTY_CONTEXT);
    const turn = runDeterministicTurn(state, "Já estraguei tudo mesmo", EMPTY_CONTEXT);
    expect(turn.state.stage).toBe("consequence");
    expect(turn.decision.reply).toContain("o que exatamente foi estragado");
    expect(turn.decision.reply).not.toMatch(/jornada|gentil consigo|processo/i);
  });

  it("prepara uma situação dentro do mesmo motor", () => {
    const state = createConversationState("prepare", EMPTY_CONTEXT);
    const turn = runDeterministicTurn(
      state,
      "Um jantar com colegas amanhã",
      EMPTY_CONTEXT
    );
    expect(turn.state.stage).toBe("prepare_obstacle");
    expect(turn.decision.reply).toContain("mais difícil");
  });

  it("check-in produz ação estruturada sem gravar diretamente", () => {
    const ctx = context({
      meals: [{ id: "meal-2", name: "Jantar", time: "20:00", due: true }],
    });
    const state = createConversationState("meal_checkin", ctx);
    const turn = runDeterministicTurn(state, "Realizei em parte", ctx);
    expect(turn.actions).toContainEqual({
      type: "create_meal_checkin",
      schedule_id: "meal-2",
      meal_name: "Jantar",
      status: "partial",
    });
    expect(turn.state.stage).toBe("meal_difficulty_consent");
  });

  it("revisão avaliada gera atualização, não classificação automática", () => {
    const ctx = context({
      pending_strategies: [{ id: "trial-3", title: "Fazer uma pausa" }],
    });
    const state = createConversationState("review_strategy", ctx);
    const turn = runDeterministicTurn(state, "Ajudou em parte", ctx);
    expect(turn.actions[0]).toMatchObject({
      type: "update_strategy_trial",
      strategy_trial_id: "trial-3",
      result: "partially_helped",
    });
  });
});

describe("contrato, provedor e fallback", () => {
  const validAiDecision: ConversationDecision = ConversationDecisionSchema.parse({
    reply: "A comida apareceu como alívio rápido. O que tu tava sentindo nessa hora?",
    quick_replies: ["Frustração", "Cansaço", "Raiva"],
    next_stage: "emotion",
    response_kind: "question",
    needs_clarification: false,
    suggest_close: false,
  });

  function thoughtState() {
    return ConversationEngineStateSchema.parse({
      intent: "register_event",
      stage: "thought",
      asked: ["situation", "hunger"],
      situation: "Comi depois de um dia ruim",
      hunger_level: 3,
    });
  }

  it("IA e fallback devolvem o mesmo contrato validado", async () => {
    const local = await orchestrateConversation(
      request({ state: thoughtState(), message: "Eu merecia alguma coisa boa" }),
      { llmConfigured: false }
    );
    const ai = await orchestrateConversation(
      request({ state: thoughtState(), message: "Eu merecia alguma coisa boa" }),
      {
        llmConfigured: true,
        provider: new StubProvider("gemini", validAiDecision),
      }
    );
    expect(ConversationEngineResponseSchema.safeParse(local).success).toBe(true);
    expect(ConversationEngineResponseSchema.safeParse(ai).success).toBe(true);
    expect(local.source).toBe("local");
    expect(ai.source).toBe("ai");
  });

  it.each(["gemini", "openai", "anthropic"])(
    "%s usa o mesmo schema",
    async (name) => {
      const result = await orchestrateConversation(
        request({ state: thoughtState(), message: "Eu merecia alguma coisa boa" }),
        {
          llmConfigured: true,
          provider: new StubProvider(name, validAiDecision),
        }
      );
      expect(result.provider).toBe(name);
      expect(result.next_stage).toBe("emotion");
    }
  );

  it("saída inválida do provedor aciona o fallback", async () => {
    const result = await orchestrateConversation(
      request({ state: thoughtState(), message: "Eu merecia alguma coisa boa" }),
      {
        llmConfigured: true,
        provider: new StubProvider("gemini", { reply: 42 }),
      }
    );
    expect(result.source).toBe("local");
    expect(result.state.stage).toBe("emotion");
  });

  it("falha do provedor não quebra nem perde estágio", async () => {
    const state = thoughtState();
    const result = await orchestrateConversation(
      request({ state, message: "Eu merecia alguma coisa boa" }),
      {
        llmConfigured: true,
        provider: new StubProvider("openai", null, true),
      }
    );
    expect(result.source).toBe("local");
    expect(result.state.intent).toBe("register_event");
    expect(result.state.stage).toBe("emotion");
  });

  it("sem IA configurada mantém intenção e dados estruturados", async () => {
    const state = createConversationState("help_now", EMPTY_CONTEXT);
    const result = await orchestrateConversation(
      request({
        intent: "help_now",
        state,
        message: "Tô com muita vontade de comer agora",
      }),
      { llmConfigured: false }
    );
    expect(result.source).toBe("local");
    expect(result.state.intent).toBe("help_now");
    expect(result.state.stage).toBe("hunger");
    expect(result.captured_data?.situation).toContain("vontade");
  });
});

describe("segurança antes do modelo", () => {
  it("interrompe risco relevante sem chamar o LLM", async () => {
    const provider = new StubProvider("gemini", {});
    const message = "Eu quero me matar";
    const result = await orchestrateConversation(
      request({
        state: createConversationState("help_now", EMPTY_CONTEXT),
        message,
      }),
      {
        llmConfigured: true,
        provider,
        safety: analyzeSafetyLocal(message),
        alertRecorded: false,
      }
    );
    expect(provider.calls).toBe(0);
    expect(result.source).toBe("safety");
    expect(result.safety.interrupted).toBe(true);
    expect(result.actions).toEqual([]);
  });

  it("não afirma que profissional foi avisado", async () => {
    const message = "Usei laxante para compensar";
    const result = await orchestrateConversation(
      request({
        state: createConversationState("register_event", EMPTY_CONTEXT),
        message,
      }),
      {
        llmConfigured: true,
        provider: new StubProvider("gemini", {}),
        safety: analyzeSafetyLocal(message),
        alertRecorded: false,
      }
    );
    expect(result.reply).not.toMatch(/avisei|foi avisado|notifiquei|registrei/i);
  });
});
