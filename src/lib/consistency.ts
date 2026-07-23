// Índice interno de consistência (seção 20).
// Regras: ausência de registro não é falha automática; não premia restrição;
// não reforça perfeccionismo; uma escolha isolada não derruba o indicador.

import type { MealCheckin, StrategyTrial, DifficultyEvent, ThoughtRecord } from "./types";

export interface ConsistencyInput {
  checkins: MealCheckin[];
  trials: StrategyTrial[];
  difficulties: DifficultyEvent[];
  thoughtRecords: ThoughtRecord[];
}

export interface ConsistencyComponents {
  aderencia: number; // registros alinhados ao objetivo (realizado + parcial)
  uso_estrategias: number; // testes de estratégias
  retomada: number; // capacidade de retorno (parciais/não realizados seguidos de realizado)
  reflexao: number; // reflexões concluídas
}

export interface ConsistencyResult {
  score: number; // 0..100 (uso interno)
  trend: "up" | "stable" | "down";
  components: ConsistencyComponents;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Componente de aderência: valoriza realizado e parcial; ausência não penaliza fortemente.
function adherenceScore(checkins: MealCheckin[]): number {
  if (checkins.length === 0) return 50; // neutro na ausência de dados — não é falha
  let points = 0;
  for (const c of checkins) {
    if (c.status === "completed") points += 1;
    else if (c.status === "partial") points += 0.6; // parcial conta positivamente
    else points += 0.2; // não realizado ainda registra engajamento
  }
  return (points / checkins.length) * 100;
}

// Uso de estratégias: quantas foram testadas (independente do resultado).
function strategyUseScore(trials: StrategyTrial[]): number {
  if (trials.length === 0) return 40;
  const tested = trials.filter(
    (t) => t.result === "helped" || t.result === "partially_helped" || t.result === "did_not_help"
  ).length;
  return clamp((tested / Math.max(trials.length, 3)) * 100);
}

// Capacidade de retomada: após um registro parcial/não realizado, houve um realizado depois?
function recoveryScore(checkins: MealCheckin[]): number {
  const sorted = [...checkins].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  let opportunities = 0;
  let recoveries = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].status !== "completed") {
      opportunities += 1;
      const next = sorted.slice(i + 1).find(() => true);
      if (next && next.status === "completed") recoveries += 1;
    }
  }
  if (opportunities === 0) return 70; // sem dificuldades registradas, retomada não se aplica
  return clamp((recoveries / opportunities) * 100);
}

// Reflexão concluída: registros de pensamento com alternativa construída.
function reflectionScore(records: ThoughtRecord[], difficulties: DifficultyEvent[]): number {
  if (difficulties.length === 0) return 50;
  const completed = records.filter((r) => r.alternative_thought && r.alternative_thought.length > 0).length;
  return clamp((completed / Math.max(difficulties.length, 1)) * 100);
}

export function computeConsistency(
  input: ConsistencyInput,
  previous?: number
): ConsistencyResult {
  const components: ConsistencyComponents = {
    aderencia: clamp(adherenceScore(input.checkins)),
    uso_estrategias: strategyUseScore(input.trials),
    retomada: recoveryScore(input.checkins),
    reflexao: reflectionScore(input.thoughtRecords, input.difficulties),
  };

  // Pesos: retomada e uso de estratégias têm peso relevante para não premiar restrição
  // nem perfeccionismo; aderência entra com peso moderado.
  const score = clamp(
    components.aderencia * 0.3 +
      components.uso_estrategias * 0.25 +
      components.retomada * 0.3 +
      components.reflexao * 0.15
  );

  let trend: ConsistencyResult["trend"] = "stable";
  if (previous !== undefined) {
    if (score - previous >= 5) trend = "up";
    else if (previous - score >= 5) trend = "down";
  }

  return { score, trend, components };
}

// Mensagens de tendência para o usuário (evitar nota numérica diária, seção 20).
export function trendMessage(result: ConsistencyResult): string {
  if (result.trend === "up") {
    return "A tua consistência está se tornando mais estável. Tu conseguiu retornar mais rápido nesta semana.";
  }
  if (result.components.uso_estrategias >= 50) {
    return "As dificuldades continuaram acontecendo, mas tu utilizou estratégias em mais momentos.";
  }
  return "Tu está construindo teu ritmo aos poucos. Uma escolha isolada não define o restante da semana.";
}
