import { describe, expect, it } from "vitest";
import { createConversationState, runDeterministicTurn } from "../ai/conversation";
import { orchestrateConversation } from "../ai/conversation-orchestrator";
import {
  ConversationContextSchema,
  ConversationEngineStateSchema,
  ConversationRequestSchema,
} from "../ai/schemas";
import { stableEffectiveStrategyTitles, strategyKey } from "../microexperiments";
import type { StrategyTrial } from "../types";

const EMPTY = ConversationContextSchema.parse({});

function experimentState(patch: Record<string, unknown> = {}) {
  return ConversationEngineStateSchema.parse({
    intent: "register_event",
    stage: "experiment_action",
    asked: ["situation", "behavior", "recovery", "intervention_point"],
    situation: "Cheguei em casa com fome alta e comecei a beliscar",
    behavior: "belisquei enquanto fazia o jantar",
    hunger_level: 10,
    main_influencing_factor: "physical",
    decision_point: "antes de chegar em casa",
    ...patch,
  });
}

function pendingContext(patch: Record<string, unknown> = {}) {
  return ConversationContextSchema.parse({
    pending_strategies: [
      {
        id: "trial-1",
        title: "Se eu chegar em casa com fome alta, então vou perceber antes de decidir",
        strategy_key: "micro-1",
        trigger_context: "chegar em casa com fome alta",
        experiment_action: "perceber antes de decidir",
        test_objective: "aumentar a margem de escolha",
        confidence_level: 8,
        ...patch,
      },
    ],
  });
}

describe("construção do microexperimento", () => {
  it("registra gatilho, ação, objetivo, confiança e começa como não testado", () => {
    const action = runDeterministicTurn(
      experimentState(),
      "Perceber a fome antes de ela passar de 7",
      EMPTY
    );
    const trigger = runDeterministicTurn(
      action.state,
      "Quando eu sair do trabalho ainda sem ter comido",
      EMPTY
    );
    const confidence = runDeterministicTurn(trigger.state, "8", EMPTY);
    expect(confidence.state.stage).toBe("done");
    expect(confidence.state.strategy_recorded).toBe(true);
    expect(confidence.actions).toContainEqual(
      expect.objectContaining({
        type: "create_strategy_trial",
        trigger_context: "Quando eu sair do trabalho ainda sem ter comido",
        experiment_action: "Perceber a fome antes de ela passar de 7",
        confidence_level: 8,
      })
    );
  });

  it("confiança 2/10 simplifica antes de registrar", () => {
    const state = experimentState({
      stage: "experiment_confidence",
      experiment_action: "fazer uma pausa",
      experiment_trigger: "quando eu chegar em casa",
      experiment_objective: "aumentar a margem de escolha",
    });
    const turn = runDeterministicTurn(state, "2", EMPTY);
    expect(turn.state.stage).toBe("experiment_adjust");
    expect(turn.actions.some((item) => item.type === "create_strategy_trial")).toBe(false);
    expect(turn.decision.reply).toMatch(/grande demais|versão menor/i);
  });

  it("confiança 8/10 permite combinar o teste", () => {
    const state = experimentState({
      stage: "experiment_confidence",
      experiment_action: "fazer uma pausa de dois minutos",
      experiment_trigger: "quando eu abrir o delivery",
      experiment_objective: "decidir com mais calma",
    });
    const turn = runDeterministicTurn(state, "8", EMPTY);
    expect(turn.actions.some((item) => item.type === "create_strategy_trial")).toBe(true);
  });

  it("problema prático oferece resolução prática", () => {
    const state = experimentState({
      main_influencing_factor: "practical",
      hunger_level: 4,
      situation: "Uma reunião recorrente atravessa o almoço",
    });
    const turn = runDeterministicTurn(state, "Não sei", EMPTY);
    expect(turn.decision.quick_replies.join(" ")).toMatch(/plano B|horário/i);
    expect(turn.decision.reply).not.toMatch(/pensamento|emoção/i);
  });

  it("usa a resposta alternativa existente sem misturá-la com a ação", () => {
    const state = experimentState({
      automatic_thought: "já estraguei tudo",
      alternative: "uma refeição diferente não decide o restante do dia",
      main_influencing_factor: "cognitive",
    });
    const turn = runDeterministicTurn(state, "Não sei", EMPTY);
    expect(turn.decision.quick_replies.join(" ")).toMatch(/lembrar dessa frase/i);
  });

  it("não transforma compensação em estratégia", () => {
    const turn = runDeterministicTurn(
      experimentState(),
      "Amanhã não vou jantar para compensar",
      EMPTY
    );
    expect(turn.state.stage).toBe("experiment_action");
    expect(turn.actions.some((item) => item.type === "create_strategy_trial")).toBe(false);
    expect(turn.decision.reply).toMatch(/não vou guardar|punição/i);
  });
});

describe("acompanhamento da tentativa", () => {
  it("retoma a estratégia correta e pergunta primeiro se a situação ocorreu", () => {
    const state = createConversationState("review_strategy", pendingContext());
    expect(state.pending_strategy_id).toBe("trial-1");
    const turn = runDeterministicTurn(state, "Sim, e testei", pendingContext());
    expect(turn.state.stage).toBe("strategy_review_change");
  });

  it("preserva ajudou parcialmente como resultado intermediário", () => {
    const state = ConversationEngineStateSchema.parse({
      ...createConversationState("review_strategy", pendingContext()),
      stage: "strategy_review_change",
    });
    const turn = runDeterministicTurn(state, "Testei e ajudou um pouco", pendingContext());
    expect(turn.actions).toContainEqual(
      expect.objectContaining({ type: "update_strategy_trial", result: "partially_helped" })
    );
    expect(turn.state.stage).toBe("strategy_review_barrier");
  });

  it("situação não ocorrida não vira ineficácia", () => {
    const state = createConversationState("review_strategy", pendingContext());
    const turn = runDeterministicTurn(state, "Ainda não aconteceu", pendingContext());
    expect(turn.actions).toContainEqual(
      expect.objectContaining({ result: "situation_not_occurred" })
    );
    expect(turn.decision.reply).toMatch(/não existe evidência/i);
  });

  it("não lembrou é diferente de falha e procura um sinal melhor", () => {
    const state = createConversationState("review_strategy", pendingContext());
    const turn = runDeterministicTurn(
      state,
      "Aconteceu, mas não lembrei",
      pendingContext()
    );
    expect(turn.actions).toContainEqual(expect.objectContaining({ result: "did_not_use" }));
    expect(turn.state.stage).toBe("strategy_review_barrier");
    expect(turn.decision.reply).toMatch(/aparecer na hora certa/i);
  });

  it("atualiza pensamento alternativo apenas com evidência relatada", () => {
    const ctx = pendingContext({
      alternative_thought_id: "alt-1",
      alternative_thought: "a próxima decisão continua sendo minha",
    });
    const state = ConversationEngineStateSchema.parse({
      ...createConversationState("review_strategy", ctx),
      stage: "strategy_review_cognitive",
      strategy_review_result: "helped",
    });
    const turn = runDeterministicTurn(state, "Lembrei e agi diferente", ctx);
    expect(turn.actions).toContainEqual({
      type: "update_alternative_thought_result",
      alternative_thought_id: "alt-1",
      result: "helped_changed",
    });
  });
});

describe("evidência e segurança", () => {
  const trial = (id: string, result: StrategyTrial["result"]): StrategyTrial => ({
    id,
    user_id: "user-1",
    episode_id: null,
    strategy_id: null,
    strategy_key: "same-strategy",
    difficulty_event_id: null,
    planned_for: null,
    tested_at: result === "helped" ? new Date().toISOString() : null,
    result,
    user_feedback: null,
    title_snapshot: "Fazer uma pausa no gatilho",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it("uma tentativa ajudou não vira estratégia globalmente eficaz", () => {
    expect(stableEffectiveStrategyTitles([trial("1", "helped")])).toEqual([]);
    expect(
      stableEffectiveStrategyTitles([trial("1", "helped"), trial("2", "helped")])
    ).toEqual(["Fazer uma pausa no gatilho"]);
  });

  it("a mesma definição mantém chave estável para várias tentativas", () => {
    expect(strategyKey("Ao chegar em casa", "Fazer uma pausa")).toBe(
      strategyKey("ao chegar em casa", "fazer uma pausa")
    );
  });

  it("segurança interrompe estratégia compensatória antes do motor normal", async () => {
    const req = ConversationRequestSchema.parse({
      operation: "message",
      message: "Amanhã não vou jantar para compensar",
      intent: "register_event",
      state: experimentState(),
      context: EMPTY,
    });
    const result = await orchestrateConversation(req, { llmConfigured: false });
    expect(result.source).toBe("safety");
    expect(result.actions).toHaveLength(0);
  });
});
