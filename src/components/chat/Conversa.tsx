"use client";

import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { TypingDots, ScaleInput } from "@/components/ui";
import {
  applyAnswer,
  emptyState,
  openingMessage,
  nextTurn,
  type ConversationState,
  type Turn,
} from "@/lib/ai/conversation";
import type { Conversation } from "@/lib/types";

interface Bubble {
  from: "assistant" | "user" | "safety";
  text: string;
}

export function Conversa() {
  const store = useStore();
  const userId = store.currentUserId!;
  const profile = store.currentProfile;

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [state, setState] = useState<ConversationState>(emptyState());
  const [typing, setTyping] = useState(true);
  const [text, setText] = useState("");
  const [scaleVal, setScaleVal] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const convRef = useRef<Conversation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Abertura: o app conduz, a pessoa não precisa descobrir o que fazer.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    convRef.current = store.createConversation(userId, "open_chat", "Conversa");
    const first = openingMessage(profile?.preferred_name);
    const t = setTimeout(() => {
      setTyping(false);
      setTurn(first);
      setBubbles([{ from: "assistant", text: first.message }]);
      persist("assistant", first.message);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, typing]);

  function persist(from: "assistant" | "user", content: string) {
    if (!convRef.current) return;
    store.addMessage({
      conversation_id: convRef.current.id,
      sender_type: from === "assistant" ? "assistant" : "user",
      content,
      structured_content: null,
      quick_replies: null,
    });
  }

  async function send(raw: string, numeric?: number) {
    if (!turn || done) return;
    const shown = numeric != null ? `${numeric}/10` : raw;
    setBubbles((b) => [...b, { from: "user", text: shown }]);
    persist("user", shown);
    setText("");
    setScaleVal(null);
    setTyping(true);

    // Atualiza o que sabemos sobre a situação.
    const newState = applyAnswer(state, turn.slot, raw, numeric);
    setState(newState);

    // Segurança roda no servidor antes de qualquer orientação.
    let next: Turn;
    let safetyMsg: string | null = null;
    try {
      const res = await fetch("/api/ai/converse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: newState,
          lastMessage: raw,
          history: bubbles.map((b) => ({ from: b.from === "user" ? "user" : "assistant", text: b.text })),
          context: {
            preferredName: profile?.preferred_name,
            northReminder: store.db.coping_cards.find((c) => c.user_id === userId)?.reminder_statement,
            effectiveStrategies: store.db.strategy_trials
              .filter((t) => t.user_id === userId && (t.result === "helped" || t.result === "partially_helped"))
              .map((t) => t.title_snapshot),
          },
        }),
      });
      const data = await res.json();
      next = data.turn as Turn;
      if (data.source === "safety") safetyMsg = next.message;
      // Registra alerta localmente também (a rota não tem sessão do usuário).
      if (data.safety?.risk) store.runSafety(userId, raw, convRef.current?.id);
    } catch {
      next = nextTurn(newState, raw);
    }

    setTyping(false);
    if (safetyMsg) {
      setBubbles((b) => [...b, { from: "safety", text: safetyMsg! }]);
      persist("assistant", safetyMsg);
      finish(newState);
      return;
    }

    setBubbles((b) => [...b, { from: "assistant", text: next.message }]);
    persist("assistant", next.message);
    setTurn(next);

    if (next.slot === "done" || next.closing) finish(newState);
  }

  // Salva a situação como evento + registro de pensamento + pensamento alternativo.
  function finish(s: ConversationState) {
    setDone(true);
    const convId = convRef.current?.id;
    const { event } = store.recordSituation(userId, s, convId);
    if (s.alternative && s.automatic_thought) {
      store.addAlternativeThought({
        user_id: userId,
        original_thought: s.automatic_thought,
        alternative: s.alternative,
        belief_level: s.belief_level ?? null,
        thought_record_id: null,
      });
    }
    if (s.strategy) {
      store.addStrategyTrial({
        user_id: userId,
        title_snapshot: s.strategy,
        difficulty_event_id: event.id,
        result: "not_tested",
        planned_for: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    if (convId) store.closeConversation(convId, summarize(s));
  }

  const showScale = turn?.scale && !done && !typing;
  const showInput = turn && !done && !typing && !turn.scale;

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col md:h-[calc(100dvh-5rem)]">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {bubbles.map((b, i) => (
          <Bubble key={i} bubble={b} />
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="card rounded-bl-md px-2 py-1">
              <TypingDots />
            </div>
          </div>
        )}
        {done && (
          <div className="space-y-3 pt-2">
            <p className="text-center text-sm text-warmgray-500">Conversa guardada.</p>
            <button
              className="btn-secondary w-full"
              onClick={() => {
                // Nova conversa do zero.
                startedRef.current = false;
                setBubbles([]);
                setState(emptyState());
                setTurn(null);
                setDone(false);
                setTyping(true);
                convRef.current = store.createConversation(userId, "open_chat", "Conversa");
                const first = openingMessage(profile?.preferred_name);
                setTimeout(() => {
                  setTyping(false);
                  setTurn(first);
                  setBubbles([{ from: "assistant", text: first.message }]);
                  persist("assistant", first.message);
                }, 400);
              }}
            >
              Falar de outra coisa
            </button>
          </div>
        )}
      </div>

      {(showInput || showScale) && (
        <div className="space-y-3 border-t border-warmgray-100 bg-sand-50 px-1 pt-3">
          {turn?.quickReplies && turn.quickReplies.length > 0 && !turn.scale && (
            <div className="flex flex-wrap gap-2">
              {turn.quickReplies.map((q) => (
                <button key={q} className="chip" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {showScale && (
            <div className="space-y-3">
              <ScaleInput value={scaleVal} onChange={setScaleVal} />
              <button
                className="btn-primary w-full"
                disabled={scaleVal === null}
                onClick={() => send(String(scaleVal), scaleVal ?? undefined)}
              >
                Continuar
              </button>
            </div>
          )}

          {showInput && (
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={text}
                placeholder="Escreve aqui…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) send(text.trim());
                }}
              />
              <button
                className="btn-primary px-4"
                onClick={() => text.trim() && send(text.trim())}
                aria-label="Enviar"
              >
                Enviar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summarize(s: ConversationState): string {
  const p: string[] = [];
  if (s.situation) p.push(`Situação: ${s.situation}`);
  if (s.hunger_level != null) p.push(`Fome: ${s.hunger_level}/10`);
  if (s.automatic_thought) p.push(`Pensamento: "${s.automatic_thought}"`);
  if (s.emotion) p.push(`Emoção: ${s.emotion}`);
  if (s.recovery_outcome) p.push(`Depois: ${s.recovery_outcome}`);
  if (s.alternative) p.push(`Resposta alternativa: "${s.alternative}"`);
  return p.join(". ");
}

function Bubble({ bubble }: { bubble: Bubble }) {
  if (bubble.from === "safety") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-teal-200 bg-teal-50 px-4 py-3 leading-relaxed text-teal-900">
          {bubble.text}
        </div>
      </div>
    );
  }
  const isUser = bubble.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-4 py-3 leading-relaxed ${
          isUser
            ? "rounded-2xl rounded-br-md bg-sage-500 text-white"
            : "card rounded-2xl rounded-bl-md"
        }`}
      >
        {bubble.text}
      </div>
    </div>
  );
}
