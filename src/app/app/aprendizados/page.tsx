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

  if (insights.tooEarly) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <EmptyState>
          {insights.basedOn === 0
            ? "Ainda não conversamos sobre nenhuma situação. Quando algo ficar difícil, é só me contar — os padrões aparecem a partir daí."
            : "Já temos uma situação registrada. Com mais algumas, começo a te mostrar o que se repete."}{" "}
          <Link href="/app/conversa" className="font-medium text-sage-700 underline">
            Conversar
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <p className="text-warmgray-600">
          O que estou começando a perceber — a partir das {insights.basedOn} situações que tu me
          contou.
        </p>
      </header>

      {insights.blocks.map((b) => (
        <InsightCard key={b.key} block={b} />
      ))}

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
