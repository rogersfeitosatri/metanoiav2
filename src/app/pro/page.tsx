"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useProfessionalId } from "@/components/PanelShell";
import { Card, EmptyState } from "@/components/ui";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "alerts", label: "Com alertas" },
  { id: "no_records", label: "Sem registros recentes" },
  { id: "loss", label: "Perda de controle" },
  { id: "compensation", label: "Compensação" },
  { id: "anxiety", label: "Ansiedade frequente" },
  { id: "low", label: "Baixa consistência" },
  { id: "improved", label: "Melhora recente" },
];

export default function ProUserListPage() {
  const store = useStore();
  const proId = useProfessionalId();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const users = proId ? store.usersOfProfessional(proId) : [];

  const rows = useMemo(() => {
    return users.map((u) => {
      const checkins = store.db.meal_checkins.filter((c) => c.user_id === u.id);
      const difficulties = store.db.difficulty_events.filter((d) => d.user_id === u.id);
      const alerts = store.db.risk_flags.filter(
        (r) => r.user_id === u.id && (r.status === "open" || r.status === "viewed")
      );
      const consistency = store.consistencyFor(u.id);
      const patterns = store.patternsFor(u.id);
      const lastCheckin = checkins
        .map((c) => new Date(c.occurred_at).getTime())
        .sort((a, b) => b - a)[0];
      const daysSince = lastCheckin ? (Date.now() - lastCheckin) / 86400000 : Infinity;
      const attention =
        alerts.some((a) => a.severity === "high")
          ? "alta"
          : alerts.length > 0 || consistency.score < 45
            ? "média"
            : "baixa";
      return { u, checkins, difficulties, alerts, consistency, patterns, daysSince, attention };
    });
  }, [users, store]);

  const filtered = rows.filter((r) => {
    if (search && !r.u.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    switch (filter) {
      case "alerts":
        return r.alerts.length > 0;
      case "no_records":
        return r.daysSince > 3;
      case "loss":
        return r.alerts.some((a) => a.category === "perda_controle");
      case "compensation":
        return r.alerts.some((a) => ["compensacao", "vomito", "laxante"].includes(a.category));
      case "anxiety":
        return r.patterns.frequentEmotions.some((e) => /ansiedade/i.test(e.label));
      case "low":
        return r.consistency.score < 45;
      case "improved":
        return r.consistency.trend === "up";
      default:
        return true;
    }
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-warmgray-800">Meus usuários</h1>
        <p className="text-warmgray-500">Acompanhe quem está vinculado à tua conta.</p>
      </div>

      <div className="flex flex-col gap-3">
        <input
          className="input max-w-sm"
          placeholder="Buscar por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip ${filter === f.id ? "chip-selected" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>Nenhum usuário encontrado com esse filtro.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => (
            <Link key={r.u.id} href={`/pro/usuarios/${r.u.id}`}>
              <Card className="transition-colors hover:border-sage-200">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-100 font-semibold text-sage-700">
                    {initials(r.u.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-warmgray-800">{r.u.full_name}</p>
                      {r.alerts.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          {r.alerts.length} alerta(s)
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-warmgray-500">
                      {r.patterns.frequentTriggers[0]?.label || "Sem dificuldades recentes"} ·{" "}
                      {r.daysSince === Infinity
                        ? "sem registros"
                        : `último registro há ${Math.round(r.daysSince)}d`}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <AttentionBadge level={r.attention} />
                    <p className="mt-1 text-xs text-warmgray-400">
                      {r.consistency.trend === "up" ? "↑ melhora" : r.consistency.trend === "down" ? "↓ atenção" : "→ estável"}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    alta: "bg-amber-100 text-amber-800",
    média: "bg-sand-200 text-warmgray-700",
    baixa: "bg-sage-100 text-sage-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[level]}`}>Atenção {level}</span>;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
