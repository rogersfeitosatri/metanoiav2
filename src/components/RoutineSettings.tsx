"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  Bell,
  BellOff,
  Save,
  X,
  Copy,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  defaultPreferences,
  PreferencesSchema,
  RoutineSchema,
} from "@/lib/support";
import { enablePushDevice, disablePushDevice } from "@/lib/support-client";
import type { MealSchedule, NotificationPreferences } from "@/lib/types";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function Days({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map((day, n) => (
        <label
          key={day}
          className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded border py-2 text-xs ${value.includes(n) ? "border-sage-500 bg-sage-50" : "border-warmgray-200"}`}
        >
          <input
            aria-label={day}
            type="checkbox"
            checked={value.includes(n)}
            onChange={() =>
              onChange(
                value.includes(n)
                  ? value.filter((x) => x !== n)
                  : [...value, n].sort(),
              )
            }
          />
          {day}
        </label>
      ))}
    </div>
  );
}
const blank = () =>
  RoutineSchema.parse({
    name: "Refeição",
    time_of_day: "12:00",
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
  });
function normalPrefs(p: NotificationPreferences) {
  return PreferencesSchema.parse({
    ...p,
    push_enabled: p.push_enabled ?? false,
    followup_enabled: p.followup_enabled ?? true,
    maximum_daily_notifications: Math.min(
      4,
      Math.max(1, p.maximum_daily_notifications),
    ),
    allowed_start_time: p.allowed_start_time.slice(0, 5),
    allowed_end_time: p.allowed_end_time.slice(0, 5),
  });
}
export function RoutineSettings() {
  const store = useStore(),
    userId = store.currentUserId!;
  const [editing, setEditing] = useState<ReturnType<
    typeof RoutineSchema.parse
  > | null>(null);
  const [prefs, setPrefs] = useState(() =>
    normalPrefs(
      store.db.notification_preferences.find((p) => p.user_id === userId) ||
        defaultPreferences(userId),
    ),
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [permission, setPermission] = useState("Verificando");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  useEffect(() => {
    if (store.mode === "demo") return;
    let cancelled = false;
    void fetch("/api/support")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setPublicKey(data?.publicKey || null);
      })
      .catch(() => {
        if (!cancelled) setPublicKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [store.mode]);
  useEffect(() => {
    setPermission(
      !("Notification" in window)
        ? "Não disponível neste navegador"
        : Notification.permission === "granted"
          ? "Permitida no navegador"
          : Notification.permission === "denied"
            ? "Bloqueada no navegador"
            : "Ainda não autorizada",
    );
  }, [message, error]);
  const meals = store.db.meal_schedules
    .filter((m) => m.user_id === userId)
    .sort((a, b) => a.time_of_day.localeCompare(b.time_of_day));
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  }
  function edit(meal: MealSchedule) {
    setEditing(
      RoutineSchema.parse({
        ...meal,
        time_of_day: meal.time_of_day.slice(0, 5),
      }),
    );
  }
  return (
    <>
      <section className="border-t border-warmgray-200 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-warmgray-800">
            Rotina de refeições
          </h2>
          <button
            type="button"
            title="Adicionar refeição"
            aria-label="Adicionar refeição"
            className="btn-secondary p-3"
            onClick={() => setEditing(blank())}
          >
            <Plus size={18} />
          </button>
        </div>
        {!meals.length && (
          <p className="py-5 text-sm text-warmgray-500">
            Sem horários combinados. A rotina é opcional.
          </p>
        )}
        <div className="divide-y divide-warmgray-100">
          {meals.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium text-warmgray-800">
                  {m.name}
                  {!m.active ? " · Pausada" : ""}
                </p>
                <p className="text-sm text-warmgray-500">
                  {m.time_of_day.slice(0, 5)} ·{" "}
                  {m.days_of_week.length === 7
                    ? "Todos os dias"
                    : m.days_of_week.map((d) => DAYS[d]).join(", ")}
                </p>
                <p className="text-xs text-warmgray-500">
                  {!m.reminder_enabled ||
                  !m.support_mode ||
                  m.support_mode === "none"
                    ? "Sem convite"
                    : `${m.support_mode === "before" ? "Preparar" : "Conversar depois"} · ${m.support_offset_minutes ?? 30} min ${m.support_mode === "before" ? "antes" : "depois"}`}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="p-2 text-sage-700"
                  title="Editar refeição"
                  aria-label={`Editar ${m.name}`}
                  onClick={() => edit(m)}
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className="p-2 text-sage-700"
                  title="Outro horário para outros dias"
                  aria-label={`Copiar ${m.name} para outros dias`}
                  onClick={() =>
                    setEditing(
                      RoutineSchema.parse({
                        ...m,
                        id: undefined,
                        time_of_day: m.time_of_day.slice(0, 5),
                        days_of_week:
                          m.days_of_week.length < 7
                            ? DAYS.map((_, n) => n).filter(
                                (n) => !m.days_of_week.includes(n),
                              )
                            : [0, 6],
                      }),
                    )
                  }
                >
                  <Copy size={18} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="p-2 text-warmgray-600"
                  title={m.active ? "Pausar" : "Retomar"}
                  aria-label={`${m.active ? "Pausar" : "Retomar"} ${m.name}`}
                  onClick={() =>
                    void run(
                      () =>
                        store.manageSupport({
                          action: "meal",
                          value: {
                            ...m,
                            time_of_day: m.time_of_day.slice(0, 5),
                            active: !m.active,
                          },
                        }),
                      "Rotina atualizada.",
                    )
                  }
                >
                  {m.active ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="p-2 text-warmgray-600"
                  title="Excluir horário"
                  aria-label={`Excluir ${m.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Excluir o horário de ${m.name}? Os registros anteriores serão mantidos.`,
                      )
                    )
                      void run(
                        () =>
                          store.manageSupport({
                            action: "delete_meal",
                            id: m.id,
                          }),
                        "Horário excluído.",
                      );
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {editing && (
          <form
            className="mt-4 space-y-4 border-y border-warmgray-200 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await store.manageSupport({
                  action: "meal",
                  value: {
                    ...editing,
                    reminder_enabled: editing.support_mode !== "none",
                  },
                });
                setEditing(null);
              }, "Rotina salva.");
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {editing.id ? "Editar horário" : "Novo horário"}
              </h3>
              <button
                type="button"
                title="Fechar edição"
                aria-label="Fechar edição"
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
            </div>
            <label className="label">
              Refeição
              <input
                required
                maxLength={80}
                className="input mt-1"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label className="label">
              Horário habitual
              <input
                type="time"
                required
                className="input mt-1"
                value={editing.time_of_day}
                onChange={(e) =>
                  setEditing({ ...editing, time_of_day: e.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-4 text-sm">
              <button
                type="button"
                className="text-sage-700 underline"
                onClick={() =>
                  setEditing({ ...editing, days_of_week: [1, 2, 3, 4, 5] })
                }
              >
                Dias úteis
              </button>
              <button
                type="button"
                className="text-sage-700 underline"
                onClick={() => setEditing({ ...editing, days_of_week: [0, 6] })}
              >
                Fim de semana
              </button>
            </div>
            <Days
              value={editing.days_of_week}
              onChange={(days) =>
                setEditing({ ...editing, days_of_week: days })
              }
            />
            <label className="label">
              Convite de apoio
              <select
                className="input mt-1"
                value={editing.support_mode}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    support_mode: e.target.value as "none" | "before" | "after",
                  })
                }
              >
                <option value="none">Sem convite</option>
                <option value="before">Preparação antes</option>
                <option value="after">Conversa depois</option>
              </select>
            </label>
            {editing.support_mode !== "none" && (
              <label className="label">
                Minutos {editing.support_mode === "before" ? "antes" : "depois"}
                <input
                  type="number"
                  min={5}
                  max={180}
                  step={5}
                  className="input mt-1"
                  value={editing.support_offset_minutes}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      support_offset_minutes: Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
            <button
              className="btn-primary flex items-center gap-2"
              disabled={busy || !editing.days_of_week.length}
            >
              <Save size={16} />
              Salvar horário
            </button>
          </form>
        )}
      </section>
      <section className="space-y-4 border-t border-warmgray-200 pt-5">
        <h2 className="font-semibold text-warmgray-800">
          Apoios e notificações
        </h2>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                store.manageSupport({ action: "preferences", value: prefs }),
              "Preferências salvas.",
            );
          }}
        >
          {(
            [
              ["enabled", "Receber convites de apoio"],
              ["preventive_enabled", "Preparação para situações"],
              ["checkin_enabled", "Conversas depois das refeições"],
              ["followup_enabled", "Retomar experimentos combinados"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) =>
                  setPrefs({ ...prefs, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
          <div>
            <p className="label mb-2">Dias permitidos</p>
            <Days
              value={prefs.allowed_days}
              onChange={(days) => setPrefs({ ...prefs, allowed_days: days })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="label">
              A partir de
              <input
                className="input mt-1"
                type="time"
                value={prefs.allowed_start_time}
                onChange={(e) =>
                  setPrefs({ ...prefs, allowed_start_time: e.target.value })
                }
              />
            </label>
            <label className="label">
              Até
              <input
                className="input mt-1"
                type="time"
                value={prefs.allowed_end_time}
                onChange={(e) =>
                  setPrefs({ ...prefs, allowed_end_time: e.target.value })
                }
              />
            </label>
          </div>
          <label className="label">
            Fuso horário
            <input
              className="input mt-1"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            />
          </label>
          <label className="label">
            Máximo de notificações por dia
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={4}
              value={prefs.maximum_daily_notifications}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  maximum_daily_notifications: Number(e.target.value),
                })
              }
            />
          </label>
          <button
            className="btn-secondary flex items-center gap-2"
            disabled={busy || !prefs.allowed_days.length}
          >
            <Save size={16} />
            Salvar preferências
          </button>
        </form>
        {store.mode === "demo" ? (
          <p className="text-sm text-warmgray-500">
            Demonstração: convites apenas dentro do app. Nenhum envio ao
            aparelho.
          </p>
        ) : (
          <div className="space-y-3 border-t border-warmgray-100 pt-4">
            <p className="text-sm text-warmgray-600">
              {prefs.push_enabled
                ? "Envio autorizado na conta. O aparelho precisa estar ativado."
                : "Notificações no aparelho desativadas."}
            </p>
            <p className="text-sm text-warmgray-600">
              Permissão do aparelho: {permission}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || !publicKey}
                className="btn-secondary flex items-center gap-2"
                onClick={() =>
                  void run(async () => {
                    await enablePushDevice(publicKey!);
                    const next = { ...prefs, push_enabled: true };
                    await store.manageSupport({
                      action: "preferences",
                      value: next,
                    });
                    setPrefs(next);
                  }, "Este aparelho foi ativado. Ele será usado para os próximos convites.")
                }
              >
                <Bell size={16} />
                Ativar neste aparelho
              </button>
              <button
                disabled={busy}
                className="btn-secondary flex items-center gap-2"
                onClick={() =>
                  void run(async () => {
                    await disablePushDevice();
                    const next = { ...prefs, push_enabled: false };
                    await store.manageSupport({
                      action: "preferences",
                      value: next,
                    });
                    setPrefs(next);
                  }, "Notificações desativadas.")
                }
              >
                <BellOff size={16} />
                Desativar
              </button>
            </div>
            {!publicKey && (
              <p className="text-sm text-warmgray-500">
                Ativação indisponível agora. Os convites continuam dentro do
                app.
              </p>
            )}
            <p className="text-xs text-warmgray-500">
              O envio usa o último aparelho ativado. A autorização do navegador
              é separada e pode ser revogada a qualquer momento.
            </p>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-sage-700">
          {message}
        </p>
      )}
    </>
  );
}
