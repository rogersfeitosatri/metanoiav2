"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/ui";
import { computeEvolution, type SkillDimension } from "@/lib/evolution";

export default function EvolucaoPage() {
  const store = useStore();
  const userId = store.currentUserId!;

  const evo = computeEvolution({
    difficulties: store.db.difficulty_events.filter((d) => d.user_id === userId),
    thoughts: store.db.thought_records.filter((t) => t.user_id === userId),
    trials: store.db.strategy_trials.filter((t) => t.user_id === userId),
    altThoughts: store.db.alternative_thoughts.filter((a) => a.user_id === userId),
  });

  if (evo.tooEarly) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-sage-800">Evolução</h1>
        <EmptyState>
          {evo.headline}{" "}
          <Link href="/app/conversa" className="font-medium text-sage-700 underline">
            Começar uma conversa
          </Link>
        </EmptyState>
      </div>
    );
  }

  const diff = evo.situationsPreviousWeek - evo.situationsThisWeek;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Evolução</h1>
        <p className="text-warmgray-600">O que tu está aprendendo a fazer diferente.</p>
      </header>

      {/* Frase principal: como lidou, não se "seguiu a dieta" */}
      <Card className="bg-sage-50">
        <p className="leading-relaxed text-sage-900">{evo.headline}</p>
      </Card>

      {/* Situações difíceis: contagem + leitura, nunca só o número */}
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-warmgray-500">
          Situações difíceis
        </p>
        <div className="mt-2 flex items-end gap-6">
          <div>
            <p className="text-3xl font-semibold text-sage-700">{evo.situationsThisWeek}</p>
            <p className="text-sm text-warmgray-500">esta semana</p>
          </div>
          <div>
            <p className="text-2xl font-medium text-warmgray-400">{evo.situationsPreviousWeek}</p>
            <p className="text-sm text-warmgray-400">semana anterior</p>
          </div>
        </div>
        {diff !== 0 && evo.situationsPreviousWeek > 0 && (
          <p className="mt-2 text-sm text-warmgray-600">
            {diff > 0
              ? `${diff} situação(ões) a menos que na semana passada.`
              : `${Math.abs(diff)} situação(ões) a mais que na semana passada.`}
          </p>
        )}
      </Card>

      {/* Habilidades por dimensão */}
      {evo.dimensions.length === 0 ? (
        <EmptyState>
          Ainda estamos juntando informação suficiente para falar das tuas habilidades. Mais
          algumas conversas e isso começa a aparecer aqui.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {evo.dimensions.map((d) => (
            <DimensionCard key={d.key} dim={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionCard({ dim }: { dim: SkillDimension }) {
  const pct = dim.count && dim.count.total > 0 ? (dim.count.of / dim.count.total) * 100 : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-warmgray-800">{dim.label}</p>
        {dim.trend && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              dim.trend === "up"
                ? "bg-sage-100 text-sage-700"
                : dim.trend === "down"
                  ? "bg-sand-200 text-warmgray-700"
                  : "bg-warmgray-100 text-warmgray-500"
            }`}
          >
            {dim.trend === "up" ? "↑ melhorando" : dim.trend === "down" ? "↓ atenção" : "→ estável"}
          </span>
        )}
      </div>
      <p className="mt-1 leading-relaxed text-warmgray-700">{dim.statement}</p>
      {pct !== null && (
        <div className="mt-3 h-1.5 w-full rounded-full bg-warmgray-100">
          <div
            className="h-1.5 rounded-full bg-sage-400 transition-all"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      )}
      {dim.evidence === "observed" && (
        <p className="mt-2 text-xs text-warmgray-400">
          Baseado em poucas situações ainda — pode mudar conforme tu registrar mais.
        </p>
      )}
    </Card>
  );
}
