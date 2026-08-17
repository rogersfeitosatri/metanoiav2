"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { LIFE_IMPACT_DIMENSIONS } from "@/lib/labels";
import type { CopingCard } from "@/lib/types";

type FieldKey = "main_goal" | "why_it_matters" | "desired_identity" | "reminder_statement";
const FIELDS: Array<{ key: FieldKey; label: string; empty: string }> = [
  { key: "main_goal", label: "O que estou buscando", empty: "Ainda estamos construindo esse objetivo." },
  { key: "why_it_matters", label: "Por que isso importa para mim", empty: "Essa resposta pode surgir nas próximas conversas." },
  { key: "desired_identity", label: "Quem quero ser nesse cuidado", empty: "Uma identidade que não dependa do número na balança." },
  { key: "reminder_statement", label: "O que quero lembrar quando ficar difícil", empty: "Uma frase tua pode virar uma âncora aqui." },
];

export default function NortePage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const card = store.db.coping_cards.find((item) => item.user_id === userId);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const impacts = card?.life_impacts || {};
  // Impacto solto vindo do onboarding entra como texto geral, sem se perder.
  const legacyImpact = impacts.primeiro_impacto || "";
  const filled = LIFE_IMPACT_DIMENSIONS.filter((d) => impacts[d.key]?.trim()).length;

  function start(key: string, value = "") {
    setEditing(key);
    setDraft(value);
  }
  function saveField(key: FieldKey) {
    store.saveCopingCard(userId, { [key]: draft.trim() } as Partial<CopingCard>);
    setEditing(null);
    setDraft("");
  }
  function saveImpact(dimKey: string) {
    store.saveCopingCard(userId, {
      life_impacts: { ...impacts, [dimKey]: draft.trim() },
    });
    setEditing(null);
    setDraft("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Meu Norte</h1>
        <p className="mt-1 text-warmgray-600">
          O que dá sentido às mudanças, escrito com as tuas palavras.
        </p>
      </header>

      {FIELDS.map((field) => (
        <NorthField
          key={field.key}
          label={field.label}
          value={card?.[field.key] || ""}
          empty={field.empty}
          editing={editing === field.key}
          draft={draft}
          onDraft={setDraft}
          onEdit={() => start(field.key, card?.[field.key] || "")}
          onSave={() => saveField(field.key)}
          onCancel={() => setEditing(null)}
        />
      ))}

      {/* Impacto por área de vida — ajuda a pessoa a entender o que ganha com isso. */}
      <section className="border-t border-warmgray-200 pt-5">
        <h2 className="font-semibold text-warmgray-800">
          Como seguir o meu plano vai impactar a minha vida
        </h2>

        {/* Pendência: no cadastro pedimos só as áreas principais. O resto fica aqui,
            como convite — sem cobrança. */}
        {filled > 0 && filled < LIFE_IMPACT_DIMENSIONS.length && (
          <div className="mt-3 rounded-lg border border-sand-300 bg-sand-50 p-4">
            <p className="text-sm font-medium text-warmgray-800">
              Faltam {LIFE_IMPACT_DIMENSIONS.length - filled} áreas para completar
            </p>
            <p className="mt-1 text-sm text-warmgray-600">
              Quanto mais motivos tu tiver escritos aqui, mais forte fica teu Norte nos
              momentos difíceis. Dá pra preencher aos poucos.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LIFE_IMPACT_DIMENSIONS.filter((d) => !impacts[d.key]?.trim()).map((d) => (
                <button
                  key={d.key}
                  className="chip"
                  onClick={() => start(`impact:${d.key}`, "")}
                >
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mt-1 text-sm text-warmgray-500">
          Preenche as áreas que fizerem sentido. {filled} de {LIFE_IMPACT_DIMENSIONS.length}{" "}
          preenchidas.
        </p>
        {legacyImpact && (
          <p className="mt-3 rounded-lg bg-sand-50 p-3 leading-relaxed text-warmgray-700">
            {legacyImpact}
          </p>
        )}

        <div className="mt-4 space-y-4">
          {LIFE_IMPACT_DIMENSIONS.map((dim) => {
            const value = impacts[dim.key] || "";
            const isEditing = editing === `impact:${dim.key}`;
            return (
              <div key={dim.key}>
                <p className="font-medium text-warmgray-800">
                  <span aria-hidden>{dim.icon}</span> {dim.label}
                </p>
                <p className="text-sm text-warmgray-500">{dim.prompt}</p>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className="input min-h-20"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                      placeholder="Escreve do teu jeito…"
                    />
                    {dim.examples?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {dim.examples.map((ex) => (
                          <button key={ex} type="button" className="chip" onClick={() => setDraft(ex)}>
                            {ex}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={() => saveImpact(dim.key)}>
                        Salvar
                      </button>
                      <button className="btn-ghost" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {value && (
                      <p className="mt-1 rounded-lg bg-sand-50 p-3 leading-relaxed text-warmgray-700">
                        {value}
                      </p>
                    )}
                    <button
                      className="mt-1 text-sm font-medium text-sage-700 underline"
                      onClick={() => start(`impact:${dim.key}`, value)}
                    >
                      {value ? "Editar" : "Escrever"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {card?.cost_of_no_change && (
        <section className="border-t border-warmgray-200 pt-5">
          <h2 className="font-semibold text-warmgray-800">O que estava pesando no começo</h2>
          <p className="mt-2 leading-relaxed text-warmgray-600">{card.cost_of_no_change}</p>
        </section>
      )}
    </div>
  );
}

function NorthField({
  label,
  value,
  empty,
  editing,
  draft,
  onDraft,
  onEdit,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  empty: string;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="border-t border-warmgray-200 pt-5">
      <h2 className="font-semibold text-warmgray-800">{label}</h2>
      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            className="input min-h-24"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={onSave}>
              Salvar
            </button>
            <button className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className={`mt-2 leading-relaxed ${value ? "text-warmgray-700" : "text-warmgray-400"}`}>
            {value || empty}
          </p>
          <button className="mt-2 text-sm font-medium text-sage-700 underline" onClick={onEdit}>
            {value ? "Editar" : "Escrever"}
          </button>
        </div>
      )}
    </section>
  );
}
