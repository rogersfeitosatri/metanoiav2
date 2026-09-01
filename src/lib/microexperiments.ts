import type { StrategyTrial } from "./types";

export function strategyKey(trigger: string, action: string): string {
  const source = `${normalize(trigger)}|${normalize(action)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `micro-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function stableEffectiveStrategyTitles(trials: StrategyTrial[]): string[] {
  const grouped = new Map<string, StrategyTrial[]>();
  for (const trial of trials) {
    const key = trial.strategy_id || trial.strategy_key || normalize(trial.title_snapshot);
    grouped.set(key, [...(grouped.get(key) || []), trial]);
  }
  return [...grouped.values()]
    .filter((group) => group.filter((trial) => trial.result === "helped").length >= 2)
    .map((group) => group[0].title_snapshot);
}

export function isUnsafeMicroexperiment(text: string): boolean {
  return /(?:n[aã]o|sem)\s+(?:vou\s+)?(?:comer|jantar|almo[cç]ar)|jejum|vomit|laxante|compensar|queimar\s+(?:o\s+)?que\s+comi|dobrar\s+(?:o\s+)?treino|rem[eé]dio\s+para/i.test(
    text
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}
