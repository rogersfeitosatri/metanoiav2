"use client";

import { FlowChat } from "@/components/chat/FlowChat";

export default function AjudaPage() {
  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-sage-800">Preciso de ajuda agora</h1>
        <p className="text-sm text-warmgray-500">
          Um direcionamento em menos de um minuto. Uma pergunta de cada vez.
        </p>
      </header>
      <FlowChat
        flowId="immediate_help"
        conversationType="immediate_help"
        title="Ajuda imediata"
      />
    </div>
  );
}
