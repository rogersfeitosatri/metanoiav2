"use client";

import { useState } from "react";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDate(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return inputDate(date);
}

function profileDate(value: string | null | undefined, fallbackDays: number) {
  return value ? inputDate(new Date(value)) : defaultDate(fallbackDays);
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

export function PatientManagement() {
  const store = useStore();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessStartsOn, setAccessStartsOn] = useState(() => defaultDate(0));
  const [accessEndsOn, setAccessEndsOn] = useState(() => defaultDate(30));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const patients = store.db.profiles
    .filter((profile) => profile.role === "user")
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));

  async function createPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, accessStartsOn, accessEndsOn }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Nao foi possivel criar o paciente."));

      setFullName("");
      setEmail("");
      setPassword("");
      setAccessStartsOn(defaultDate(0));
      setAccessEndsOn(defaultDate(30));
      await store.refreshDatabase();
      setMessage({ kind: "success", text: "Paciente e login criados com sucesso." });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Nao foi possivel criar o paciente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Novo paciente</SectionTitle>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={createPatient}>
          <label className="md:col-span-2">
            <span className="label">Nome completo</span>
            <input
              className="input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </label>

          <label>
            <span className="label">E-mail de login</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              required
            />
          </label>

          <label>
            <span className="label">Senha temporaria</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
            <span className="mt-1 block text-xs text-warmgray-400">
              Minimo de 8 caracteres. A senha nao podera ser consultada depois.
            </span>
          </label>

          <label>
            <span className="label">Inicio do acesso</span>
            <input
              className="input"
              type="date"
              value={accessStartsOn}
              onChange={(event) => setAccessStartsOn(event.target.value)}
              required
            />
          </label>

          <label>
            <span className="label">Fim do acesso</span>
            <input
              className="input"
              type="date"
              value={accessEndsOn}
              min={accessStartsOn}
              onChange={(event) => setAccessEndsOn(event.target.value)}
              required
            />
          </label>

          {message && (
            <p
              className={`md:col-span-2 rounded-xl px-4 py-3 text-sm ${
                message.kind === "success"
                  ? "bg-sage-100 text-sage-800"
                  : "bg-rose-50 text-rose-700"
              }`}
              role={message.kind === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          )}

          <div className="md:col-span-2">
            <button className="btn-primary w-full md:w-auto" type="submit" disabled={submitting}>
              {submitting ? "Criando..." : "Criar paciente e login"}
            </button>
          </div>
        </form>
      </Card>

      <div>
        <SectionTitle>Pacientes cadastrados</SectionTitle>
        {patients.length === 0 ? (
          <EmptyState>Nenhum paciente cadastrado.</EmptyState>
        ) : (
          <div className="mt-3 space-y-3">
            {patients.map((patient) => (
              <PatientAccess key={patient.id} patient={patient} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function accessStatus(patient: Profile) {
  const now = Date.now();
  const startsAt = patient.access_starts_at ? new Date(patient.access_starts_at).getTime() : null;
  const endsAt = patient.access_ends_at ? new Date(patient.access_ends_at).getTime() : null;

  if (patient.access_enabled === false) return { label: "Pausado", style: "bg-warmgray-100 text-warmgray-600" };
  if (startsAt && startsAt > now) return { label: "Agendado", style: "bg-amber-100 text-amber-800" };
  if (endsAt && endsAt < now) return { label: "Encerrado", style: "bg-rose-50 text-rose-700" };
  return { label: "Ativo", style: "bg-sage-100 text-sage-800" };
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "sem limite";
}

function formatPeriod(patient: Profile) {
  if (!patient.access_starts_at && !patient.access_ends_at) return "Acesso sem prazo definido";
  return `${formatDate(patient.access_starts_at)} ate ${formatDate(patient.access_ends_at)}`;
}

function PatientAccess({ patient }: { patient: Profile }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [accessEnabled, setAccessEnabled] = useState(patient.access_enabled !== false);
  const [accessStartsOn, setAccessStartsOn] = useState(() => profileDate(patient.access_starts_at, 0));
  const [accessEndsOn, setAccessEndsOn] = useState(() => profileDate(patient.access_ends_at, 30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const status = accessStatus(patient);

  async function saveAccess() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/patients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, accessEnabled, accessStartsOn, accessEndsOn }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Nao foi possivel atualizar o acesso."));

      await store.refreshDatabase();
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel atualizar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-warmgray-800">{patient.full_name}</p>
          <p className="break-all text-sm text-warmgray-500">{patient.email}</p>
          <p className="mt-1 text-xs text-warmgray-400">{formatPeriod(patient)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.style}`}>{status.label}</span>
          <button className="btn-secondary px-3 py-2 text-sm" type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Cancelar" : "Gerenciar"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 grid gap-4 border-t border-warmgray-100 pt-4 md:grid-cols-3">
          <label>
            <span className="label">Inicio</span>
            <input className="input" type="date" value={accessStartsOn} onChange={(event) => setAccessStartsOn(event.target.value)} />
          </label>
          <label>
            <span className="label">Fim</span>
            <input className="input" type="date" value={accessEndsOn} min={accessStartsOn} onChange={(event) => setAccessEndsOn(event.target.value)} />
          </label>
          <label className="flex min-h-[70px] items-center gap-3 md:pt-7">
            <input
              className="h-5 w-5 accent-sage-600"
              type="checkbox"
              checked={accessEnabled}
              onChange={(event) => setAccessEnabled(event.target.checked)}
            />
            <span className="text-sm font-medium text-warmgray-700">Acesso liberado</span>
          </label>
          {error && <p className="md:col-span-3 text-sm text-rose-700" role="alert">{error}</p>}
          <div className="md:col-span-3">
            <button className="btn-primary w-full md:w-auto" type="button" onClick={saveAccess} disabled={saving}>
              {saving ? "Salvando..." : "Salvar acesso"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
