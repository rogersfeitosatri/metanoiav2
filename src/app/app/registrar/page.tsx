"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, SectionTitle } from "@/components/ui";
import { MEAL_LABELS } from "@/lib/labels";
import { FlowChat } from "@/components/chat/FlowChat";
import type { CheckinStatus, MealType } from "@/lib/types";

type Phase = "form" | "response" | "difficulty" | "done";

export default function RegistrarPage() {
  const store = useStore();
  const [phase, setPhase] = useState<Phase>("form");
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [meal, setMeal] = useState<MealType | "">("");
  const [note, setNote] = useState("");

  function register(s: CheckinStatus) {
    setStatus(s);
    store.addCheckin({
      status: s,
      meal_type: meal || null,
      note: note.trim() || null,
    });
    setPhase("response");
  }

  if (phase === "difficulty") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-sage-800">Vamos entender juntos</h1>
        <FlowChat flowId="difficulty" conversationType="checkin_followup" title="Entender o que aconteceu" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Registrar</h1>
        <p className="text-warmgray-600">Leva só alguns segundos.</p>
      </header>

      {phase === "form" && (
        <>
          <Card>
            <SectionTitle>Como foi essa refeição ou estratégia?</SectionTitle>
            <div className="mt-4 grid gap-3">
              <button
                className="flex items-center gap-3 rounded-xl border border-sage-200 bg-white px-4 py-4 text-left hover:bg-sage-50"
                onClick={() => register("completed")}
              >
                <span className="text-2xl">✅</span>
                <span className="font-medium text-warmgray-800">Realizei</span>
              </button>
              <button
                className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-4 text-left hover:bg-amber-50"
                onClick={() => register("partial")}
              >
                <span className="text-2xl">🟡</span>
                <span className="font-medium text-warmgray-800">Realizei parcialmente</span>
              </button>
              <button
                className="flex items-center gap-3 rounded-xl border border-warmgray-200 bg-white px-4 py-4 text-left hover:bg-warmgray-100"
                onClick={() => register("not_completed")}
              >
                <span className="text-2xl">○</span>
                <span className="font-medium text-warmgray-800">Não realizei</span>
              </button>
            </div>
          </Card>

          <Card>
            <SectionTitle>Opcional</SectionTitle>
            <div className="mt-3 space-y-3">
              <div>
                <label className="label">Qual refeição?</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(MEAL_LABELS) as MealType[]).map((m) => (
                    <button
                      key={m}
                      className={`chip ${meal === m ? "chip-selected" : ""}`}
                      onClick={() => setMeal(meal === m ? "" : m)}
                    >
                      {MEAL_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="note">
                  Observação curta
                </label>
                <input
                  id="note"
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Se quiser, escreve uma nota…"
                />
              </div>
            </div>
          </Card>
        </>
      )}

      {phase === "response" && status && (
        <Card>
          {status === "completed" ? (
            <>
              <p className="text-warmgray-700">
                Registrado. Tem algo nessa escolha que tu gostaria de repetir?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => setPhase("done")}>
                  Sim
                </button>
                <button className="btn-ghost" onClick={() => setPhase("done")}>
                  Não
                </button>
                <button className="btn-ghost" onClick={() => setPhase("done")}>
                  Apenas registrar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-warmgray-700">
                Entendi. Quer apenas registrar ou compreender o que aconteceu?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => setPhase("done")}>
                  Apenas registrar
                </button>
                <button className="btn-secondary" onClick={() => setPhase("difficulty")}>
                  Quero entender
                </button>
                <button className="btn-primary" onClick={() => setPhase("difficulty")}>
                  Preciso de ajuda para a próxima vez
                </button>
              </div>
            </>
          )}
        </Card>
      )}

      {phase === "done" && (
        <Card className="text-center">
          <p className="text-warmgray-700">Registrado. Tu está cuidando de ti, um passo de cada vez.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setPhase("form");
                setStatus(null);
                setMeal("");
                setNote("");
              }}
            >
              Novo registro
            </button>
            <Link href="/app/hoje" className="btn-ghost">
              Voltar ao início
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
