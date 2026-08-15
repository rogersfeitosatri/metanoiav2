"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
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
  const [editing, setEditing] = useState<FieldKey | "impact" | null>(null);
  const [draft, setDraft] = useState("");
  const impact = card?.life_impacts ? Object.values(card.life_impacts).filter(Boolean)[0] : "";

  function start(key: FieldKey | "impact", value = "") { setEditing(key); setDraft(value); }
  function save(key: FieldKey | "impact") {
    const patch: Partial<CopingCard> = key === "impact" ? { life_impacts: { ...(card?.life_impacts || {}), primeiro_impacto: draft.trim() } } : { [key]: draft.trim() };
    store.saveCopingCard(userId, patch); setEditing(null); setDraft("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <header><h1 className="text-2xl font-semibold text-sage-800">Meu Norte</h1><p className="mt-1 text-warmgray-600">O que dá sentido às mudanças, escrito com as tuas palavras.</p></header>
      {FIELDS.map((field) => <NorthField key={field.key} label={field.label} value={card?.[field.key] || ""} empty={field.empty} editing={editing === field.key} draft={draft} onDraft={setDraft} onEdit={() => start(field.key, card?.[field.key] || "")} onSave={() => save(field.key)} onCancel={() => setEditing(null)} />)}
      <NorthField label="Onde quero sentir essa diferença" value={impact} empty="Na saúde, nas relações, na energia ou em outra parte da vida." editing={editing === "impact"} draft={draft} onDraft={setDraft} onEdit={() => start("impact", impact)} onSave={() => save("impact")} onCancel={() => setEditing(null)} />
      {card?.cost_of_no_change && <section className="border-t border-warmgray-200 pt-5"><h2 className="font-semibold text-warmgray-800">O que estava pesando no começo</h2><p className="mt-2 leading-relaxed text-warmgray-600">{card.cost_of_no_change}</p></section>}
    </div>
  );
}

function NorthField({ label, value, empty, editing, draft, onDraft, onEdit, onSave, onCancel }: { label: string; value: string; empty: string; editing: boolean; draft: string; onDraft: (value: string) => void; onEdit: () => void; onSave: () => void; onCancel: () => void }) {
  return <section className="border-t border-warmgray-200 pt-5"><h2 className="font-semibold text-warmgray-800">{label}</h2>{editing ? <div className="mt-3 space-y-2"><textarea className="input min-h-24" value={draft} onChange={(event) => onDraft(event.target.value)} autoFocus /><div className="flex gap-2"><button className="btn-primary" onClick={onSave}>Salvar</button><button className="btn-ghost" onClick={onCancel}>Cancelar</button></div></div> : <div><p className={`mt-2 leading-relaxed ${value ? "text-warmgray-700" : "text-warmgray-400"}`}>{value || empty}</p><button className="mt-2 text-sm font-medium text-sage-700 underline" onClick={onEdit}>{value ? "Editar" : "Escrever"}</button></div>}</section>;
}
