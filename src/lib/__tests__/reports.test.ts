import { describe, it, expect } from "vitest";
import { buildWeeklyReport } from "../reports";
import type { PatternSummary } from "../patterns";

const patterns: PatternSummary = {
  hardestTimeWindow: { label: "final da tarde", count: 4 },
  hardestWeekday: { label: "quarta", count: 2 },
  frequentTriggers: [{ label: "Muita fome.", count: 3 }],
  recurringThoughts: [{ label: "Já estraguei tudo.", count: 3 }],
  frequentEmotions: [{ label: "Ansiedade", count: 3 }],
  helpfulStrategies: [{ label: "Preparar uma alternativa", helped: 2, tested: 3 }],
  averageRecoveryDays: 1.2,
};

describe("relatório semanal", () => {
  it("valida contra o schema Zod e gera resumos", () => {
    const r = buildWeeklyReport(patterns);
    expect(r.user_summary.length).toBeGreaterThan(0);
    expect(r.professional_summary).toMatch(/final da tarde/);
  });

  it("não usa linguagem de fracasso no resumo ao usuário", () => {
    const r = buildWeeklyReport(patterns);
    expect(r.user_summary).not.toMatch(/falh|adesão foi ruim|regrediu/i);
  });

  it("propõe um próximo experimento", () => {
    const r = buildWeeklyReport(patterns);
    expect(r.next_experiment).toMatch(/experimento|pausa|testar/i);
  });
});
