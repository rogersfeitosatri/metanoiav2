import { describe, it, expect } from "vitest";
import { buildInsights } from "../insights";
import type { DifficultyEvent, ThoughtRecord, StrategyTrial } from "../types";

const DAY = 86400000;
function at(daysAgo: number, hour: number): string {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function evt(id: string, daysAgo: number, hour: number, reasons: string[] = []): DifficultyEvent {
  return {
    id, user_id: "u", checkin_id: null, conversation_id: null,
    occurred_at: at(daysAgo, hour), primary_reason: reasons[0] || null, reasons,
    context: null, hunger_intensity: null, urge_intensity: null, emotional_intensity: null,
    created_at: at(daysAgo, hour),
  };
}
function thr(eventId: string, extra: Partial<ThoughtRecord> = {}): ThoughtRecord {
  return { id: "t" + eventId, user_id: "u", difficulty_event_id: eventId, emotions: [], created_at: at(1, 12), ...extra };
}

describe("aprendizados", () => {
  it("não inventa nada com menos de 2 situações", () => {
    const r = buildInsights([evt("a", 1, 17)], [], [], []);
    expect(r.tooEarly).toBe(true);
    expect(r.blocks).toHaveLength(0);
    expect(r.practice).toBeNull();
  });

  it("aponta a janela de horário com base em contagem real", () => {
    const r = buildInsights(
      [evt("a", 1, 17), evt("b", 2, 17), evt("c", 3, 17)],
      [],
      [],
      []
    );
    const b = r.blocks.find((x) => x.key === "percebendo");
    expect(b?.body).toMatch(/final da tarde/);
    expect(b?.evidence).toBe("pattern");
  });

  it("marca inferência como hipótese e pede confirmação", () => {
    const diffs = [evt("a", 1, 17), evt("b", 2, 17), evt("c", 3, 17)];
    const r = buildInsights(
      diffs,
      [
        thr("a", { noticed_hunger_early: true, recovery_outcome: "retomou" }),
        thr("b", { noticed_hunger_early: true, recovery_outcome: "retomou" }),
        thr("c", {}),
      ],
      [],
      []
    );
    const h = r.blocks.find((x) => x.isHypothesis);
    expect(h).toBeDefined();
    expect(h?.body).toMatch(/faz sentido\?/i);
  });

  it("nunca diz que uma estratégia ajuda se ela só foi sugerida", () => {
    const trials: StrategyTrial[] = [
      {
        id: "1", user_id: "u", strategy_id: "s", difficulty_event_id: null,
        planned_for: null, tested_at: null, result: "not_tested",
        user_feedback: null, title_snapshot: "Sugerida mas nunca testada",
        created_at: at(1, 12), updated_at: at(1, 12),
      },
    ];
    const r = buildInsights([evt("a", 1, 17), evt("b", 2, 17)], [], trials, []);
    expect(JSON.stringify(r.blocks)).not.toMatch(/Sugerida mas nunca testada/);
  });

  it("propõe uma prática concreta a partir do pensamento recorrente", () => {
    const r = buildInsights(
      [evt("a", 1, 17), evt("b", 2, 18)],
      [
        thr("a", { automatic_thought: "Já que saí do planejado, tanto faz" }),
        thr("b", { automatic_thought: "Já que saí do planejado, tanto faz" }),
      ],
      [],
      []
    );
    expect(r.practice).toMatch(/tanto faz/);
    expect(r.practice).not.toMatch(/autocompaix|gentil consigo|jornada/i);
  });
});
