"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, ProgressBar } from "@/components/ui";
import type { CopingCard } from "@/lib/types";

interface Field {
  key: keyof CopingCard;
  question: string;
  section: string;
  multi?: boolean;
}

const FIELDS: Field[] = [
  { key: "desired_identity", question: "Quem eu quero me tornar?", section: "Quem estou construindo" },
  { key: "main_goal", question: "Qual é meu principal objetivo?", section: "Quem estou construindo" },
  { key: "why_it_matters", question: "Por que isso realmente importa para mim?", section: "Por que isso importa" },
  { key: "future_difference", question: "Como minha vida será diferente quando eu alcançar esse objetivo?", section: "Por que isso importa" },
  { key: "cost_of_no_change", question: "O que acontece se nada mudar?", section: "Por que isso importa" },
  { key: "sabotaging_thoughts", question: "Quais pensamentos costumam me afastar desse objetivo?", section: "Pensamentos que me afastam", multi: true },
  { key: "reminder_statement", question: "O que quero lembrar nos momentos difíceis?", section: "O que quero lembrar" },
  { key: "personal_commitment", question: "Qual compromisso assumo comigo mesmo?", section: "Meu compromisso" },
];

export default function NortePage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const card = store.db.coping_cards.find((c) => c.user_id === userId);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function startEdit(field: Field) {
    setEditing(field.key as string);
    const cur = card?.[field.key];
    setDraft(Array.isArray(cur) ? cur.join("\n") : (cur as string) || "");
  }

  function save(field: Field) {
    const value = field.multi
      ? draft.split("\n").map((s) => s.trim()).filter(Boolean)
      : draft.trim();
    store.saveCopingCard(userId, { [field.key]: value } as Partial<CopingCard>);
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Meu Norte</h1>
        <p className="text-warmgray-600">
          Teu Cartão de Enfrentamento. Podes construir aos poucos, sem pressa.
        </p>
      </header>

      <Card>
        <div className="mb-2 flex items-center justify-between text-sm text-warmgray-600">
          <span>Cartão construído</span>
          <span>{card?.completed_percentage ?? 0}%</span>
        </div>
        <ProgressBar value={card?.completed_percentage ?? 0} />
      </Card>

      {FIELDS.map((field) => {
        const value = card?.[field.key];
        const filled = field.multi
          ? Array.isArray(value) && value.length > 0
          : Boolean(value);
        return (
          <Card key={field.key as string}>
            <p className="text-xs font-medium uppercase tracking-wide text-sage-600">
              {field.section}
            </p>
            <p className="mt-1 font-medium text-warmgray-800">{field.question}</p>

            {editing === field.key ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input min-h-[90px]"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={field.multi ? "Um pensamento por linha…" : "Escreve com tuas palavras…"}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => save(field)}>
                    Salvar
                  </button>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                {filled ? (
                  field.multi ? (
                    <ul className="space-y-1 text-warmgray-700">
                      {(value as string[]).map((v, i) => (
                        <li key={i}>• {v}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="italic text-warmgray-700">"{value as string}"</p>
                  )
                ) : (
                  <p className="text-warmgray-400">Ainda não preenchido.</p>
                )}
                <button
                  className="mt-2 text-sm font-medium text-sage-700 hover:underline"
                  onClick={() => startEdit(field)}
                >
                  {filled ? "Editar" : "Preencher"}
                </button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
