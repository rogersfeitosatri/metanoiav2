import { describe, it, expect } from "vitest";
import { computeConsistency, trendMessage } from "../consistency";
import type { MealCheckin, StrategyTrial, DifficultyEvent, ThoughtRecord } from "../types";

function checkin(status: MealCheckin["status"], daysAgo: number): MealCheckin {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `c${daysAgo}${status}`,
    user_id: "u",
    meal_type: "almoco",
    custom_meal_name: null,
    status,
    occurred_at: d.toISOString(),
    note: null,
    created_at: d.toISOString(),
  };
}

describe("índice de consistência", () => {
  it("ausência de registros não é tratada como falha (fica neutro)", () => {
    const r = computeConsistency({ checkins: [], trials: [], difficulties: [], thoughtRecords: [] });
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.score).toBeLessThanOrEqual(70);
  });

  it("registros parciais contam positivamente na aderência (não pune perfeccionismo)", () => {
    const allPartial = computeConsistency({
      checkins: [checkin("partial", 1), checkin("partial", 2), checkin("partial", 3)],
      trials: [],
      difficulties: [],
      thoughtRecords: [],
    });
    const allMissed = computeConsistency({
      checkins: [checkin("not_completed", 1), checkin("not_completed", 2), checkin("not_completed", 3)],
      trials: [],
      difficulties: [],
      thoughtRecords: [],
    });
    // parcial (0.6) pontua bem mais que não realizado (0.2) na aderência
    expect(allPartial.components.aderencia).toBeGreaterThan(50);
    expect(allPartial.components.aderencia).toBeGreaterThan(allMissed.components.aderencia);
  });

  it("uma escolha isolada não derruba significativamente o indicador", () => {
    const base = [checkin("completed", 1), checkin("completed", 2), checkin("completed", 3), checkin("completed", 4)];
    const withOneMiss = [...base, checkin("not_completed", 5)];
    const a = computeConsistency({ checkins: base, trials: [], difficulties: [], thoughtRecords: [] });
    const b = computeConsistency({ checkins: withOneMiss, trials: [], difficulties: [], thoughtRecords: [] });
    expect(a.score - b.score).toBeLessThan(20);
  });

  it("valoriza retomada: registro realizado após um não realizado", () => {
    // não realizado seguido de realizado = retomada
    const recovered = computeConsistency({
      checkins: [checkin("not_completed", 5), checkin("completed", 2)],
      trials: [],
      difficulties: [],
      thoughtRecords: [],
    });
    expect(recovered.components.retomada).toBeGreaterThan(50);
  });

  it("detecta tendência de melhora frente a um valor anterior", () => {
    const r = computeConsistency(
      { checkins: [checkin("completed", 1), checkin("completed", 2)], trials: [], difficulties: [], thoughtRecords: [] },
      30
    );
    expect(r.trend).toBe("up");
  });

  it("mensagem de tendência nunca usa linguagem de fracasso", () => {
    const r = computeConsistency({ checkins: [checkin("completed", 1)], trials: [], difficulties: [], thoughtRecords: [] });
    const msg = trendMessage(r);
    expect(msg).not.toMatch(/falh|fracasso|ruim/i);
  });
});
