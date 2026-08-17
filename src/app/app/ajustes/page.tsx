"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, SectionTitle } from "@/components/ui";
import { TERMS_TEXT, PRIVACY_TEXT } from "@/lib/demo-data";

export default function AjustesPage() {
  const store = useStore();
  const router = useRouter();
  const userId = store.currentUserId!;
  const profile = store.currentProfile!;
  const prefs = store.db.notification_preferences.find((n) => n.user_id === userId);
  const professional = store.db.professionals.find((p) => p.id === profile.professional_id);
  const proProfile = store.db.profiles.find((p) => p.id === professional?.profile_id);
  const [msg, setMsg] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState(false);

  function exportData() {
    const data = {
      perfil: profile,
      situacoes: store.db.difficulty_events.filter((d) => d.user_id === userId),
      registros_de_pensamento: store.db.thought_records.filter((t) => t.user_id === userId),
      pensamentos_alternativos: store.db.alternative_thoughts.filter((a) => a.user_id === userId),
      estrategias: store.db.strategy_trials.filter((t) => t.user_id === userId),
      conversas: store.db.conversations.filter((c) => c.user_id === userId),
      meu_norte: store.db.coping_cards.find((c) => c.user_id === userId),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metanoia-meus-dados.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Ajustes</h1>
      </header>

      <Card>
        <SectionTitle>Teu perfil</SectionTitle>
        <p className="mt-1 text-warmgray-700">{profile.preferred_name}</p>
        <p className="text-sm text-warmgray-500">{profile.email}</p>
      </Card>

      <Card>
        <SectionTitle>Lembretes</SectionTitle>
        <p className="mt-1 text-sm text-warmgray-600">
          Posso te lembrar perto dos horários que costumam ser mais difíceis.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-warmgray-700">Receber lembretes</span>
          <button
            role="switch"
            aria-checked={prefs?.enabled ?? false}
            onClick={() => setMsg("Preferência de lembretes atualizada.")}
            className={`h-7 w-12 rounded-full transition-colors ${
              prefs?.enabled ? "bg-sage-500" : "bg-warmgray-200"
            }`}
          >
            <span
              className={`block h-6 w-6 rounded-full bg-white transition-transform ${
                prefs?.enabled ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {prefs?.support_times?.length ? (
          <p className="mt-2 text-sm text-warmgray-500">
            Horários: {prefs.support_times.join(", ")}
          </p>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Quem acompanha</SectionTitle>
        {proProfile ? (
          <p className="mt-1 text-warmgray-700">
            {proProfile.full_name} — {professional?.profession}
          </p>
        ) : (
          <p className="mt-1 text-warmgray-500">Nenhum profissional vinculado à tua conta.</p>
        )}
      </Card>

      <Card>
        <SectionTitle>Teus dados</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={exportData}>
            Baixar meus dados
          </button>
          <button className="btn-ghost" onClick={() => setShowLegal((v) => !v)}>
            Termos e privacidade
          </button>
          <button
            className="btn-ghost"
            onClick={() => setMsg("Pedido de exclusão registrado. Vamos tratar conforme as regras do serviço.")}
          >
            Excluir minha conta
          </button>
        </div>
        {msg && <p className="mt-3 rounded-xl bg-sage-50 p-3 text-sm text-sage-800">{msg}</p>}
        {showLegal && (
          <div className="mt-3 space-y-3">
            <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-warmgray-50 p-3 text-xs leading-relaxed text-warmgray-600">
              {TERMS_TEXT}
            </pre>
            <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-warmgray-50 p-3 text-xs leading-relaxed text-warmgray-600">
              {PRIVACY_TEXT}
            </pre>
          </div>
        )}
      </Card>

      <button
        className="btn-ghost w-full"
        onClick={() => {
          store.logout();
          router.replace("/");
        }}
      >
        Sair
      </button>
    </div>
  );
}
