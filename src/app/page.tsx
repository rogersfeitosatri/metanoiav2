"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

export default function Home() {
  const store = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!store.ready) return;
    if (store.currentProfile) {
      redirectFor(store.currentProfile.role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready, store.currentProfile]);

  function redirectFor(role: Role) {
    if (role === "professional") router.push("/pro");
    else if (role === "admin") router.push("/admin");
    else {
      const p = store.db.profiles.find((x) => x.id === store.currentUserId);
      router.push(p?.onboarding_completed ? "/app/hoje" : "/onboarding");
    }
  }

  function enter(role: Role) {
    store.login(role);
    // Redireciona no próximo tick, quando a sessão estiver aplicada.
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
      </div>

      <p className="text-center text-xs leading-relaxed text-warmgray-400">
        Ambiente de demonstração. Os dados ficam apenas neste navegador. O Metanóia não
        substitui atendimento profissional de saúde.
      </p>
    </main>
  );
}
