"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/app/hoje", label: "Hoje", icon: "☀️" },
  { href: "/app/ajuda", label: "Ajuda", icon: "🆘", highlight: true },
  { href: "/app/registrar", label: "Registrar", icon: "📝" },
  { href: "/app/aprendizados", label: "Aprendizados", icon: "🌿" },
  { href: "/app/norte", label: "Meu Norte", icon: "🧭" },
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
        <div className="mb-6 flex items-center gap-2 px-3">
          <span className="text-2xl">🌱</span>
          <span className="text-lg font-semibold text-sage-800">Metanóia</span>
        </div>
        {NAV.map((item) => (
          <NavItem key={item.href} item={item} active={pathname === item.href} desktop />
        ))}
        <div className="mt-auto space-y-1 px-1 pt-6">
          <Link href="/app/conversas" className="block rounded-xl px-3 py-2 text-sm text-warmgray-500 hover:bg-warmgray-100">
            Conversas
          </Link>
          <Link href="/app/privacidade" className="block rounded-xl px-3 py-2 text-sm text-warmgray-500 hover:bg-warmgray-100">
            Privacidade
          </Link>
          <button
            onClick={() => {
              store.logout();
              router.replace("/");
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-warmgray-500 hover:bg-warmgray-100"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 px-4 pb-28 pt-6 md:px-0 md:pb-8">{children}</main>

      {/* Navegação inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-warmgray-100 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-end justify-around px-2 py-2">
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
  item: { href: string; label: string; icon: string; highlight?: boolean };
  active: boolean;
  desktop?: boolean;
}) {
  if (desktop) {
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${
          active ? "bg-sage-100 text-sage-800" : "text-warmgray-600 hover:bg-warmgray-100"
        } ${item.highlight ? "text-sage-700" : ""}`}
      >
        <span aria-hidden>{item.icon}</span>
        {item.label}
      </Link>
    );
  }
  if (item.highlight) {
    return (
      <Link href={item.href} className="flex flex-col items-center" aria-label={item.label}>
        <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-sage-500 text-2xl text-white shadow-card">
          {item.icon}
        </span>
        <span className="mt-1 text-[11px] font-medium text-sage-700">{item.label}</span>
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${
        active ? "text-sage-700" : "text-warmgray-500"
      }`}
    >
      <span className="text-xl" aria-hidden>
        {item.icon}
      </span>
      <span className="text-[11px] font-medium">{item.label}</span>
    </Link>
  );
}
