import { describe, expect, it } from "vitest";
import {
  extractBehavioralData,
  groundedModelCapture,
  mergeCapturedDataIntoState,
} from "../ai/behavioral-capture";
import {
  createConversationState,
  runDeterministicTurn,
} from "../ai/conversation";
import {
  ConversationContextSchema,
  ConversationEngineStateSchema,
} from "../ai/schemas";

const CONTEXT = ConversationContextSchema.parse({});

describe("extração comportamental adaptativa", () => {
  it("extrai situação, emoção e comportamento da mesma mensagem", () => {
    const turn = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Briguei com meu namorado, fiquei ansiosa e fui comer doce.",
      CONTEXT
    );
    expect(turn.state.situation).toContain("Briguei");
    expect(turn.state.emotions).toContain("ansiedade");
    expect(turn.state.behavior).toMatch(/fui comer doce/i);
    expect(turn.state.stage).toBe("hunger");
    expect(turn.decision.reply).not.toMatch(/emoção|ansiedade/i);
    const afterHunger = runDeterministicTurn(turn.state, "3", CONTEXT);
    expect(afterHunger.state.stage).toBe("emotion");
    expect(afterHunger.decision.reply).toMatch(/mais forte|sentindo/i);
  });

  it("não pergunta novamente um pensamento já informado", () => {
    const turn = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Comi pizza no almoço e pensei: já estraguei tudo.",
      CONTEXT
    );
    expect(turn.state.automatic_thought).toMatch(/já estraguei tudo/i);
    expect(turn.state.stage).toBe("hunger");
    expect(turn.decision.reply).not.toMatch(/passou pela tua cabeça/i);
  });

  it("trata reunião que impediu o almoço como problema prático", () => {
    const turn = runDeterministicTurn(
      createConversationState("register_event", CONTEXT),
      "Não almocei porque fiquei em reunião até quatro da tarde.",
      CONTEXT
    );
    expect(turn.state.main_influencing_factor).toBe("practical");
    expect(turn.state.stage).toBe("context");
    expect(turn.decision.reply).toMatch(/costuma acontecer|exceção/i);
    expect(turn.decision.reply).not.toMatch(/emoção|sentindo/i);
  });

  it("mantém fome e cansaço como estado físico, não como emoção", () => {
    const captured = extractBehavioralData(
      "Cheguei em casa cansada, com fome 10, porque não comia desde meio-dia."
    );
    expect(captured.hunger_intensity).toBe(10);
    expect(captured.physical_state).toEqual(expect.arrayContaining(["fome", "cansaço"]));
    expect(captured.emotions).toBeUndefined();
    expect(captured.main_influencing_factor).toBe("physical");
  });

  it("ajuda quando a pessoa não sabe o pensamento sem gravar um exemplo", () => {
    const state = ConversationEngineStateSchema.parse({
      intent: "register_event",
      stage: "thought",
      asked: ["situation"],
      situation: "Fui comer doce depois de uma discussão",
      emotions: ["ansiedade"],
      behavior: "fui comer doce",
    });
    const turn = runDeterministicTurn(state, "Não sei", CONTEXT);
    expect(turn.state.stage).toBe("thought");
    expect(turn.state.automatic_thought).toBeUndefined();
    expect(turn.decision.quick_replies).toContain("Eu mereço");
  });

  it("não transforma uma hipótese do modelo em fato", () => {
    const deterministic = extractBehavioralData("Pedi comida depois do trabalho.");
    const grounded = groundedModelCapture(
      { emotion: "frustração", emotions: ["frustração"] },
      "Pedi comida depois do trabalho.",
      deterministic
    );
    expect(grounded.emotion).toBeUndefined();
    expect(grounded.emotions).toEqual([]);
  });

  it("complementa emoções sem sobrescrever nem duplicar", () => {
    const state = ConversationEngineStateSchema.parse({
      intent: "register_event",
      stage: "emotion",
      emotions: ["ansiedade"],
    });
    const merged = mergeCapturedDataIntoState(state, {
      emotions: ["ansiedade", "raiva"],
      emotion: "ansiedade",
    });
    expect(merged.emotions).toEqual(["ansiedade", "raiva"]);
  });

  it("extrai intensidade explícita e não salva 'nenhuma dessas' como emoção", () => {
    expect(extractBehavioralData("Minha ansiedade tava 8.").emotional_intensity).toBe(8);
    const state = ConversationEngineStateSchema.parse({
      intent: "register_event",
      stage: "emotion",
      situation: "Fui comer depois de uma discussão",
      behavior: "fui comer",
    });
    const turn = runDeterministicTurn(state, "Nenhuma dessas", CONTEXT);
    expect(turn.state.emotions).toEqual([]);
    expect(turn.state.emotion).toBeUndefined();
    expect(turn.state.stage).toBe("recovery");
  });

  it("registra retomada, continuação e compensação sem normalizar", () => {
    expect(extractBehavioralData("Depois retomei e segui normalmente.").recovery_outcome)
      .toBe("retomou");
    expect(extractBehavioralData("Aquilo puxou o resto do dia.").recovery_outcome)
      .toBe("abandonou_dia");
    const compensation = extractBehavioralData("Amanhã não vou comer para compensar.");
    expect(compensation.recovery_outcome).toBe("compensou");
    expect(compensation.compensatory_behavior).toMatch(/não vou comer/i);
  });
});
