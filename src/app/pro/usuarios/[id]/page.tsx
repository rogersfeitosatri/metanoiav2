"use client";

import { use, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useProfessionalId, BackLink } from "@/components/PanelShell";
import { Card, SectionTitle, StatusBadge, EmptyState } from "@/components/ui";
import {
  MEAL_LABELS,
  RISK_CATEGORY_LABELS,
  CONVERSATION_TYPE_LABELS,
  TRIAL_RESULT_LABELS,
  STRATEGY_CATEGORY_LABELS,
  LIFE_IMPACT_DIMENSIONS,
} from "@/lib/labels";
import { useAiReport } from "@/lib/useAiReport";
import type { RiskStatus, StrategyCategory } from "@/lib/types";

const TABS = [
  "Visão geral",
  "Conversas",
  "Registros",
  "Padrões",
  "Estratégias",
  "Meu Norte",
  "Relatórios",
  "Alertas",
] as const;
type Tab = (typeof TABS)[number];

export default function ProUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const store = useStore();
  const proId = useProfessionalId();
  const [tab, setTab] = useState<Tab>("Visão geral");

  const user = store.db.profiles.find((p) => p.id === id);

  // Registra auditoria de acesso ao perfil (seção 27).
  useEffect(() => {
    if (user) store.logAudit("view_user_profile", "user", id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!user) return <EmptyState>Usuário não encontrado.</EmptyState>;

  return (
    <div className="space-y-4">
      <BackLink href="/pro">Voltar para a lista</BackLink>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 text-lg font-semibold text-sage-700">
          {user.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-warmgray-800">{user.full_name}</h1>
          <p className="text-sm text-warmgray-500">{user.email}</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-warmgray-100 pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-sage-500 text-sage-700"
                : "text-warmgray-500 hover:text-warmgray-800"
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {tab === "Visão geral" && <Overview userId={id} />}
        {tab === "Conversas" && <Conversations userId={id} proId={proId} />}
        {tab === "Registros" && <Records userId={id} />}
        {tab === "Padrões" && <Patterns userId={id} />}
        {tab === "Estratégias" && <Strategies userId={id} proId={proId} />}
        {tab === "Meu Norte" && <CopingCardTab userId={id} />}
        {tab === "Relatórios" && <Reports userId={id} />}
        {tab === "Alertas" && <Alerts userId={id} proId={proId} />}
      </div>
    </div>
  );
}

function Overview({ userId }: { userId: string }) {
  const store = useStore();
  const patterns = store.patternsFor(userId);
  const consistency = store.consistencyFor(userId);
  const alerts = store.db.risk_flags.filter((r) => r.user_id === userId && r.status !== "resolved");
  const goal = store.db.behavioral_goals.find((g) => g.user_id === userId && g.active);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <SectionTitle>Resumo</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-warmgray-600">
          {store.weeklyReportFor(userId).professional_summary || "Sem dados suficientes ainda."}
        </p>
        {goal && (
          <p className="mt-3 rounded-xl bg-sage-50 p-3 text-sm text-sage-800">
            <strong>Objetivo:</strong> {goal.description}
          </p>
        )}
      </Card>
      <Card>
        <SectionTitle>Índice de consistência (interno)</SectionTitle>
        <div className="mt-2 text-3xl font-semibold text-sage-700">{consistency.score}</div>
        <p className="text-sm text-warmgray-500">
          Tendência: {consistency.trend === "up" ? "melhora" : consistency.trend === "down" ? "atenção" : "estável"}
        </p>
        <div className="mt-3 space-y-1 text-xs text-warmgray-600">
          {Object.entries(consistency.components).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="capitalize">{k.replace("_", " ")}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Horários críticos</SectionTitle>
        <p className="mt-1 text-warmgray-700">
          {patterns.hardestTimeWindow
            ? `${patterns.hardestTimeWindow.label} (${patterns.hardestTimeWindow.count} eventos)`
            : "Sem padrão claro ainda."}
        </p>
        <p className="mt-1 text-sm text-warmgray-500">
          Tempo médio de retomada:{" "}
          {patterns.averageRecoveryDays !== null ? `${patterns.averageRecoveryDays} dia(s)` : "—"}
        </p>
      </Card>
      <Card>
        <SectionTitle>Alertas ativos</SectionTitle>
        {alerts.length === 0 ? (
          <p className="mt-1 text-warmgray-500">Nenhum alerta ativo neste momento.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-warmgray-700">
            {alerts.map((a) => (
              <li key={a.id}>• {RISK_CATEGORY_LABELS[a.category]} ({a.severity})</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Conversations({ userId, proId }: { userId: string; proId: string | null }) {
  const store = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const conversations = store.db.conversations
    .filter((c) => c.user_id === userId)
    .filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()) || (c.summary || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const openConv = conversations.find((c) => c.id === openId);
  const messages = openConv
    ? store.db.conversation_messages
        .filter((m) => m.conversation_id === openConv.id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];
  const notes = openConv
    ? store.db.professional_notes.filter((n) => n.conversation_id === openConv.id)
    : [];

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <div className="space-y-2">
        <input className="input" placeholder="Buscar por palavra…" value={q} onChange={(e) => setQ(e.target.value)} />
        {conversations.length === 0 && <EmptyState>Sem conversas.</EmptyState>}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setOpenId(c.id);
              if (proId) store.logAudit("view_conversation", "conversation", c.id, { user_id: userId });
            }}
            className={`w-full rounded-xl border p-3 text-left text-sm ${
              openId === c.id ? "border-sage-300 bg-sage-50" : "border-warmgray-100 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-warmgray-800">{c.title}</span>
              {c.risk_level !== "none" && (
                <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">{c.risk_level}</span>
              )}
            </div>
            <span className="text-xs text-warmgray-500">
              {CONVERSATION_TYPE_LABELS[c.type]} · {new Date(c.started_at).toLocaleDateString("pt-BR")}
            </span>
          </button>
        ))}
      </div>

      <div>
        {!openConv ? (
          <EmptyState>Seleciona uma conversa para ver o histórico completo.</EmptyState>
        ) : (
          <Card>
            <div className="mb-3 space-y-3">
              {messages
                .filter((m) => m.sender_type !== "system")
                .map((m) => {
                  const isUser = m.sender_type === "user";
                  return (
                    <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          isUser ? "bg-sage-500 text-white" : "bg-warmgray-100 text-warmgray-800"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })}
            </div>
            {openConv.summary && (
              <p className="rounded-xl bg-warmgray-50 p-3 text-sm text-warmgray-600">{openConv.summary}</p>
            )}
            <div className="mt-4 border-t border-warmgray-100 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-warmgray-500">
                Nota profissional (privada)
              </p>
              {notes.map((n) => (
                <p key={n.id} className="mt-2 rounded-xl bg-teal-50 p-2 text-sm text-teal-900">
                  {n.content}
                </p>
              ))}
              <div className="mt-2 flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Adicionar nota (não aparece para o usuário)…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  className="btn-secondary"
                  disabled={!note.trim() || !proId}
                  onClick={() => {
                    if (!proId) return;
                    store.addProfessionalNote({
                      professional_id: proId,
                      user_id: userId,
                      conversation_id: openConv.id,
                      content: note.trim(),
                    });
                    setNote("");
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Records({ userId }: { userId: string }) {
  const store = useStore();
  const checkins = store.db.meal_checkins
    .filter((c) => c.user_id === userId)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  if (checkins.length === 0) return <EmptyState>Nenhum registro ainda.</EmptyState>;
  return (
    <div className="space-y-2">
      {checkins.map((c) => (
        <Card key={c.id} className="flex items-center justify-between py-3">
          <div>
            <p className="font-medium text-warmgray-800">
              {c.meal_type ? MEAL_LABELS[c.meal_type] : "Refeição / estratégia"}
            </p>
            <p className="text-sm text-warmgray-500">
              {new Date(c.occurred_at).toLocaleString("pt-BR")}
              {c.note ? ` · ${c.note}` : ""}
            </p>
          </div>
          <StatusBadge status={c.status} />
        </Card>
      ))}
    </div>
  );
}

function Patterns({ userId }: { userId: string }) {
  const store = useStore();
  const p = store.patternsFor(userId);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <SectionTitle>Horários e dias</SectionTitle>
        <p className="mt-1 text-sm text-warmgray-700">
          Janela crítica: {p.hardestTimeWindow?.label || "—"} · Dia mais difícil:{" "}
          {p.hardestWeekday?.label || "—"}
        </p>
      </Card>
      <Card>
        <SectionTitle>Gatilhos</SectionTitle>
        <ul className="mt-1 text-sm text-warmgray-700">
          {p.frequentTriggers.map((t) => (
            <li key={t.label}>• {t.label} ({t.count}x)</li>
          ))}
        </ul>
      </Card>
      <Card>
        <SectionTitle>Pensamentos</SectionTitle>
        <ul className="mt-1 text-sm text-warmgray-700">
          {p.recurringThoughts.map((t) => (
            <li key={t.label}>• "{t.label}" ({t.count}x)</li>
          ))}
        </ul>
      </Card>
      <Card>
        <SectionTitle>Emoções</SectionTitle>
        <ul className="mt-1 text-sm text-warmgray-700">
          {p.frequentEmotions.map((t) => (
            <li key={t.label}>• {t.label} ({t.count}x)</li>
          ))}
        </ul>
      </Card>
      <Card className="md:col-span-2">
        <SectionTitle>Estratégias mais eficazes</SectionTitle>
        <ul className="mt-1 text-sm text-warmgray-700">
          {p.helpfulStrategies.length === 0 && <li className="text-warmgray-400">Sem dados.</li>}
          {p.helpfulStrategies.map((s) => (
            <li key={s.label}>
              • {s.label} — ajudou {s.helped}/{s.tested}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Strategies({ userId, proId }: { userId: string; proId: string | null }) {
  const store = useStore();
  const trials = store.db.strategy_trials
    .filter((t) => t.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<StrategyCategory>("planejamento");

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Recomendar uma estratégia</SectionTitle>
        <div className="mt-3 space-y-2">
          <input className="input" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input
            className="input"
            placeholder="Descrição"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <select
            className="input"
            value={cat}
            onChange={(e) => setCat(e.target.value as StrategyCategory)}
          >
            {Object.entries(STRATEGY_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={!title.trim() || !proId}
            onClick={() => {
              if (!proId) return;
              const strat = store.createStrategy({
                title: title.trim(),
                description: desc.trim(),
                category: cat,
                source_type: "professional",
                professional_id: proId,
              });
              store.addStrategyTrial({
                user_id: userId,
                strategy_id: strat.id,
                title_snapshot: strat.title,
                result: "not_tested",
              });
              setTitle("");
              setDesc("");
            }}
          >
            Recomendar
          </button>
        </div>
      </Card>

      {trials.length === 0 ? (
        <EmptyState>Nenhuma estratégia testada até agora.</EmptyState>
      ) : (
        <div className="space-y-2">
          {trials.map((t) => (
            <Card key={t.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-warmgray-800">{t.title_snapshot}</p>
                <p className="text-sm text-warmgray-500">
                  {t.tested_at ? `Testada em ${new Date(t.tested_at).toLocaleDateString("pt-BR")}` : "Ainda não testada"}
                  {t.user_feedback ? ` · "${t.user_feedback}"` : ""}
                </p>
              </div>
              <span className="rounded-full bg-warmgray-100 px-3 py-1 text-xs text-warmgray-700">
                {TRIAL_RESULT_LABELS[t.result]}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CopingCardTab({ userId }: { userId: string }) {
  const store = useStore();
  const card = store.db.coping_cards.find((c) => c.user_id === userId);
  if (!card) return <EmptyState>O usuário ainda não começou o Cartão de Enfrentamento.</EmptyState>;
  const impacts = card.life_impacts || {};
  const filledImpacts = LIFE_IMPACT_DIMENSIONS.filter((d) => impacts[d.key]?.trim());
  const rows: [string, string | string[] | undefined][] = [
    ["Quem está construindo", card.desired_identity],
    ["Principal objetivo", card.main_goal],
    ["Pensamentos que afastam", card.sabotaging_thoughts],
    ["O que quer lembrar", card.reminder_statement],
    ["Compromisso", card.personal_commitment],
  ];
  return (
    <div className="space-y-3">
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-sage-600">
          Impacto de seguir o plano — por área de vida
        </p>
        {filledImpacts.length === 0 ? (
          <p className="mt-1 text-warmgray-400">Ainda não preenchido.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {filledImpacts.map((d) => (
              <div key={d.key} className="rounded-xl bg-sand-50 p-3">
                <p className="text-sm font-medium text-warmgray-800">
                  {d.icon} {d.label}
                </p>
                <p className="text-sm text-warmgray-600">{impacts[d.key]}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      {rows.map(([label, value]) => (
        <Card key={label}>
          <p className="text-xs font-medium uppercase tracking-wide text-sage-600">{label}</p>
          <div className="mt-1 text-warmgray-700">
            {Array.isArray(value) ? (
              value.length ? (
                <ul>{value.map((v, i) => <li key={i}>• {v}</li>)}</ul>
              ) : (
                <span className="text-warmgray-400">—</span>
              )
            ) : (
              value || <span className="text-warmgray-400">—</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Reports({ userId }: { userId: string }) {
  const { report, source } = useAiReport(userId);
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Relatório semanal</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-warmgray-700">{report.user_summary}</p>
        <div className="mt-3 grid gap-2 text-sm text-warmgray-600 md:grid-cols-2">
          <ReportList title="Momentos mais difíceis" items={report.hardest_moments} />
          <ReportList title="Gatilhos frequentes" items={report.frequent_triggers} />
          <ReportList title="Pensamentos recorrentes" items={report.recurring_thoughts} />
          <ReportList title="Emoções predominantes" items={report.predominant_emotions} />
          <ReportList title="Estratégias úteis" items={report.helpful_strategies} />
        </div>
        <p className="mt-3 rounded-xl bg-sand-50 p-3 text-sm text-warmgray-700">
          <strong>Próximo experimento:</strong> {report.next_experiment}
        </p>
        <button className="btn-secondary mt-3" onClick={() => window.print()}>
          Exportar / imprimir
        </button>
      </Card>
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-warmgray-700">{title}</p>
      {items.length ? (
        <ul>{items.map((i) => <li key={i}>• {i}</li>)}</ul>
      ) : (
        <span className="text-warmgray-400">—</span>
      )}
    </div>
  );
}

function Alerts({ userId, proId }: { userId: string; proId: string | null }) {
  const store = useStore();
  const alerts = store.db.risk_flags
    .filter((r) => r.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (alerts.length === 0) return <EmptyState>Nenhum alerta ativo neste momento.</EmptyState>;

  const statusOptions: RiskStatus[] = ["open", "viewed", "in_followup", "resolved", "false_positive"];
  const statusLabels: Record<RiskStatus, string> = {
    open: "Aberto",
    viewed: "Visualizado",
    in_followup: "Em acompanhamento",
    resolved: "Resolvido",
    false_positive: "Falso positivo",
  };

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <Card key={a.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-warmgray-800">
                {RISK_CATEGORY_LABELS[a.category]}{" "}
                <span className="text-xs text-warmgray-400">({a.severity})</span>
              </p>
              <p className="text-sm text-warmgray-500">{a.evidence}</p>
              <p className="text-xs text-warmgray-400">
                {new Date(a.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <select
              className="rounded-lg border border-warmgray-200 px-2 py-1 text-sm"
              value={a.status}
              onChange={(e) => {
                store.updateRiskFlag(a.id, {
                  status: e.target.value as RiskStatus,
                  reviewed_by: proId,
                  reviewed_at: new Date().toISOString(),
                });
              }}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}
