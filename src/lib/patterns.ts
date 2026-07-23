// Módulo de padrões (seções 18 e 23.6). Identifica recorrências de forma compreensível,
// sem transformar em diagnóstico.

import type { DifficultyEvent, ThoughtRecord, StrategyTrial, MealCheckin } from "./types";

export interface PatternSummary {
  hardestTimeWindow?: { label: string; count: number };
  hardestWeekday?: { label: string; count: number };
  frequentTriggers: { label: string; count: number }[];
  recurringThoughts: { label: string; count: number }[];
  frequentEmotions: { label: string; count: number }[];
  helpfulStrategies: { label: string; helped: number; tested: number }[];
  averageRecoveryDays: number | null;
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function timeWindow(iso: string): string {
  const h = new Date(iso).getHours();
  if (h < 6) return "madrugada";
  if (h < 12) return "manhã";
  if (h < 15) return "início da tarde";
  if (h < 18) return "final da tarde";
  if (h < 21) return "noite";
  return "fim da noite";
}

function topCounts(items: string[], limit = 5): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const i of items) {
    if (!i) continue;
    const key = i.trim();
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function classifyPatterns(
  difficulties: DifficultyEvent[],
  thoughtRecords: ThoughtRecord[],
  trials: StrategyTrial[],
  checkins: MealCheckin[]
): PatternSummary {
  const windows = topCounts(difficulties.map((d) => timeWindow(d.occurred_at)), 1);
  const weekdays = topCounts(
    difficulties.map((d) => WEEKDAYS[new Date(d.occurred_at).getDay()]),
    1
  );

  const triggers = topCounts(difficulties.flatMap((d) => d.reasons || []));
  const thoughts = topCounts(
    thoughtRecords.map((t) => t.automatic_thought || "").filter(Boolean)
  );
  const emotions = topCounts(thoughtRecords.flatMap((t) => t.emotions || []));

  // Estratégias eficazes: agrupa por título e conta quantas ajudaram.
  const stratMap = new Map<string, { helped: number; tested: number }>();
  for (const t of trials) {
    const key = t.title_snapshot;
    const cur = stratMap.get(key) || { helped: 0, tested: 0 };
    if (t.result === "helped" || t.result === "partially_helped" || t.result === "did_not_help") {
      cur.tested += 1;
    }
    if (t.result === "helped" || t.result === "partially_helped") cur.helped += 1;
    stratMap.set(key, cur);
  }
  const helpfulStrategies = [...stratMap.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .filter((s) => s.tested > 0)
    .sort((a, b) => b.helped - a.helped);

  return {
    hardestTimeWindow: windows[0]
      ? { label: windows[0].label, count: windows[0].count }
      : undefined,
    hardestWeekday: weekdays[0]
      ? { label: weekdays[0].label, count: weekdays[0].count }
      : undefined,
    frequentTriggers: triggers,
    recurringThoughts: thoughts,
    frequentEmotions: emotions,
    helpfulStrategies,
    averageRecoveryDays: computeRecovery(checkins),
  };
}

function computeRecovery(checkins: MealCheckin[]): number | null {
  const sorted = [...checkins].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].status !== "completed") {
      const next = sorted.slice(i + 1).find((c) => c.status === "completed");
      if (next) {
        const days =
          (new Date(next.occurred_at).getTime() - new Date(sorted[i].occurred_at).getTime()) /
          86400000;
        gaps.push(days);
      }
    }
  }
  if (gaps.length === 0) return null;
  return Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
}

// Regra de intervenção preventiva (seção 17): dificuldade recorrente no mesmo horário.
export function shouldSchedulePreventive(
  difficulties: DifficultyEvent[],
  windowLabel = "final da tarde",
  threshold = 3
): boolean {
  const count = difficulties.filter((d) => timeWindow(d.occurred_at) === windowLabel).length;
  return count >= threshold;
}

export { timeWindow };
