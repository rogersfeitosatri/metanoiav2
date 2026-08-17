// Evolução: habilidades que a pessoa está desenvolvendo, por dimensão.
// Princípios:
//  - sucesso NÃO é "seguiu a dieta"; é como a pessoa lidou com o que aconteceu;
//  - nada de score único (nada de "84/100");
//  - nunca afirmar melhora sem dados suficientes (ver EvidenceLevel).

import type {
  DifficultyEvent,
  ThoughtRecord,
  StrategyTrial,
  AlternativeThought,
} from "./types";

/** Quanta confiança temos para afirmar algo. Evita inventar aprendizado. */
export type EvidenceLevel =
  | "insufficient" // não há dados suficientes para dizer nada
  | "observed"     // fato contado pela pessoa / contagem direta
  | "pattern";     // repetição suficiente para chamar de padrão

export interface SkillDimension {
  key: string;
  label: string;
  /** Frase em linguagem natural, baseada nos dados reais. */
  statement: string;
  /** Numerador/denominador quando faz sentido (ex.: 3 de 5). */
  count?: { of: number; total: number };
  evidence: EvidenceLevel;
  /** Comparação com o período anterior, quando houver base. */
  trend?: "up" | "stable" | "down";
}

export interface EvolutionInput {
  difficulties: DifficultyEvent[];
  thoughts: ThoughtRecord[];
  trials: StrategyTrial[];
  altThoughts: AlternativeThought[];
  /** Início da janela atual (padrão: 7 dias atrás). */
  periodStart?: Date;
}

export interface EvolutionSummary {
  situationsThisWeek: number;
  situationsPreviousWeek: number;
  /** Frase principal sobre como a pessoa lidou (não sobre "seguir a dieta"). */
  headline: string;
  dimensions: SkillDimension[];
  /** true quando ainda não há base para praticamente nada. */
  tooEarly: boolean;
}

const DAY = 86400000;

function within(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** Só chamamos de padrão a partir de 3 ocorrências com base razoável. */
function levelFor(of: number, total: number): EvidenceLevel {
  if (total < 2) return "insufficient";
  if (total >= 3) return "pattern";
  return "observed";
}

function trendFor(now: number, before: number, total: number): SkillDimension["trend"] | undefined {
  if (total < 3) return undefined; // sem base para falar de tendência
  if (now > before) return "up";
  if (now < before) return "down";
  return "stable";
}

export function computeEvolution(input: EvolutionInput): EvolutionSummary {
  const end = new Date();
  const start = input.periodStart ?? new Date(end.getTime() - 7 * DAY);
  const prevStart = new Date(start.getTime() - 7 * DAY);

  const cur = input.difficulties.filter((d) => within(d.occurred_at, start, end));
  const prev = input.difficulties.filter((d) => within(d.occurred_at, prevStart, start));

  const curIds = new Set(cur.map((d) => d.id));
  const prevIds = new Set(prev.map((d) => d.id));
  const curThoughts = input.thoughts.filter((t) => curIds.has(t.difficulty_event_id));
  const prevThoughts = input.thoughts.filter((t) => prevIds.has(t.difficulty_event_id));

  const dimensions: SkillDimension[] = [];

  // --- 1. Retomada: lidou sem transformar aquilo no restante do dia ---
  const recovered = curThoughts.filter(
    (t) => t.recovery_outcome === "retomou" || t.recovery_outcome === "retomou_depois"
  ).length;
  const withOutcome = curThoughts.filter(
    (t) => t.recovery_outcome && t.recovery_outcome !== "indefinido"
  ).length;
  if (withOutcome > 0) {
    const prevRecovered = prevThoughts.filter(
      (t) => t.recovery_outcome === "retomou" || t.recovery_outcome === "retomou_depois"
    ).length;
    dimensions.push({
      key: "retomada",
      label: "Retomada",
      statement:
        recovered === 0
          ? `Nas ${withOutcome} situação(ões) desta semana, retomar depois ainda ficou difícil.`
          : `Em ${recovered} de ${withOutcome} situação(ões) desta semana tu conseguiu retomar sem transformar aquilo no restante do dia.`,
      count: { of: recovered, total: withOutcome },
      evidence: levelFor(recovered, withOutcome),
      trend: trendFor(recovered, prevRecovered, withOutcome + prevThoughts.length),
    });
  }

  // --- 2. Reconhecimento de pensamentos ---
  const named = curThoughts.filter((t) => t.automatic_thought).length;
  const namedAlone = curThoughts.filter((t) => t.thought_self_identified).length;
  if (cur.length > 0 && named > 0) {
    const prevNamed = prevThoughts.filter((t) => t.automatic_thought).length;
    dimensions.push({
      key: "pensamentos",
      label: "Reconhecimento de pensamentos",
      statement:
        namedAlone > 0
          ? `Tu percebeu o pensamento que apareceu em ${named} de ${cur.length} situação(ões) — em ${namedAlone} delas sem precisar de ajuda para nomear.`
          : `Tu percebeu o pensamento que apareceu em ${named} de ${cur.length} situação(ões).`,
      count: { of: named, total: cur.length },
      evidence: levelFor(named, cur.length),
      trend: trendFor(named, prevNamed, cur.length + prev.length),
    });
  }

  // --- 3. Pensamentos alternativos (e se mudaram o comportamento) ---
  const builtThisWeek = input.altThoughts.filter((a) => within(a.created_at, start, end));
  const changedBehavior = input.altThoughts.filter((a) => a.result === "helped_changed");
  if (builtThisWeek.length > 0 || changedBehavior.length > 0) {
    const parts: string[] = [];
    if (builtThisWeek.length > 0) {
      parts.push(
        `Nesta semana tu construiu uma resposta diferente em ${builtThisWeek.length} situação(ões).`
      );
    }
    if (changedBehavior.length > 0) {
      parts.push(
        `Em ${changedBehavior.length} vez(es), pensar diferente também mudou o que tu fez depois.`
      );
    }
    dimensions.push({
      key: "alternativos",
      label: "Pensamentos alternativos",
      statement: parts.join(" "),
      count: { of: changedBehavior.length, total: input.altThoughts.length },
      evidence: input.altThoughts.length >= 2 ? "observed" : "insufficient",
    });
  }

  // --- 4. Reconhecimento emocional ---
  const withEmotion = curThoughts.filter((t) => t.emotions && t.emotions.length > 0);
  if (withEmotion.length > 0) {
    const freq = new Map<string, number>();
    for (const t of curThoughts) for (const e of t.emotions || []) freq.set(e, (freq.get(e) || 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => e);
    dimensions.push({
      key: "emocoes",
      label: "Reconhecimento emocional",
      statement:
        top.length > 0
          ? `Tu nomeou o que estava sentindo em ${withEmotion.length} de ${cur.length} situação(ões). ${top.join(" e ")} ${top.length > 1 ? "aparecem" : "aparece"} com mais frequência.`
          : `Tu nomeou o que estava sentindo em ${withEmotion.length} de ${cur.length} situação(ões).`,
      count: { of: withEmotion.length, total: cur.length },
      evidence: levelFor(withEmotion.length, cur.length),
    });
  }

  // --- 5. Reconhecimento corporal (fome antes do limite) ---
  const withHunger = curThoughts.filter((t) => typeof t.hunger_level === "number");
  const noticedEarly = curThoughts.filter((t) => t.noticed_hunger_early).length;
  if (withHunger.length > 0) {
    const prevEarly = prevThoughts.filter((t) => t.noticed_hunger_early).length;
    dimensions.push({
      key: "corporal",
      label: "Reconhecimento corporal",
      statement:
        noticedEarly > 0
          ? `Tu percebeu a fome antes de chegar no limite em ${noticedEarly} de ${withHunger.length} situação(ões).`
          : `Nas situações desta semana, a fome já estava alta quando tu percebeu.`,
      count: { of: noticedEarly, total: withHunger.length },
      evidence: levelFor(noticedEarly, withHunger.length),
      trend: trendFor(noticedEarly, prevEarly, withHunger.length + prevThoughts.length),
    });
  }

  // --- 6. Compensação / culpa (tudo-ou-nada) ---
  const compensated = curThoughts.filter((t) => t.recovery_outcome === "compensou").length;
  const allOrNothing = curThoughts.filter((t) => t.all_or_nothing).length;
  if (withOutcome >= 2) {
    dimensions.push({
      key: "compensacao",
      label: "Sem compensar",
      statement:
        compensated === 0
          ? `Em nenhuma das situações desta semana tu tentou compensar depois.`
          : `Em ${withOutcome - compensated} de ${withOutcome} situação(ões) tu seguiu sem tentar compensar.`,
      count: { of: withOutcome - compensated, total: withOutcome },
      evidence: levelFor(withOutcome - compensated, withOutcome),
    });
  }
  if (allOrNothing > 0 && curThoughts.length >= 2) {
    dimensions.push({
      key: "tudo_ou_nada",
      label: "Pensamento tudo-ou-nada",
      statement: `O "já que saí do planejado..." apareceu em ${allOrNothing} de ${curThoughts.length} situação(ões).`,
      count: { of: allOrNothing, total: curThoughts.length },
      evidence: levelFor(allOrNothing, curThoughts.length),
    });
  }

  // --- 7. Estratégias (só o que foi realmente testado) ---
  const byTitle = new Map<string, { helped: number; tested: number }>();
  for (const t of input.trials) {
    if (t.result === "not_tested" || t.result === "situation_not_occurred") continue;
    const cur2 = byTitle.get(t.title_snapshot) || { helped: 0, tested: 0 };
    cur2.tested += 1;
    if (t.result === "helped" || t.result === "partially_helped") cur2.helped += 1;
    byTitle.set(t.title_snapshot, cur2);
  }
  const best = [...byTitle.entries()].sort((a, b) => b[1].helped - a[1].helped)[0];
  if (best && best[1].tested > 0) {
    dimensions.push({
      key: "estrategias",
      label: "Estratégias",
      statement: `${best[0]} ajudou em ${best[1].helped} de ${best[1].tested} vez(es) em que foi testada.`,
      count: { of: best[1].helped, total: best[1].tested },
      evidence: levelFor(best[1].helped, best[1].tested),
    });
  }

  // --- Frase principal ---
  const tooEarly = cur.length === 0 && prev.length === 0 && input.thoughts.length === 0;
  let headline: string;
  if (tooEarly) {
    headline =
      "Ainda não temos situações registradas. Quando algo ficar difícil, conversa aqui — é disso que a Evolução é feita.";
  } else if (cur.length === 0) {
    headline = "Nenhuma situação difícil registrada nesta semana.";
  } else if (withOutcome > 0 && recovered > 0) {
    headline = `Aconteceram ${cur.length} situação(ões) difícil(eis). Em ${recovered} delas tu conseguiu retomar sem deixar aquilo virar o restante do dia.`;
  } else {
    headline = `Aconteceram ${cur.length} situação(ões) difícil(eis) nesta semana.`;
  }

  return {
    situationsThisWeek: cur.length,
    situationsPreviousWeek: prev.length,
    headline,
    dimensions: dimensions.filter((d) => d.evidence !== "insufficient" || d.count),
    tooEarly,
  };
}
