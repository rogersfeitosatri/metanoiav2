"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/ui";
import { buildInsights, type InsightBlock } from "@/lib/insights";

export default function AprendizadosPage() {
  const store = useStore();
  const userId = store.currentUserId!;

  const insights = buildInsights(
    store.db.difficulty_events.filter((d) => d.user_id === userId),
    store.db.thought_records.filter((t) => t.user_id === userId),
    store.db.strategy_trials.filter((t) => t.user_id === userId),
    store.db.alternative_thoughts.filter((a) => a.user_id === userId)
  );

  // Fatores protetores só entram aqui depois de confirmados pela própria pessoa.
  const protective = store.db.user_memories.filter(
    (m) =>
      m.user_id === userId &&
      m.validation_status === "confirmed" &&
      m.memory_kind === "protective_factor"
  );
  const pending = store.db.strategy_trials.filter(
    (t) => t.user_id === userId && t.result === "not_tested"
  );

  const hasAnything = !insights.tooEarly || protective.length > 0;

  if (!hasAnything) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <EmptyState>
          {insights.basedOn === 0
            ? "Ainda não conversamos sobre nenhuma situação. Quando algo ficar difícil, é só me contar — os padrões aparecem a partir daí."
            : "Já temos uma situação registrada. Com mais algumas, começo a te mostrar o que se repete."}{" "}
          <Link href="/app/hoje" className="font-medium text-sage-700 underline">
            Conversar
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <p className="mt-1 text-warmgray-600">
          {insights.basedOn > 0
            ? `O que estou começando a perceber — a partir das ${insights.basedOn} situações que tu me contou.`
            : "O que estou começando a perceber sobre ti."}
        </p>
      </header>

      {insights.blocks.map((b) => (
        <InsightCard key={b.key} block={b} />
      ))}

      {/* Veio do que a própria pessoa disse que ajudou. */}
      {protective.length > 0 && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-sage-600">
            O que te protege
          </p>
          <ul className="mt-1 space-y-1 leading-relaxed text-warmgray-800">
            {protective.slice(0, 3).map((m) => (
              <li key={m.id}>• {m.content}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warmgray-400">
            Isso veio do que tu mesmo confirmou que ajuda.
          </p>
        </Card>
      )}

      {/* Nunca contar como "funciona" o que ainda não foi testado. */}
      {pending.length > 0 && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-sage-600">Em teste</p>
          <p className="mt-1 leading-relaxed text-warmgray-800">
            “{pending[0].title_snapshot}” ainda é um experimento. Só entra entre o que ajuda
            depois que tu avaliar.
          </p>
        </Card>
      )}

      {insights.practice && (
        <Card className="border-sand-200 bg-sand-50">
          <p className="text-xs font-medium uppercase tracking-wide text-warmgray-500">
            O que vale praticar agora
          </p>
          <p className="mt-1 leading-relaxed text-warmgray-800">{insights.practice}</p>
        </Card>
      )}
    </div>
  );
}

function InsightCard({ block }: { block: InsightBlock }) {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);

  return (
    <Card className={block.isHypothesis ? "border-teal-200 bg-teal-50/40" : ""}>
      <p className="text-xs font-medium uppercase tracking-wide text-sage-600">{block.title}</p>
      <p className="mt-1 leading-relaxed text-warmgray-800">{block.body}</p>

      {/* Hipótese só vira verdade se a pessoa confirmar. */}
      {block.isHypothesis && (
        <div className="mt-3">
          {answer === null ? (
            <div className="flex flex-wrap gap-2">
              <button className="chip" onClick={() => setAnswer("yes")}>
                Faz sentido
              </button>
              <button className="chip" onClick={() => setAnswer("no")}>
                Não é bem assim
              </button>
            </div>
          ) : (
            <p className="text-sm text-warmgray-500">
              {answer === "yes"
                ? "Beleza, vou considerar isso daqui pra frente."
                : "Tranquilo, risquei essa. Me conta na próxima conversa como tu vê isso."}
            </p>
          )}
        </div>
      )}

      {block.evidence === "observed" && !block.isHypothesis && (
        <p className="mt-2 text-xs text-warmgray-400">
          Ainda são poucas situações — isso pode mudar.
        </p>
      )}
    </Card>
  );
}
