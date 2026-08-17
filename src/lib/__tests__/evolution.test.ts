import { describe, it, expect } from "vitest";
import { computeEvolution } from "../evolution";
import type { DifficultyEvent, ThoughtRecord, RecoveryOutcome } from "../types";

const DAY = 86400000;
function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString();
}

function evt(id: string, daysAgo: number): DifficultyEvent {
  return {
    id,
    user_id: "u",
    checkin_id: null,
    conversation_id: null,
    occurred_at: iso(daysAgo),
    primary_reason: null,
    reasons: [],
    context: null,
    hunger_intensity: null,
    urge_intensity: null,
    emotional_intensity: null,
    created_at: iso(daysAgo),
  };
}

function thr(
  eventId: string,
  daysAgo: number,
  extra: Partial<ThoughtRecord> = {}
): ThoughtRecord {
  return {
    id: "t" + eventId,
    user_id: "u",
    difficulty_event_id: eventId,
    emotions: [],
    created_at: iso(daysAgo),
    ...extra,
  };
}

describe("evolução", () => {
  it("sem dados nenhum, avisa que é cedo e não inventa progresso", () => {
    const r = computeEvolution({ difficulties: [], thoughts: [], trials: [], altThoughts: [] });
    expect(r.tooEarly).toBe(true);
    expect(r.dimensions).toHaveLength(0);
    // não pode afirmar melhora sem dados
    expect(r.headline).not.toMatch(/melhor|progress|conseguiu|avan[çc]/i);
  });

  it("mede como a pessoa lidou, não se seguiu a dieta", () => {
    const r = computeEvolution({
      difficulties: [evt("a", 1), evt("b", 2), evt("c", 3)],
      thoughts: [
        thr("a", 1, { recovery_outcome: "retomou" }),
        thr("b", 2, { recovery_outcome: "retomou" }),
        thr("c", 3, { recovery_outcome: "abandonou_dia" }),
      ],
      trials: [],
      altThoughts: [],
    });
    const ret = r.dimensions.find((d) => d.key === "retomada");
    expect(ret?.count).toEqual({ of: 2, total: 3 });
    expect(r.headline).toMatch(/2/);
    // Nunca fala em falha/dieta
    expect(r.headline).not.toMatch(/falh|dieta|errou/i);
  });

  it("não afirma tendência com base insuficiente", () => {
    const r = computeEvolution({
      difficulties: [evt("a", 1)],
      thoughts: [thr("a", 1, { recovery_outcome: "retomou" })],
      trials: [],
      altThoughts: [],
    });
    const ret = r.dimensions.find((d) => d.key === "retomada");
    expect(ret?.trend).toBeUndefined();
  });

  it("conta reconhecimento de pensamentos e distingue quem nomeou sozinho", () => {
    const r = computeEvolution({
      difficulties: [evt("a", 1), evt("b", 2)],
      thoughts: [
        thr("a", 1, { automatic_thought: "Já estraguei tudo", thought_self_identified: true }),
        thr("b", 2, { automatic_thought: "Só hoje", thought_self_identified: false }),
      ],
      trials: [],
      altThoughts: [],
    });
    const p = r.dimensions.find((d) => d.key === "pensamentos");
    expect(p?.count).toEqual({ of: 2, total: 2 });
    expect(p?.statement).toMatch(/sem precisar de ajuda/);
  });

  it("só considera estratégia que foi realmente testada", () => {
    const base = {
      user_id: "u",
      strategy_id: "s",
      difficulty_event_id: null,
      planned_for: null,
      tested_at: null,
      user_feedback: null,
      created_at: iso(1),
      updated_at: iso(1),
    };
    const r = computeEvolution({
      difficulties: [evt("a", 1)],
      thoughts: [],
      trials: [
        { ...base, id: "1", result: "not_tested", title_snapshot: "Nunca testada" },
        { ...base, id: "2", result: "helped", title_snapshot: "Testada" },
      ],
      altThoughts: [],
    });
    const e = r.dimensions.find((d) => d.key === "estrategias");
    expect(e?.statement).toMatch(/Testada/);
    expect(e?.statement).not.toMatch(/Nunca testada/);
  });

  it("destaca quando pensar diferente também mudou o comportamento", () => {
    const r = computeEvolution({
      difficulties: [evt("a", 1)],
      thoughts: [thr("a", 1)],
      trials: [],
      altThoughts: [
        {
          id: "x",
          user_id: "u",
          thought_record_id: null,
          original_thought: "Já estraguei tudo",
          alternative: "Posso retomar depois",
          belief_level: 7,
          result: "helped_changed",
          times_used: 2,
          last_used_at: iso(1),
          created_at: iso(2),
          updated_at: iso(1),
        },
      ],
    });
    const alt = r.dimensions.find((d) => d.key === "alternativos");
    expect(alt?.statement).toMatch(/mudou o que tu fez/);
  });
});
