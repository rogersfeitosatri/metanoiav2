import { describe, it, expect } from "vitest";
import {
  buildInsights,
  insightFeedbackMemory,
  type InsightsInput,
} from "../insights";
import { withDatabaseDefaults } from "../supabase/data";
import { initialEpisodeFields } from "../behavioral-episodes";
import type {
  BehavioralEpisode,
  StrategyTrial,
  AlternativeThought,
  CopingCard,
} from "../types";

const now = new Date("2026-10-05T22:00:00Z");
const at = "2026-10-02T20:00:00Z";
function episode(
  id: string,
  patch: Partial<BehavioralEpisode> = {},
): BehavioralEpisode {
  return {
    ...initialEpisodeFields("register_event"),
    id,
    user_id: "u",
    conversation_id: `c-${id}`,
    status: "resolved",
    started_at: at,
    created_at: at,
    updated_at: at,
    situation: "O almoço atrasou e cheguei com fome alta e vontade de doce",
    hunger_level: 10,
    event_occurred_at: at,
    event_time_precision: "exact",
    ...patch,
  } as BehavioralEpisode;
}
function input(
  count = 3,
  patch: Partial<BehavioralEpisode> = {},
): InsightsInput {
  return {
    userId: "u",
    now,
    timezone: "America/Sao_Paulo",
    db: withDatabaseDefaults({
      behavioral_episodes: Array.from({ length: count }, (_, i) =>
        episode(String(i), patch),
      ),
    }),
  };
}
function trial(id: string, result: StrategyTrial["result"]): StrategyTrial {
  return {
    id,
    user_id: "u",
    strategy_id: "s",
    title_snapshot: "Combinar um plano B antes da reunião",
    result,
    created_at: at,
    updated_at: at,
  };
}
function alternative(
  patch: Partial<AlternativeThought> = {},
): AlternativeThought {
  return {
    id: "a",
    user_id: "u",
    original_thought: "Já estraguei tudo",
    alternative: "A próxima escolha continua sendo minha",
    belief_level: 8,
    result: "pending",
    times_used: 0,
    created_at: at,
    updated_at: at,
    ...patch,
  };
}
describe("Aprendizados por evidência", () => {
  it("emoção confirmada não valida outra emoção apenas proposta", () => {
    const i = input(3, {
      situation: "Fui a uma festa com amigos",
      hunger_level: null,
      emotions: ["raiva", "ansiedade"],
      event_occurred_at: "2026-10-02T23:00:00Z",
      captured_evidence: [
        {
          field: "emotion",
          value: "raiva",
          status: "reported",
          source: "user",
          confidence: 1,
          evidence: "raiva",
        },
        {
          field: "emotion",
          value: "ansiedade",
          status: "proposed",
          source: "ai",
          confidence: 0.5,
          evidence: "talvez",
        },
      ],
    });
    expect(
      buildInsights(i).blocks.some((b) => b.key === "anxiety-social-night"),
    ).toBe(false);
  });
  it.each([0, 1, 2])("%i episódios não viram padrão", (n) => {
    const result = buildInsights(input(n));
    expect(result.blocks).toEqual([]);
    expect(result.practice).toBeNull();
  });
  it("combina fome alta e almoço atrasado no mesmo episódio", () => {
    const r = buildInsights(input());
    expect(r.blocks[0].key).toBe("delayed-meal-hunger");
    expect(r.blocks[0].status).toBe("proposed");
    expect(r.blocks[0].episodeIds).toEqual(["0", "1", "2"]);
    expect(r.practice).toMatch(/fome/);
  });
  it("não cruza fome de um episódio com atraso de outro", () => {
    const i = input(3, { hunger_level: 3 });
    i.db.behavioral_episodes.push(
      ...[3, 4, 5].map((id) =>
        episode(String(id), { situation: "Cheguei em casa", hunger_level: 10 }),
      ),
    );
    expect(
      buildInsights(i).blocks.some((b) => b.key === "delayed-meal-hunger"),
    ).toBe(false);
  });
  it("não duplica episódio ao encontrar a dificuldade e registros ligados", () => {
    const i = input(1);
    i.db.difficulty_events = [
      {
        id: "d",
        user_id: "u",
        episode_id: "0",
        reasons: [],
        occurred_at: at,
        created_at: at,
      },
    ];
    i.db.behavioral_episodes.push(i.db.behavioral_episodes[0]);
    expect(buildInsights(i).basedOn).toBe(1);
  });
  it("hipótese de extração não vira dado relatado", () => {
    const i = input(3, {
      captured_evidence: [
        {
          field: "hunger",
          value: "10",
          source: "ai",
          status: "proposed",
          confidence: 0.5,
          evidence: "Talvez",
        },
      ],
    });
    expect(
      buildInsights(i).blocks.some((b) => b.key === "delayed-meal-hunger"),
    ).toBe(false);
  });
  it("sequência tudo-ou-nada e abandono tem evidência vinculada", () => {
    const i = input(3, {
      automatic_thought: "Já estraguei tudo",
      recovery_outcome: "abandonou_dia",
    });
    const b = buildInsights(i).blocks[0];
    expect(b.key).toBe("all-or-nothing-abandonment");
    expect(b.kind).toBe("sequence");
    expect(b.after).toMatch(/não prova uma causa/);
  });
  it("não supõe consequência sem desfecho", () => {
    const b = buildInsights(
      input(3, {
        automatic_thought: "Já estraguei tudo",
        recovery_outcome: null,
      }),
    ).blocks;
    expect(b.some((b) => b.kind === "sequence")).toBe(false);
  });
  it("recupera pensamentos recorrentes além de tudo-ou-nada", () => {
    const i = input(3, {
      situation: "Dia difícil",
      hunger_level: null,
      automatic_thought: "Eu nunca consigo manter",
    });
    expect(buildInsights(i).blocks[0].body).toContain(
      "Eu nunca consigo manter",
    );
  });
  it("hipótese equivalente rejeitada na conversa também é respeitada", () => {
    const i = input();
    const b = buildInsights(i).blocks[0];
    i.db.user_memories = [
      {
        ...insightFeedbackMemory("u", b, "rejected", "m", now),
        topic: "fome e rotina",
        memory_kind: "hypothesis",
      },
    ];
    expect(buildInsights(i).blocks.some((x) => x.key === b.key)).toBe(false);
  });
  it("confirmação persiste no mesmo modelo de memória e não aumenta evidência por clique", () => {
    const i = input();
    const b = buildInsights(i).blocks[0];
    const m = insightFeedbackMemory("u", b, "confirmed", "m", now);
    i.db.user_memories = [m];
    const reloaded = JSON.parse(JSON.stringify(i));
    reloaded.now = now;
    expect(buildInsights(reloaded).blocks[0].status).toBe("confirmed");
    expect(insightFeedbackMemory("u", b, "confirmed", "other", now, m).id).toBe(
      "m",
    );
    expect(
      insightFeedbackMemory("u", b, "confirmed", "other", now, m)
        .evidence_count,
    ).toBe(3);
  });
  it("rejeição persiste e retira também foco baseado nessa hipótese", () => {
    const i = input();
    const b = buildInsights(i).blocks[0];
    i.db.user_memories = [insightFeedbackMemory("u", b, "rejected", "m", now)];
    const r = buildInsights({ ...i, db: JSON.parse(JSON.stringify(i.db)) });
    expect(r.blocks.some((x) => x.key === b.key)).toBe(false);
    expect(r.practice).not.toMatch(/horário aperta/);
  });
  it("mais ou menos continua proposta, sem foco afirmativo", () => {
    const i = input();
    const b = buildInsights(i).blocks[0];
    i.db.user_memories = [insightFeedbackMemory("u", b, "qualified", "m", now)];
    expect(buildInsights(i).blocks[0].status).toBe("qualified");
    expect(buildInsights(i).practice).toBeNull();
    expect(i.db.user_memories[0].validation_status).toBe("proposed");
  });
  it("estratégia útil preserva parcial e exclui não uso do denominador", () => {
    const i = input(0);
    i.db.strategy_trials = [
      trial("1", "helped"),
      trial("2", "partially_helped"),
      trial("3", "did_not_use"),
      trial("4", "situation_not_occurred"),
    ];
    expect(buildInsights(i).blocks[0].body).toMatch(
      /2 testes.*em 1, ajudou em parte em 1/,
    );
  });
  it.each([
    "not_tested",
    "situation_not_occurred",
    "did_not_help",
    "did_not_use",
    "discarded",
  ] as const)("%s não é recurso eficaz", (result) => {
    const i = input(0);
    i.db.strategy_trials = [trial("t", result)];
    expect(buildInsights(i).blocks).toHaveLength(0);
  });
  it("estratégia predominantemente ineficaz não é recomendada", () => {
    const i = input(0);
    i.db.strategy_trials = [
      trial("1", "helped"),
      trial("2", "did_not_help"),
      trial("3", "did_not_help"),
    ];
    expect(buildInsights(i).blocks).toHaveLength(0);
  });
  it("uma utilização não é padrão consolidado", () => {
    const i = input(0);
    i.db.strategy_trials = [trial("t", "helped")];
    expect(buildInsights(i).blocks[0].body).toMatch(/Ajudou dessa vez/);
    expect(buildInsights(i).blocks[0].evidence).toBe("observed");
  });
  it("alternativa construída não é confundida com utilizada", () => {
    const i = input(0);
    i.db.alternative_thoughts = [alternative()];
    expect(buildInsights(i).blocks).toHaveLength(0);
    expect(buildInsights(i).practice).toMatch(/Ainda não temos um uso/);
  });
  it("alternativa usa avaliação por tentativa sem multiplicar times_used", () => {
    const i = input(0);
    i.db.alternative_thoughts = [
      alternative({ result: "helped_changed", times_used: 100 }),
    ];
    i.db.strategy_trials = [
      { ...trial("t", "helped"), alternative_thought_id: "a" },
    ];
    i.db.behavioral_episodes = [
      episode("review", {
        episode_type: "strategy_review",
        conversation_state: {
          pending_strategy_id: "t",
          cognitive_result: "helped_changed",
        },
      }),
    ];
    expect(buildInsights(i).blocks[0].body).toMatch(/em 1 situações/);
    expect(buildInsights(i).blocks[0].body).not.toContain("100");
  });
  it("Meu Norte só entra quando relacionado e reflete edição", () => {
    const i = input(3, {
      automatic_thought: "Já estraguei tudo",
      recovery_outcome: "abandonou_dia",
    });
    i.db.coping_cards = [
      {
        user_id: "u",
        why_it_matters: "Quero correr melhor",
        updated_at: at,
      } as CopingCard,
    ];
    expect(buildInsights(i).blocks[0].north).toBeUndefined();
    i.db.coping_cards[0].why_it_matters = "Quero parar de desistir";
    expect(buildInsights(i).blocks[0].north).toContain(
      "Quero parar de desistir",
    );
  });
  it("usuário B não contribui com dados, memória, estratégia ou Norte", () => {
    const i = input(3, { user_id: "b" });
    i.db.strategy_trials = [{ ...trial("t", "helped"), user_id: "b" }];
    i.db.alternative_thoughts = [
      alternative({ user_id: "b", result: "helped_changed", times_used: 5 }),
    ];
    expect(buildInsights(i)).toMatchObject({
      basedOn: 0,
      blocks: [],
      practice: null,
    });
  });
  it("não transforma horário de registro em horário real", () => {
    const i = input(3, {
      situation: "Comi pizza",
      hunger_level: null,
      event_time_precision: "unknown",
      event_occurred_at: null,
    });
    expect(buildInsights(i).blocks).toEqual([]);
  });
  it("horário real respeita fuso e precisão", () => {
    const i = input(3, {
      situation: "Comi pizza",
      hunger_level: null,
      event_occurred_at: "2026-10-02T20:00:00Z",
      event_time_precision: "exact",
    });
    expect(buildInsights(i).blocks[0].body).toContain("final da tarde");
    i.timezone = "Asia/Tokyo";
    expect(buildInsights(i).blocks[0].body).toContain("madrugada");
  });
  it("dados antigos não viram foco atual e menos relatos não é melhora", () => {
    const i = input(3, { event_occurred_at: "2025-01-01T12:00:00Z" });
    expect(buildInsights(i).blocks).toEqual([]);
    expect(JSON.stringify(buildInsights(i))).not.toMatch(/melhorou|diminuíram/);
  });
  it("preparação e convite não respondido não viram situação", () => {
    const i = input(3, { episode_type: "preparation" });
    i.db.behavioral_episodes.push(
      episode("invite", { episode_type: "meal_checkin" }),
    );
    expect(buildInsights(i).basedOn).toBe(0);
  });
  it("no máximo dois aprendizados e um recurso", () => {
    const i = input(8, {
      physical_state: ["cansaço"],
      automatic_thought: "Já estraguei tudo",
      recovery_outcome: "abandonou_dia",
    });
    i.db.strategy_trials = [trial("t", "helped")];
    expect(buildInsights(i).blocks.length).toBeLessThanOrEqual(3);
  });
});
