import { describe, it, expect } from "vitest";
import { analyzeSafetyLocal } from "../ai/safety";

describe("camada de segurança", () => {
  it("não gera alerta para mensagem comum", () => {
    const r = analyzeSafetyLocal("Hoje foi difícil no final da tarde, comi um doce.");
    expect(r.risk).toBe(false);
    expect(r.level).toBe("none");
    expect(r.safe_message).toBeNull();
  });

  it("detecta risco alto de autolesão e retorna mensagem de segurança com CVV", () => {
    const r = analyzeSafetyLocal("às vezes penso que não quero mais viver");
    expect(r.risk).toBe(true);
    expect(r.level).toBe("high");
    expect(r.categories.some((c) => c.category === "autolesao")).toBe(true);
    expect(r.safe_message).toMatch(/188/);
  });

  it("detecta vômito provocado como compensação de alta gravidade", () => {
    const r = analyzeSafetyLocal("depois que comi demais fui vomitar");
    expect(r.categories.some((c) => c.category === "vomito")).toBe(true);
    expect(r.level).toBe("high");
    expect(r.safe_message).not.toBeNull();
  });

  it("detecta restrição severa como gravidade média", () => {
    const r = analyzeSafetyLocal("fiquei o dia sem comer pra compensar");
    expect(r.categories.some((c) => c.category === "restricao_severa")).toBe(true);
    expect(["medium", "high"]).toContain(r.level);
  });

  it("perda de controle é sinalizada mas sem interromper com mensagem de segurança", () => {
    const r = analyzeSafetyLocal("senti que perdi o controle ao comer");
    expect(r.categories.some((c) => c.category === "perda_controle")).toBe(true);
    expect(r.level).toBe("low");
    expect(r.safe_message).toBeNull();
  });

  it("valida a estrutura de saída com Zod (sem lançar)", () => {
    expect(() => analyzeSafetyLocal("mensagem qualquer")).not.toThrow();
  });
});
