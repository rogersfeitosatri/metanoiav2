"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

export default function Home() {
  const store = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!store.ready || !store.currentProfile) return;
    redirectFor(store.currentProfile.role, store.currentProfile.onboarding_completed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready, store.currentProfile]);

  function redirectFor(role: Role, onboarded: boolean) {
    if (role === "professional") router.push("/pro");
    else if (role === "admin") router.push("/admin");
    else router.push(onboarded ? "/app/hoje" : "/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sage-100 text-3xl">
          🌱
        </div>
        <h1 className="text-3xl font-semibold text-sage-800">Metanóia</h1>
        <p className="mt-3 leading-relaxed text-warmgray-600">
          Um assistente para transformar tua relação com a alimentação. Aqui não há dietas,
          contagem de calorias nem julgamento — só apoio para os momentos mais difíceis.
        </p>
      </header>

      {store.mode === "supabase" ? <AuthForm /> : <DemoEntry />}

      <p className="text-center text-xs leading-relaxed text-warmgray-400">
        O Metanóia não substitui atendimento profissional de saúde.
      </p>
    </main>
  );
}

function AuthForm() {
  const store = useStore();
  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (tab === "in") {
      const { error } = await store.signIn(email.trim(), password);
      if (error) setMsg(error);
    } else {
      const { error } = await store.signUp(email.trim(), password, name.trim() || email.split("@")[0]);
      if (error) setMsg(error);
      else setMsg("Conta criada! Se pedir confirmação, verifica teu e-mail. Depois é só entrar.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex rounded-xl bg-warmgray-100 p-1 text-sm">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 font-medium ${tab === "in" ? "bg-white text-sage-800 shadow-soft" : "text-warmgray-500"}`}
          onClick={() => setTab("in")}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 font-medium ${tab === "up" ? "bg-white text-sage-800 shadow-soft" : "text-warmgray-500"}`}
          onClick={() => setTab("up")}
        >
          Criar conta
        </button>
      </div>

      {tab === "up" && (
        <input
          className="input"
          placeholder="Como tu prefere ser chamado?"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        className="input"
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <input
        className="input"
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete={tab === "in" ? "current-password" : "new-password"}
      />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Aguarde…" : tab === "in" ? "Entrar" : "Criar minha conta"}
      </button>
      {msg && <p className="rounded-xl bg-sand-100 p-3 text-sm text-warmgray-700">{msg}</p>}
    </form>
  );
}

function DemoEntry() {
  const store = useStore();
  const router = useRouter();

  function enter(role: Role) {
    store.login(role);
    setTimeout(() => {
      if (role === "professional") router.push("/pro");
      else if (role === "admin") router.push("/admin");
      else {
        const p = store.db.profiles.find((x) => x.role === "user");
        router.push(p?.onboarding_completed ? "/app/hoje" : "/onboarding");
      }
    }, 30);
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-medium text-warmgray-500">
        Entrar na demonstração como:
      </p>
      <button className="btn-primary w-full" onClick={() => enter("user")}>
        Usuário — Mariana
      </button>
      <button className="btn-secondary w-full" onClick={() => enter("professional")}>
        Profissional — Dra. Laura Mendes
      </button>
      <button className="btn-ghost w-full" onClick={() => enter("admin")}>
        Administrador
      </button>
      <p className="text-center text-xs text-warmgray-400">
        Ambiente de demonstração. Os dados ficam apenas neste navegador.
      </p>
    </div>
  );
}
