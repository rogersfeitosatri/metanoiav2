"use client";

import { useStore } from "@/lib/store";
import { Card, SectionTitle, EmptyState } from "@/components/ui";
import { trendMessage } from "@/lib/consistency";
import { useAiReport } from "@/lib/useAiReport";

export default function AprendizadosPage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const patterns = store.patternsFor(userId);
  const consistency = store.consistencyFor(userId);
  const { report } = useAiReport(userId);

  const hasData =
    patterns.hardestTimeWindow ||
    patterns.frequentTriggers.length ||
    patterns.recurringThoughts.length;

  if (!hasData) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <EmptyState>
          Ainda estamos conhecendo tua rotina. Com o tempo, alguns padrões podem começar a aparecer.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <p className="text-warmgray-600">O que temos observado, sem julgamento.</p>
      </header>

      <Card className="bg-sage-50">
        <p className="leading-relaxed text-sage-800">{trendMessage(consistency)}</p>
      </Card>

      {patterns.hardestTimeWindow && (
        <Card>
          <SectionTitle>O que ficou mais difícil</SectionTitle>
          <p className="mt-1 text-warmgray-700">
            O {patterns.hardestTimeWindow.label} apareceu em {patterns.hardestTimeWindow.count}{" "}
            registro(s) recentes.
          </p>
        </Card>
      )}

      {patterns.frequentTriggers.length > 0 && (
        <Card>
          <SectionTitle>O que costuma acontecer antes</SectionTitle>
          <ul className="mt-2 space-y-1 text-warmgray-700">
            {patterns.frequentTriggers.slice(0, 3).map((t) => (
              <li key={t.label} className="flex justify-between">
                <span>{t.label}</span>
                <span className="text-warmgray-400">{t.count}x</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {patterns.recurringThoughts.length > 0 && (
        <Card>
          <SectionTitle>Pensamentos recorrentes</SectionTitle>
          <p className="mt-1 text-warmgray-700">
            O pensamento “{patterns.recurringThoughts[0].label}” apareceu com mais frequência.
          </p>
        </Card>
      )}

      {patterns.frequentEmotions.length > 0 && (
        <Card>
          <SectionTitle>Emoções recorrentes</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            {patterns.frequentEmotions.slice(0, 4).map((e) => (
              <span key={e.label} className="chip">
                {e.label} · {e.count}x
              </span>
            ))}
          </div>
        </Card>
      )}

      {patterns.helpfulStrategies.length > 0 && (
        <Card>
          <SectionTitle>Estratégias que ajudaram</SectionTitle>
          <ul className="mt-2 space-y-2 text-warmgray-700">
            {patterns.helpfulStrategies.map((s) => (
              <li key={s.label}>
                <span className="font-medium">{s.label}</span> ajudou em {s.helped} de {s.tested}{" "}
                vez(es) em que foi testada.
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="border-sand-200 bg-sand-50">
        <SectionTitle>Próximo experimento</SectionTitle>
        <p className="mt-1 text-warmgray-700">{report.next_experiment}</p>
      </Card>
    </div>
  );
}
