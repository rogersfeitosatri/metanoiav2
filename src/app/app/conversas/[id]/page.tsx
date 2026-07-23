"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card } from "@/components/ui";

export default function ConversaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const store = useStore();
  const conv = store.db.conversations.find((c) => c.id === id);
  const messages = store.db.conversation_messages
    .filter((m) => m.conversation_id === id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (!conv) {
    return (
      <div className="space-y-4">
        <p className="text-warmgray-500">Não consegui carregar essa conversa agora.</p>
        <Link href="/app/conversas" className="btn-secondary">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-sage-800">{conv.title}</h1>
          <p className="text-sm text-warmgray-500">
            {new Date(conv.started_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <Link href="/app/conversas" className="btn-ghost text-sm">
          Voltar
        </Link>
      </header>

      <div className="space-y-3">
        {messages
          .filter((m) => m.sender_type !== "system")
          .map((m) => {
            const isUser = m.sender_type === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 leading-relaxed ${
                    isUser
                      ? "rounded-2xl rounded-br-md bg-sage-500 text-white"
                      : "card rounded-2xl rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
      </div>

      {conv.summary && (
        <Card className="bg-warmgray-50">
          <p className="text-xs font-medium uppercase tracking-wide text-warmgray-500">Resumo</p>
          <p className="mt-1 text-sm text-warmgray-700">{conv.summary}</p>
        </Card>
      )}
    </div>
  );
}
