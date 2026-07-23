"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, SectionTitle } from "@/components/ui";
import { TERMS_TEXT, PRIVACY_TEXT } from "@/lib/demo-data";

export default function PrivacidadePage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const profile = store.currentProfile!;
  const professional = store.db.professionals.find((p) => p.id === profile.professional_id);
  const proProfile = store.db.profiles.find((p) => p.id === professional?.profile_id);
  const [message, setMessage] = useState<string | null>(null);

  function exportData() {
    const data = {
      profile,
      checkins: store.db.meal_checkins.filter((c) => c.user_id === userId),
      difficulties: store.db.difficulty_events.filter((d) => d.user_id === userId),
      conversations: store.db.conversations.filter((c) => c.user_id === userId),
      coping_card: store.db.coping_cards.find((c) => c.user_id === userId),
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
        <h1 className="text-2xl font-semibold text-sage-800">Privacidade</h1>
        <p className="text-warmgray-600">Teus dados, teus direitos.</p>
      </header>

      <Card>
        <SectionTitle>Profissional vinculado</SectionTitle>
        {proProfile ? (
          <p className="mt-1 text-warmgray-700">
            {proProfile.full_name} — {professional?.profession} ({professional?.registration_number})
          </p>
        ) : (
          <p className="mt-1 text-warmgray-500">Nenhum profissional vinculado.</p>
        )}
        <p className="mt-2 text-sm text-warmgray-500">
          Ao aceitar os Termos, tu autorizou que este profissional acompanhe tuas conversas e
          registros para te dar suporte.
        </p>
      </Card>

      <Card>
        <SectionTitle>Meus direitos</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={exportData}>
            Exportar meus dados
          </button>
          <button
            className="btn-ghost"
            onClick={() => setMessage("Solicitação de correção registrada. Entraremos em contato.")}
          >
            Solicitar correção
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              setMessage(
                "Solicitação de exclusão registrada. Tua conta será encerrada conforme as regras do serviço."
              )
            }
          >
            Solicitar exclusão da conta
          </button>
        </div>
        {message && <p className="mt-3 rounded-xl bg-sage-50 p-3 text-sm text-sage-800">{message}</p>}
      </Card>

      <Card>
        <SectionTitle>Termos e Condições</SectionTitle>
        <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-warmgray-600">
          {TERMS_TEXT}
        </pre>
      </Card>

      <Card>
        <SectionTitle>Política de Privacidade</SectionTitle>
        <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-warmgray-600">
          {PRIVACY_TEXT}
        </pre>
      </Card>
    </div>
  );
}
