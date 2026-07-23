"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, SectionTitle, StatusBadge } from "@/components/ui";
import { TODAY_STATE_OPTIONS } from "@/lib/labels";
import { classifyPatterns } from "@/lib/patterns";
import { trendMessage } from "@/lib/consistency";

export default function HojePage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const profile = store.currentProfile!;
  const [state, setState] = useState<string | null>(null);

  const checkins = store.db.meal_checkins.filter((c) => c.user_id === userId);
  const difficulties = store.db.difficulty_events.filter((d) => d.user_id === userId);
  const thoughts = store.db.thought_records.filter((t) => t.user_id === userId);
  const trials = store.db.strategy_trials.filter((t) => t.user_id === userId);
  const prefs = store.db.notification_preferences.find((n) => n.user_id === userId);
  const patterns = classifyPatterns(difficulties, thoughts, trials, checkins);
  const consistency = store.consistencyFor(userId);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const hasHistory = difficulties.length > 0;
  const contextLine = hasHistory && patterns.hardestTimeWindow
    ? `Ontem o ${patterns.hardestTimeWindow.label} foi mais difícil. Quer preparar uma estratégia para hoje?`
    : "Como tu gostaria de cuidar das tuas escolhas hoje?";

  const pendingStrategy = trials.find((t) => t.result === "not_tested");
  const supportTime = prefs?.support_times?.[0];
  const todayCheckins = checkins.filter(
    (c) => new Date(c.occurred_at).toDateString() === new Date().toDateString()
  );

  return (
    <div className="space-y-5">
      {/* Saudação contextual */}
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">
          {greeting}, {profile.preferred_name}.
        </h1>
        <p className="mt-1 leading-relaxed text-warmgray-600">{contextLine}</p>
      </header>

      {/* Estado atual */}
      <Card>
        <SectionTitle>Como está tua alimentação hoje?</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {TODAY_STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`chip ${state === opt.value ? "chip-selected" : ""}`}
              onClick={() => setState(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {state === "hard" && (
          <p className="mt-3 text-sm text-warmgray-600">
            Tudo bem estar difícil hoje.{" "}
            <Link href="/app/ajuda" className="font-medium text-sage-700 underline">
              Quer um apoio agora?
            </Link>
          </p>
        )}
      </Card>

      {/* Próximo momento importante */}
      {(hasHistory || supportTime) && (
        <Card className="border-sand-200 bg-sand-50">
          <SectionTitle>Próximo momento importante</SectionTitle>
          <p className="mt-1 text-warmgray-600">
            Hoje, por volta das {supportTime || "17h"}, pode ser um momento mais desafiador.
          </p>
          <Link href="/app/ajuda" className="btn-secondary mt-3">
            Preparar uma estratégia
          </Link>
        </Card>
      )}

      {/* Estratégia atual */}
      {pendingStrategy && (
        <Card>
          <SectionTitle>Tua estratégia em teste</SectionTitle>
          <p className="mt-1 italic text-warmgray-700">"{pendingStrategy.title_snapshot}"</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() =>
                store.updateStrategyTrial(pendingStrategy.id, {
                  result: "helped",
                  tested_at: new Date().toISOString(),
                })
              }
            >
              Vou tentar
            </button>
            <Link href="/app/ajuda" className="btn-secondary">
              Quero adaptar
            </Link>
            <button
              className="btn-ghost"
              onClick={() =>
                store.updateStrategyTrial(pendingStrategy.id, { result: "situation_not_occurred" })
              }
            >
              Não faz sentido hoje
            </button>
          </div>
        </Card>
      )}

      {/* Ajuda imediata */}
      <Link
        href="/app/ajuda"
        className="flex items-center justify-center gap-2 rounded-2xl bg-sage-600 px-6 py-5 text-lg font-semibold text-white shadow-card transition-colors hover:bg-sage-700"
      >
        🆘 Preciso de ajuda agora
      </Link>

      {/* Resumo leve do dia */}
      <Card>
        <SectionTitle>Teu dia até aqui</SectionTitle>
        <div className="mt-3 space-y-3 text-sm text-warmgray-600">
          <div className="flex items-center justify-between">
            <span>Registros de hoje</span>
            {todayCheckins.length > 0 ? (
              <div className="flex gap-1">
                {todayCheckins.slice(0, 4).map((c) => (
                  <StatusBadge key={c.id} status={c.status} />
                ))}
              </div>
            ) : (
              <span className="text-warmgray-400">Nenhum ainda</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span>Estratégia em teste</span>
            <span className="text-warmgray-500">
              {pendingStrategy ? "1 ativa" : "nenhuma"}
            </span>
          </div>
          <p className="rounded-xl bg-sage-50 p-3 leading-relaxed text-sage-800">
            {trendMessage(consistency)}
          </p>
        </div>
      </Card>
    </div>
  );
}
