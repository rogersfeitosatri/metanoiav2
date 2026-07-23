"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, SectionTitle, EmptyState } from "@/components/ui";
import { RISK_CATEGORY_LABELS } from "@/lib/labels";

const TABS = ["Métricas", "Profissionais", "Usuários", "Vínculos", "Termos", "Alertas críticos", "Logs"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("Métricas");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-warmgray-800">Painel administrativo</h1>

      <div className="flex gap-1 overflow-x-auto border-b border-warmgray-100">
        {TABS.map((t) => (
          <button
            key={t}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-sage-500 text-sage-700" : "text-warmgray-500"
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Métricas" && <Metrics />}
      {tab === "Profissionais" && <Professionals />}
      {tab === "Usuários" && <Users />}
      {tab === "Vínculos" && <Links />}
      {tab === "Termos" && <Terms />}
      {tab === "Alertas críticos" && <CriticalAlerts />}
      {tab === "Logs" && <Logs />}
    </div>
  );
}

function Metrics() {
  const store = useStore();
  const users = store.db.profiles.filter((p) => p.role === "user");
  const pros = store.db.professionals;
  const openAlerts = store.db.risk_flags.filter((r) => r.status === "open" || r.status === "viewed");
  const convs = store.db.conversations.length;
  const onboardingDone = users.filter((u) => u.onboarding_completed).length;

  const cards = [
    ["Usuários", users.length],
    ["Profissionais", pros.length],
    ["Conversas", convs],
    ["Onboarding concluído", `${onboardingDone}/${users.length}`],
    ["Alertas abertos", openAlerts.length],
    ["Registros", store.db.meal_checkins.length],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map(([label, value]) => (
        <Card key={label as string}>
          <p className="text-3xl font-semibold text-sage-700">{value}</p>
          <p className="text-sm text-warmgray-500">{label}</p>
        </Card>
      ))}
    </div>
  );
}

function Professionals() {
  const store = useStore();
  return (
    <div className="space-y-2">
      {store.db.professionals.map((pro) => {
        const profile = store.db.profiles.find((p) => p.id === pro.profile_id);
        const linked = store.db.professional_user_links.filter(
          (l) => l.professional_id === pro.id && l.active
        ).length;
        return (
          <Card key={pro.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-warmgray-800">{profile?.full_name}</p>
              <p className="text-sm text-warmgray-500">
                {pro.profession} · {pro.registration_number} · {linked} usuário(s)
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                pro.active ? "bg-sage-100 text-sage-700" : "bg-warmgray-100 text-warmgray-500"
              }`}
            >
              {pro.active ? "Ativo" : "Inativo"}
            </span>
          </Card>
        );
      })}
    </div>
  );
}

function Users() {
  const store = useStore();
  const users = store.db.profiles.filter((p) => p.role === "user");
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <Card key={u.id} className="flex items-center justify-between py-3">
          <div>
            <p className="font-medium text-warmgray-800">{u.full_name}</p>
            <p className="text-sm text-warmgray-500">
              {u.email} · termos v{u.terms_version || "—"}
            </p>
          </div>
          <span className="text-xs text-warmgray-400">
            {u.onboarding_completed ? "onboarding ok" : "pendente"}
          </span>
        </Card>
      ))}
    </div>
  );
}

function Links() {
  const store = useStore();
  const users = store.db.profiles.filter((p) => p.role === "user");
  const pros = store.db.professionals;
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <Card key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <p className="font-medium text-warmgray-800">{u.full_name}</p>
          <select
            className="input max-w-xs"
            value={u.professional_id || ""}
            onChange={(e) => store.linkUserToProfessional(u.id, e.target.value)}
          >
            <option value="">Sem vínculo</option>
            {pros.map((pro) => {
              const profile = store.db.profiles.find((p) => p.id === pro.profile_id);
              return (
                <option key={pro.id} value={pro.id}>
                  {profile?.full_name}
                </option>
              );
            })}
          </select>
        </Card>
      ))}
    </div>
  );
}

function Terms() {
  const store = useStore();
  return (
    <div className="space-y-3">
      {store.db.legal_documents.map((d) => (
        <Card key={d.id}>
          <div className="flex items-center justify-between">
            <SectionTitle>
              {d.type === "terms" ? "Termos e Condições" : "Política de Privacidade"} — v{d.version}
            </SectionTitle>
            {d.active && (
              <span className="rounded-full bg-sage-100 px-3 py-1 text-xs text-sage-700">Ativa</span>
            )}
          </div>
          <p className="mt-1 text-xs text-warmgray-400">
            {store.db.legal_acceptances.filter((a) => a.document_id === d.id).length} aceite(s) registrado(s)
          </p>
        </Card>
      ))}
    </div>
  );
}

function CriticalAlerts() {
  const store = useStore();
  const alerts = store.db.risk_flags
    .filter((r) => r.severity === "high" || r.severity === "medium")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (alerts.length === 0) return <EmptyState>Nenhum alerta crítico no momento.</EmptyState>;
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const user = store.db.profiles.find((p) => p.id === a.user_id);
        return (
          <Card key={a.id}>
            <p className="font-medium text-warmgray-800">
              {RISK_CATEGORY_LABELS[a.category]} · {user?.full_name}
            </p>
            <p className="text-sm text-warmgray-500">{a.evidence}</p>
            <p className="text-xs text-warmgray-400">Status: {a.status}</p>
          </Card>
        );
      })}
    </div>
  );
}

function Logs() {
  const store = useStore();
  const logs = store.db.audit_logs
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);
  return (
    <div className="space-y-1">
      {logs.map((l) => (
        <div key={l.id} className="rounded-lg bg-white px-3 py-2 text-sm text-warmgray-600 shadow-soft">
          <span className="font-medium text-warmgray-800">{l.action}</span> · {l.resource_type}/
          {l.resource_id.slice(0, 12)} ·{" "}
          <span className="text-warmgray-400">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}
