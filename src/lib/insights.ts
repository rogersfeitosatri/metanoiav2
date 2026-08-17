// Aprendizados: "o que estou começando a perceber sobre mim e o que vale praticar agora?"
// Regra dura: nada aqui pode ser inventado. Tudo nasce de dados reais do usuário
// e cada bloco carrega o seu nível de evidência.

import type { DifficultyEvent, ThoughtRecord, StrategyTrial, AlternativeThought } from "./types";
import { timeWindow } from "./patterns";
import type { EvidenceLevel } from "./evolution";

export interface InsightBlock {
  key: string;
  /** Título curto e humano, sem linguagem clínica. */
  title: string;
  body: string;
  evidence: EvidenceLevel;
  /** Hipótese da IA precisa ser confirmada pela pessoa antes de virar verdade. */
  isHypothesis?: boolean;
}

export interface InsightsResult {
  blocks: InsightBlock[];
  /** Uma coisa concreta para praticar agora. */
  practice: string | null;
  /** Quando ainda não há base suficiente para dizer nada. */
  tooEarly: boolean;
  /** Quantas situações alimentam esses aprendizados. */
  basedOn: number;
}

interface Counted {
  label: string;
  count: number;
}

function top(items: string[], limit = 3): Counted[] {
  const m = new Map<string, number>();
  for (const i of items) {
    if (!i || !i.trim()) continue;
    const k = i.trim();
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildInsights(
  difficulties: DifficultyEvent[],
  thoughts: ThoughtRecord[],
  trials: StrategyTrial[],
  altThoughts: AlternativeThought[] = []
): InsightsResult {
  const blocks: InsightBlock[] = [];
  const n = difficulties.length;

  // Precisa de pelo menos 2 situações para começar a dizer qualquer coisa.
  if (n < 2) {
    return {
      blocks: [],
      practice: null,
      tooEarly: true,
      basedOn: n,
    };
  }

  // --- 1. O que estamos percebendo (janela de horário + gatilho junto) ---
  const windows = top(difficulties.map((d) => timeWindow(d.occurred_at)), 1);
  const triggers = top(difficulties.flatMap((d) => d.reasons || []), 3);
  if (windows[0] && windows[0].count >= 2) {
    const w = windows[0];
    const withTrigger =
      triggers[0] && triggers[0].count >= 2
        ? ` Nessas vezes, ${triggers[0].label.replace(/\.$/, "").toLowerCase()} apareceu junto.`
        : "";
    blocks.push({
      key: "percebendo",
      title: "O que estamos percebendo",
      body: `Teu ${w.label} aparece com mais dificuldade — ${w.count} das ${n} situações registradas.${withTrigger}`,
      evidence: w.count >= 3 ? "pattern" : "observed",
    });
  }

  // --- 2. Um pensamento que aparece bastante ---
  const recurring = top(thoughts.map((t) => t.automatic_thought || "").filter(Boolean), 1);
  if (recurring[0] && recurring[0].count >= 2) {
    blocks.push({
      key: "pensamento",
      title: "Um pensamento que aparece bastante",
      body: `“${recurring[0].label}” — apareceu ${recurring[0].count} vezes.`,
      evidence: recurring[0].count >= 3 ? "pattern" : "observed",
    });

    // --- 3. O que costuma acontecer depois (só se houver desfecho registrado) ---
    const withThat = thoughts.filter((t) => t.automatic_thought === recurring[0].label);
    const badOutcome = withThat.filter(
      (t) => t.recovery_outcome === "abandonou_dia" || t.recovery_outcome === "compensou"
    ).length;
    if (badOutcome >= 2) {
      blocks.push({
        key: "depois",
        title: "O que costuma acontecer depois",
        body: `Quando esse pensamento aparece e tu acredita nele, fica mais difícil retomar — foi assim em ${badOutcome} das ${withThat.length} vezes.`,
        evidence: badOutcome >= 3 ? "pattern" : "observed",
      });
    }
  }

  // --- 4. O que parece ajudar (hipótese, precisa de confirmação) ---
  const early = thoughts.filter((t) => t.noticed_hunger_early);
  const earlyRecovered = early.filter(
    (t) => t.recovery_outcome === "retomou" || t.recovery_outcome === "retomou_depois"
  ).length;
  if (early.length >= 2 && earlyRecovered >= 2) {
    blocks.push({
      key: "ajuda",
      title: "O que parece ajudar",
      body: `Pode ser que eu esteja viajando, mas quando tu percebe tua fome antes de chegar no limite, isso costuma acontecer menos — em ${earlyRecovered} das ${early.length} vezes tu seguiu normalmente depois. Faz sentido?`,
      evidence: "observed",
      isHypothesis: true,
    });
  }

  // Estratégias realmente testadas (nunca dizer que ajuda só porque foi sugerida).
  const byTitle = new Map<string, { helped: number; tested: number }>();
  for (const t of trials) {
    if (t.result === "not_tested" || t.result === "situation_not_occurred") continue;
    const c = byTitle.get(t.title_snapshot) || { helped: 0, tested: 0 };
    c.tested += 1;
    if (t.result === "helped" || t.result === "partially_helped") c.helped += 1;
    byTitle.set(t.title_snapshot, c);
  }
  const bestStrategy = [...byTitle.entries()]
    .filter(([, v]) => v.tested >= 2 && v.helped >= 1)
    .sort((a, b) => b[1].helped - a[1].helped)[0];
  if (bestStrategy) {
    blocks.push({
      key: "estrategia",
      title: "Uma coisa que já funcionou",
      body: `${bestStrategy[0]} ajudou em ${bestStrategy[1].helped} de ${bestStrategy[1].tested} vezes em que tu testou.`,
      evidence: bestStrategy[1].tested >= 3 ? "pattern" : "observed",
    });
  }

  // --- 5. O que vale praticar agora (uma coisa só, concreta) ---
  let practice: string | null = null;
  if (recurring[0] && recurring[0].count >= 2) {
    const short = recurring[0].label.replace(/\.$/, "");
    practice = `Nesta semana, tenta perceber o “${short}” antes de tomar a próxima decisão. Não precisa mudar nada ainda — só notar que ele apareceu.`;
  } else if (early.length === 0 && thoughts.some((t) => (t.hunger_level ?? 0) >= 8)) {
    practice =
      "Nesta semana, tenta reparar na tua fome no meio da tarde, antes de ela chegar no limite.";
  } else if (windows[0] && windows[0].count >= 2) {
    practice = `Nesta semana, repara no que acontece no teu ${windows[0].label} — só observar já ajuda.`;
  } else if (bestStrategy) {
    practice = `Vale repetir o que já funcionou: ${bestStrategy[0].toLowerCase()}.`;
  }

  return { blocks, practice, tooEarly: blocks.length === 0, basedOn: n };
}
