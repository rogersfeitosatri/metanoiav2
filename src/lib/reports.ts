// Módulo de relatórios (seções 19 e 23.7). Transforma dados estruturados em relatório
// acolhedor, sem linguagem de fracasso.

import type { PatternSummary } from "./patterns";
import type { WeeklyReportContent } from "./ai/schemas";
import { WeeklyReportSchema } from "./ai/schemas";

export function buildWeeklyReport(patterns: PatternSummary): WeeklyReportContent {
  const hardest = patterns.hardestTimeWindow;
  const trigger = patterns.frequentTriggers[0];
  const thought = patterns.recurringThoughts[0];
  const emotion = patterns.frequentEmotions[0];
  const strategy = patterns.helpfulStrategies.find((s) => s.helped > 0);

  const userLines: string[] = [];
  if (hardest) {
    userLines.push(
      `O ${hardest.label} exigiu mais atenção nesta semana, aparecendo em ${hardest.count} registro(s).`
    );
  }
  if (trigger) {
    userLines.push(`Em algumas dessas situações, ${trigger.label.replace(/\.$/, "").toLowerCase()} apareceu com frequência.`);
  }
  if (strategy) {
    userLines.push(
      `${strategy.label.replace(/\.$/, "")} ajudou em ${strategy.helped} de ${strategy.tested} vez(es) em que foi testada.`
    );
  }
  userLines.push("Mesmo depois de sair do planejado, tu conseguiu retomar em algumas situações. Uma escolha isolada não definiu o restante da semana.");

  const proLines: string[] = [];
  if (hardest) proLines.push(`Janela crítica predominante: ${hardest.label} (${hardest.count} eventos).`);
  if (patterns.hardestWeekday) proLines.push(`Dia mais difícil: ${patterns.hardestWeekday.label}.`);
  if (thought) proLines.push(`Pensamento recorrente: "${thought.label}" (${thought.count}x).`);
  if (emotion) proLines.push(`Emoção predominante: ${emotion.label} (${emotion.count}x).`);
  if (patterns.averageRecoveryDays !== null)
    proLines.push(`Tempo médio de retomada: ${patterns.averageRecoveryDays} dia(s).`);

  const content: WeeklyReportContent = {
    user_summary: userLines.join(" "),
    professional_summary: proLines.join(" "),
    hardest_moments: hardest ? [hardest.label] : [],
    frequent_triggers: patterns.frequentTriggers.map((t) => t.label),
    recurring_thoughts: patterns.recurringThoughts.map((t) => t.label),
    predominant_emotions: patterns.frequentEmotions.map((e) => e.label),
    helpful_strategies: patterns.helpfulStrategies
      .filter((s) => s.helped > 0)
      .map((s) => s.label),
    next_experiment: hardest
      ? `Nesta semana, vamos testar uma pausa antes do ${hardest.label} para observar fome e organização.`
      : "Nesta semana, vamos testar uma pausa de dois minutos antes das decisões mais difíceis.",
  };

  return WeeklyReportSchema.parse(content);
}
