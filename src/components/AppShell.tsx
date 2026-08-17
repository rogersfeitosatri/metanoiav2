"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/app/hoje", label: "Conversa", short: "C" },
  { href: "/app/aprendizados", label: "Aprendizados", short: "A" },
  { href: "/app/norte", label: "Meu Norte", short: "N" },
  { href: "/app/evolucao", label: "Evolução", short: "E" },
  { href: "/app/configuracoes", label: "Ajustes", short: "J" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const pathname = usePathname();
  const router = useRouter();

  // Guarda de autenticação: exige sessão de usuário e onboarding concluído.
  useEffect(() => {
    if (!store.ready) return;
    if (!store.currentProfile) {
      router.replace("/");
    } else if (store.currentProfile.role !== "user") {
      router.replace(store.currentProfile.role === "professional" ? "/pro" : "/admin");
    } else if (!store.currentProfile.onboarding_completed) {
      router.replace("/onboarding");
    }
  }, [store.ready, store.currentProfile, router]);

  if (!store.ready || !store.currentProfile || store.currentProfile.role !== "user") {
    return <div className="p-8 text-center text-warmgray-400">Carregando…</div>;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl md:gap-6 md:px-6">
      {/* Navegação lateral (desktop) */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 py-8 md:flex">
        <div className="mb-6 px-3"><span className="text-lg font-semibold text-sage-800">Metanóia</span><p className="text-xs text-warmgray-500">Acompanhamento</p></div>
        {NAV.map((item) => (
          <NavItem key={item.href} item={item} active={pathname === item.href} desktop />
        ))}
      </aside>

      {/* Conteúdo */}
      <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-0 md:pb-6 md:pt-6">{children}</main>

      {/* Navegação inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-warmgray-100 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-1 py-2">
          {NAV.map((item) => (
            <NavItem key={item.href} item={item} active={pathname === item.href} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  item,
  active,
  desktop,
}: {
  item: { href: string; label: string; short: string };
  active: boolean;
  desktop?: boolean;
}) {
  if (desktop) {
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${
          active ? "bg-sage-100 text-sage-800" : "text-warmgray-600 hover:bg-warmgray-100"
        }`}
      >
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-md border border-current text-xs">{item.short}</span>
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      className={`flex min-w-0 flex-col items-center gap-1 py-1 ${
        active ? "text-sage-700" : "text-warmgray-500"
      }`}
    >
      <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-semibold ${active ? "border-sage-600 bg-sage-100" : "border-warmgray-300"}`}>{item.short}</span>
      <span className="max-w-full truncate text-[10px] font-medium">{item.label}</span>
    </Link>
  );
}
