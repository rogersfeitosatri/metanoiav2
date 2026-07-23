import { describe, it, expect } from "vitest";
import { classifyPatterns, shouldSchedulePreventive, timeWindow } from "../patterns";
import type { DifficultyEvent, ThoughtRecord, StrategyTrial } from "../types";

function diff(hour: number, reasons: string[], id: string): DifficultyEvent {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return {
    id,
    user_id: "u",
    checkin_id: null,
    conversation_id: null,
    occurred_at: d.toISOString(),
    primary_reason: reasons[0],
    reasons,
    context: null,
    hunger_intensity: null,
    urge_intensity: null,
    emotional_intensity: null,
    created_at: d.toISOString(),
  };
}

describe("classificação de padrões", () => {
  it("identifica a janela de horário mais difícil", () => {
    const diffs = [
      diff(17, ["Muita fome."], "a"),
      diff(17, ["Ansiedade."], "b"),
      diff(9, ["Estresse."], "c"),
    ];
    const p = classifyPatterns(diffs, [], [], []);
    expect(p.hardestTimeWindow?.label).toBe("final da tarde");
    expect(p.hardestTimeWindow?.count).toBe(2);
  });

  it("conta gatilhos frequentes ordenados", () => {
    const diffs = [
      diff(17, ["Muita fome.", "Ansiedade."], "a"),
      diff(18, ["Muita fome."], "b"),
    ];
    const p = classifyPatterns(diffs, [], [], []);
    expect(p.frequentTriggers[0].label).toBe("Muita fome.");
    expect(p.frequentTriggers[0].count).toBe(2);
  });

  it("agrupa estratégias eficazes por resultado", () => {
    const trials: StrategyTrial[] = [
      { id: "1", user_id: "u", strategy_id: "s", difficulty_event_id: null, planned_for: null, tested_at: null, result: "helped", user_feedback: null, title_snapshot: "Pausa", created_at: "", updated_at: "" },
      { id: "2", user_id: "u", strategy_id: "s", difficulty_event_id: null, planned_for: null, tested_at: null, result: "did_not_help", user_feedback: null, title_snapshot: "Pausa", created_at: "", updated_at: "" },
    ];
    const p = classifyPatterns([], [], trials, []);
    const pausa = p.helpfulStrategies.find((s) => s.label === "Pausa");
    expect(pausa?.tested).toBe(2);
    expect(pausa?.helped).toBe(1);
  });

  it("regra preventiva dispara com 3+ dificuldades no final da tarde", () => {
    const diffs = [diff(17, ["x"], "a"), diff(17, ["y"], "b"), diff(17, ["z"], "c")];
    expect(shouldSchedulePreventive(diffs)).toBe(true);
    expect(shouldSchedulePreventive([diff(17, ["x"], "a")])).toBe(false);
  });

  it("timeWindow classifica corretamente", () => {
    const at = (h: number) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return timeWindow(d.toISOString());
    };
    expect(at(17)).toBe("final da tarde");
    expect(at(3)).toBe("madrugada");
    expect(at(9)).toBe("manhã");
  });
});
