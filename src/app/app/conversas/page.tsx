"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/ui";
import { CONVERSATION_TYPE_LABELS } from "@/lib/labels";

export default function ConversasPage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const conversations = store.db.conversations
    .filter((c) => c.user_id === userId)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Conversas</h1>
        <p className="text-warmgray-600">Podes retomar uma conversa quando quiser.</p>
      </header>

      {conversations.length === 0 ? (
        <EmptyState>Ainda não há conversas por aqui.</EmptyState>
      ) : (
        conversations.map((c) => (
          <Link key={c.id} href={`/app/conversas/${c.id}`}>
            <Card className="transition-colors hover:border-sage-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-warmgray-800">{c.title}</p>
                  <p className="text-sm text-warmgray-500">
                    {CONVERSATION_TYPE_LABELS[c.type]} ·{" "}
                    {new Date(c.started_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="text-sm text-warmgray-400">
                  {c.status === "open" ? "Aberta" : "→"}
                </span>
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
