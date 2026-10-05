"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/ui";
import {
  buildInsights,
  type InsightBlock,
  type InsightFeedback,
  type InsightsResult,
} from "@/lib/insights";

export default function AprendizadosPage() {
  const store = useStore();
  const [remote, setRemote] = useState<InsightsResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const userId = store.currentUserId;
  useEffect(() => {
    if (store.mode !== "supabase" || !userId) return;
    let active = true;
    setRemote(null);
    setError("");
    fetch("/api/insights", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) setRemote(data);
      })
      .catch(() => {
        if (active)
          setError("Não consegui carregar teus aprendizados. Tenta novamente.");
      });
    return () => {
      active = false;
    };
  }, [store.mode, userId, revision]);

  const insights =
    store.mode === "demo" && userId
      ? buildInsights({
          userId,
          db: store.db,
          timezone: store.currentProfile?.timezone,
        })
      : remote;
  async function respond(key: string, choice: InsightFeedback) {
    await store.respondToInsight(key, choice);
    setNotice(
      choice === "rejected"
        ? "Resposta salva. Esse aprendizado não vai continuar aparecendo como verdade."
        : choice === "qualified"
          ? "Resposta salva. Isso continua em aberto, sem virar uma conclusão sobre ti."
          : "Resposta salva. Vou considerar o que tu confirmou.",
    );
    setRevision((r) => r + 1);
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1>
        <p className="mt-1 text-warmgray-600">
          O que estamos entendendo e o que vale observar agora.
        </p>
      </header>
      {notice && (
        <p role="status" className="text-sm text-sage-700">
          {notice}
        </p>
      )}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="btn-secondary mt-2"
            onClick={() => setRevision((r) => r + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : !insights ? (
        <p role="status">Carregando...</p>
      ) : (
        <>
          {insights.tooEarly && (
            <EmptyState>
              <p className="font-medium">
                Ainda estamos conhecendo teu padrão.
              </p>
              <p className="mt-2">
                Conforme tu trouxer situações, vamos olhar para o que aparece
                junto e o que parece ajudar. Ainda não quero tirar conclusão
                cedo.
              </p>
              <Link
                href="/app/hoje"
                className="mt-3 inline-block font-medium text-sage-700 underline"
              >
                Conversar
              </Link>
            </EmptyState>
          )}
          {insights.blocks.map((block) => (
            <InsightCard key={block.key} block={block} onRespond={respond} />
          ))}
          {insights.practice && (
            <Card className="border-sand-200 bg-sand-50">
              <h2 className="text-sm font-medium text-warmgray-700">
                O que vale observar agora
              </h2>
              <p className="mt-2 leading-relaxed text-warmgray-800">
                {insights.practice}
              </p>
              <Link
                href="/app/hoje"
                className="mt-3 inline-block text-sm font-medium text-sage-700 underline"
              >
                Levar para a conversa
              </Link>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function InsightCard({
  block,
  onRespond,
}: {
  block: InsightBlock;
  onRespond: (key: string, choice: InsightFeedback) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function respond(choice: InsightFeedback) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onRespond(block.key, choice);
    } catch {
      setError("Não consegui salvar tua resposta. Tenta novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="text-sm font-medium text-sage-700">{block.title}</h2>
      <p className="mt-2 leading-relaxed text-warmgray-800">{block.body}</p>
      {block.after && (
        <p className="mt-2 text-sm leading-relaxed text-warmgray-600">
          {block.after}
        </p>
      )}
      {block.north && (
        <p className="mt-3 border-l-2 border-sage-200 pl-3 text-sm text-warmgray-600">
          {block.north}
        </p>
      )}
      {block.kind !== "resource" && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-warmgray-600">
            {block.status === "confirmed"
              ? "Isso já apareceu algumas vezes e tu também confirmou. Ainda faz sentido?"
              : block.status === "qualified"
                ? "Tu disse que isso faz sentido em parte. Continua em aberto."
                : "É uma hipótese sobre essas situações. Isso bate com o que tu percebe?"}
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Isso bate com o que tu percebe?"
          >
            <button
              disabled={busy}
              aria-pressed={block.status === "confirmed"}
              className="chip"
              onClick={() => respond("confirmed")}
            >
              Sim, faz sentido
            </button>
            <button
              disabled={busy}
              aria-pressed={block.status === "qualified"}
              className="chip"
              onClick={() => respond("qualified")}
            >
              Mais ou menos
            </button>
            <button
              disabled={busy}
              className="chip"
              onClick={() => respond("rejected")}
            >
              Não é bem isso
            </button>
          </div>
          {busy && (
            <p role="status" className="mt-2 text-sm">
              Salvando...
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
