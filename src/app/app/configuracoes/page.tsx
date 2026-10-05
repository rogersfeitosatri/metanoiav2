"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { RoutineSettings } from "@/components/RoutineSettings";
export default function ConfiguracoesPage() {
  const store = useStore();
  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Configurações</h1>
        <p className="mt-1 text-warmgray-600">
          Tua rotina pode mudar. O Metanóia se ajusta junto.
        </p>
      </header>
      <RoutineSettings />
      <section className="space-y-2 border-t border-warmgray-200 pt-5">
        <Link
          href="/app/privacidade"
          className="block py-2 font-medium text-sage-700"
        >
          Privacidade e uso dos dados
        </Link>
        <button
          className="py-2 text-left font-medium text-warmgray-600"
          onClick={async () => {
            await store.logout();
            window.location.replace("/");
          }}
        >
          Sair da conta
        </button>
      </section>
    </div>
  );
}
