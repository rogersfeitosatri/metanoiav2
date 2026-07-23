"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, ProgressBar, SectionTitle } from "@/components/ui";
import { LIFE_IMPACT_DIMENSIONS } from "@/lib/labels";
import type { CopingCard, LifeImpacts } from "@/lib/types";

// Campos de texto simples do cartão.
interface TextField {
  key: "desired_identity" | "reminder_statement" | "personal_commitment";
  section: string;
  question: string;
  placeholder: string;
}

const TEXT_FIELDS: TextField[] = [
  {
    key: "desired_identity",
    section: "Quem estou construindo",
    question: "Quem eu quero me tornar ao cuidar da minha alimentação?",
    placeholder: "Ex.: alguém que cuida de si com constância…",
  },
  {
    key: "reminder_statement",
    section: "O que quero lembrar",
    question: "O que quero lembrar nos momentos difíceis?",
    placeholder: "Uma frase para te sustentar quando ficar difícil…",
  },
  {
    key: "personal_commitment",
    section: "Meu compromisso",
    question: "Qual compromisso assumo comigo mesmo?",
    placeholder: "Ex.: nos dias difíceis, faço uma pausa antes de decidir.",
  },
];

export default function NortePage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const card = store.db.coping_cards.find((c) => c.user_id === userId);
  const impacts: LifeImpacts = card?.life_impacts || {};

  const [editingImpact, setEditingImpact] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingThoughts, setEditingThoughts] = useState(false);
  const [draft, setDraft] = useState("");

  function saveImpact(key: string) {
    const next = { ...impacts, [key]: draft.trim() };
    store.saveCopingCard(userId, { life_impacts: next });
    setEditingImpact(null);
  }

  function saveField(field: TextField) {
    store.saveCopingCard(userId, { [field.key]: draft.trim() } as Partial<CopingCard>);
    setEditingField(null);
  }

  function saveThoughts() {
    const list = draft.split("\n").map((s) => s.trim()).filter(Boolean);
    store.saveCopingCard(userId, { sabotaging_thoughts: list });
    setEditingThoughts(false);
  }

  const filledImpacts = LIFE_IMPACT_DIMENSIONS.filter((d) => impacts[d.key]?.trim()).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Meu Norte</h1>
        <p className="text-warmgray-600">
          Teu Cartão de Enfrentamento. Constrói aos poucos, sem pressa.
        </p>
      </header>

      <Card>
        <div className="mb-2 flex items-center justify-between text-sm text-warmgray-600">
          <span>Cartão construído</span>
          <span>{card?.completed_percentage ?? 0}%</span>
        </div>
        <ProgressBar value={card?.completed_percentage ?? 0} />
      </Card>

      {/* Seção central: impacto por dimensões de vida */}
      <section>
        <div className="rounded-2xl bg-sage-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-sage-600">
            O que eu ganho com isso
          </p>
          <h2 className="mt-1 text-xl font-semibold text-sage-800">
            Como seguir o meu plano alimentar vai impactar a minha vida
          </h2>
          <p className="mt-1 text-sm text-warmgray-600">
            Preenche as áreas que fizerem sentido para ti. Isso te ajuda a lembrar{" "}
            <em>por que</em> vale a pena, especialmente nos momentos difíceis.
          </p>
          <p className="mt-2 text-xs text-sage-700">
            {filledImpacts} de {LIFE_IMPACT_DIMENSIONS.length} áreas preenchidas
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {LIFE_IMPACT_DIMENSIONS.map((dim) => {
            const value = impacts[dim.key];
            const isEditing = editingImpact === dim.key;
            return (
              <Card key={dim.key} className={value ? "border-sage-200" : ""}>
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {dim.icon}
                  </span>
                  <span className="font-semibold text-warmgray-800">{dim.label}</span>
                </div>
                <p className="mt-1 text-sm text-warmgray-500">{dim.prompt}</p>

                {isEditing ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="input min-h-[80px]"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                      placeholder="Escreve com tuas palavras…"
                    />
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={() => saveImpact(dim.key)}>
                        Salvar
                      </button>
                      <button className="btn-ghost" onClick={() => setEditingImpact(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    {value ? (
                      <p className="rounded-xl bg-sand-50 p-3 text-warmgray-700">{value}</p>
                    ) : (
                      <p className="text-warmgray-400">Ainda não preenchido.</p>
                    )}
                    <button
                      className="mt-2 text-sm font-medium text-sage-700 hover:underline"
                      onClick={() => {
                        setEditingImpact(dim.key);
                        setDraft(value || "");
                      }}
                    >
                      {value ? "Editar" : "Escrever"}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Campos de texto do cartão */}
      {TEXT_FIELDS.map((field) => {
        const value = card?.[field.key];
        const isEditing = editingField === field.key;
        return (
          <Card key={field.key}>
            <p className="text-xs font-medium uppercase tracking-wide text-sage-600">
              {field.section}
            </p>
            <p className="mt-1 font-medium text-warmgray-800">{field.question}</p>
            {isEditing ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input min-h-[80px]"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  placeholder={field.placeholder}
                />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => saveField(field)}>
                    Salvar
                  </button>
                  <button className="btn-ghost" onClick={() => setEditingField(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                {value ? (
                  <p className="italic text-warmgray-700">&ldquo;{value as string}&rdquo;</p>
                ) : (
                  <p className="text-warmgray-400">Ainda não preenchido.</p>
                )}
                <button
                  className="mt-2 text-sm font-medium text-sage-700 hover:underline"
                  onClick={() => {
                    setEditingField(field.key);
                    setDraft((value as string) || "");
                  }}
                >
                  {value ? "Editar" : "Preencher"}
                </button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Pensamentos que me afastam */}
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-sage-600">
          Pensamentos que me afastam
        </p>
        <p className="mt-1 font-medium text-warmgray-800">
          Quais pensamentos costumam me afastar do meu objetivo?
        </p>
        {editingThoughts ? (
          <div className="mt-3 space-y-2">
            <textarea
              className="input min-h-[90px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="Um pensamento por linha…"
            />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={saveThoughts}>
                Salvar
              </button>
              <button className="btn-ghost" onClick={() => setEditingThoughts(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            {card?.sabotaging_thoughts?.length ? (
              <ul className="space-y-1 text-warmgray-700">
                {card.sabotaging_thoughts.map((t, i) => (
                  <li key={i}>• {t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-warmgray-400">Ainda não preenchido.</p>
            )}
            <button
              className="mt-2 text-sm font-medium text-sage-700 hover:underline"
              onClick={() => {
                setEditingThoughts(true);
                setDraft((card?.sabotaging_thoughts || []).join("\n"));
              }}
            >
              {card?.sabotaging_thoughts?.length ? "Editar" : "Preencher"}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
