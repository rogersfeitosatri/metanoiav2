"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

export function PanelShell({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: React.ReactNode;
}) {
  const store = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!store.ready) return;
    if (!store.currentProfile) router.replace("/");
    else if (store.currentProfile.role !== role) {
      const r = store.currentProfile.role;
      router.replace(r === "user" ? "/app/conversa" : r === "professional" ? "/pro" : "/admin");
    }
  }, [store.ready, store.currentProfile, role, router]);

  if (!store.ready || !store.currentProfile || store.currentProfile.role !== role) {
    return <div className="p-8 text-center text-warmgray-400">Carregando…</div>;
  }

  return (
    <div className="min-h-dvh bg-warmgray-50">
      <header className="border-b border-warmgray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌱</span>
            <span className="font-semibold text-sage-800">Metanóia</span>
            <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-warmgray-500 sm:inline">
              {store.currentProfile.full_name}
            </span>
            <button
              className="text-warmgray-500 hover:text-warmgray-800"
              onClick={async () => {
                await store.logout();
                router.replace("/");
                router.refresh();
              }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}

export function useProfessionalId(): string | null {
  const store = useStore();
  if (!store.currentProfile) return null;
  const pro = store.db.professionals.find((p) => p.profile_id === store.currentProfile!.id);
  return pro?.id || null;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-warmgray-500 hover:text-sage-700">
      ← {children}
    </Link>
  );
}
