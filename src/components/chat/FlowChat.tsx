"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { getFlow, type FlowContext } from "@/lib/ai/flow-engine";
import { useStore } from "@/lib/store";
import { ChipGroup, ScaleInput, TypingDots } from "@/components/ui";
import type { Conversation, ConversationType } from "@/lib/types";

interface Bubble {
  from: "assistant" | "user" | "safety";
  text: string;
}

export function FlowChat({
  flowId,
  conversationType,
  title,
  onComplete,
}: {
  flowId: string;
  conversationType: ConversationType;
  title: string;
  onComplete?: (answers: Record<string, unknown>) => void;
}) {
  const store = useStore();
  const flow = getFlow(flowId);
  const userId = store.currentUserId!;

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(true);
  const [multiDraft, setMultiDraft] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [scaleVal, setScaleVal] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const convRef = useRef<Conversation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Contexto do fluxo: nome, cartão e estratégias eficazes do usuário.
  const ctx: FlowContext = useMemo(() => {
    const profile = store.db.profiles.find((p) => p.id === userId);
    const card = store.db.coping_cards.find((c) => c.user_id === userId);
    const effective = store.db.strategy_trials
      .filter((t) => t.user_id === userId && (t.result === "helped" || t.result === "partially_helped"))
      .map((t) => t.title_snapshot);
    return {
      answers,
      preferredName: profile?.preferred_name,
      copingReminder: card?.reminder_statement,
      effectiveStrategies: [...new Set(effective)],
    };
  }, [answers, store.db, userId]);

  // Cria a conversa uma vez.
  useEffect(() => {
    if (!convRef.current) {
      convRef.current = store.createConversation(userId, conversationType, title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = flow?.steps[stepIndex];

  // Exibe a mensagem do passo atual com indicador de digitação.
  useEffect(() => {
    if (!step || finished || interrupted) return;
    setTyping(true);
    setMultiDraft([]);
    setFreeText("");
    setScaleVal(null);
    const text = step.message({ ...ctx, answers });
    const t = setTimeout(() => {
      setTyping(false);
      setBubbles((b) => [...b, { from: "assistant", text }]);
      if (convRef.current) {
        store.addMessage({
          conversation_id: convRef.current.id,
          sender_type: "assistant",
          content: text,
          structured_content: null,
          quick_replies: step.options ? step.options({ ...ctx, answers }) : null,
        });
      }
      // passos "info" avançam automaticamente após um instante
      if (step.kind === "info") {
        setTimeout(() => advance(undefined), 900);
      }
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, finished, interrupted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, typing]);

  function persistUser(text: string) {
    setBubbles((b) => [...b, { from: "user", text }]);
    if (convRef.current) {
      store.addMessage({
        conversation_id: convRef.current.id,
        sender_type: "user",
        content: text,
        structured_content: null,
        quick_replies: null,
      });
      // Camada de segurança roda antes de prosseguir.
      const safety = store.runSafety(userId, text, convRef.current.id);
      if (safety.safe_message) {
        setBubbles((b) => [...b, { from: "safety", text: safety.safe_message! }]);
        setInterrupted(true);
        setTyping(false);
      }
    }
  }

  function advance(storedValue: unknown) {
    if (!step) return;
    const nextAnswers = { ...answers };
    if (step.field && storedValue !== undefined) {
      nextAnswers[step.field] = storedValue;
    }
    setAnswers(nextAnswers);

    const nextIndex = stepIndex + 1;
    if (nextIndex >= (flow?.steps.length || 0)) {
      setFinished(true);
      if (convRef.current) {
        store.closeConversation(convRef.current.id, summarize(nextAnswers));
      }
      onComplete?.(nextAnswers);
    } else {
      setStepIndex(nextIndex);
    }
  }

  function summarize(a: Record<string, unknown>): string {
    const reasons = (a.reasons as string[]) || [];
    const thought = a.automatic_thought as string;
    const parts: string[] = [];
    if (reasons.length) parts.push(`Motivos: ${reasons.join(", ")}`);
    if (thought) parts.push(`Pensamento: "${thought}"`);
    if (a.strategy_choice) parts.push(`Estratégia: ${a.strategy_choice}`);
    if (a.commitment) parts.push(`Compromisso: ${a.commitment}`);
    return parts.join(". ") || "Conversa registrada.";
  }

  function handleSingle(opt: string) {
    if (interrupted) return;
    persistUser(opt);
    setTimeout(() => advance(opt), 300);
  }

  function handleMultiConfirm() {
    if (multiDraft.length === 0 && !freeText.trim()) return;
    const values = [...multiDraft];
    if (freeText.trim()) values.push(freeText.trim());
    persistUser(values.join(", "));
    setTimeout(() => advance(values), 300);
  }

  function handleText() {
    const t = freeText.trim();
    if (!t) return;
    persistUser(t);
    setTimeout(() => advance(t), 300);
  }

  function handleScale() {
    if (scaleVal === null) return;
    persistUser(`${scaleVal}/10`);
    setTimeout(() => advance(scaleVal), 300);
  }

  const showInput = !typing && step && !finished && !interrupted && step.kind !== "info";

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {bubbles.map((b, i) => (
          <MessageBubble key={i} bubble={b} />
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="card rounded-bl-md px-2 py-1">
              <TypingDots />
            </div>
          </div>
        )}
        {(finished || interrupted) && (
          <div className="pt-2 text-center text-sm text-warmgray-500">
            {interrupted
              ? "Conversa registrada. O profissional que te acompanha foi avisado."
              : "Conversa encerrada por agora."}
          </div>
        )}
      </div>

      {showInput && step && (
        <div className="border-t border-warmgray-100 bg-sand-50 px-1 pt-3">
          {step.kind === "single" && step.options && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {step.options({ ...ctx, answers }).map((opt) => (
                  <button key={opt} className="chip" onClick={() => handleSingle(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
              {step.allowFreeText && (
                <FreeRow
                  value={freeText}
                  onChange={setFreeText}
                  onSend={handleText}
                  placeholder="Ou escreve com tuas palavras…"
                />
              )}
            </div>
          )}

          {step.kind === "multi" && step.options && (
            <div className="space-y-3">
              <ChipGroup
                options={step.options({ ...ctx, answers })}
                value={multiDraft}
                multi
                onChange={setMultiDraft}
              />
              {step.allowFreeText && (
                <input
                  className="input"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Outro (opcional)…"
                />
              )}
              <button className="btn-primary w-full" onClick={handleMultiConfirm}>
                Continuar
              </button>
            </div>
          )}

          {step.kind === "scale" && (
            <div className="space-y-3">
              <ScaleInput value={scaleVal} onChange={setScaleVal} />
              <button className="btn-primary w-full" onClick={handleScale} disabled={scaleVal === null}>
                Continuar
              </button>
            </div>
          )}

          {step.kind === "text" && (
            <div className="space-y-2">
              <FreeRow
                value={freeText}
                onChange={setFreeText}
                onSend={handleText}
                placeholder="Escreve aqui…"
              />
              {step.skippable && (
                <button className="btn-ghost w-full text-sm" onClick={() => advance("")}>
                  Prefiro não responder agora
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {(finished || interrupted) && onComplete === undefined && (
        <div className="border-t border-warmgray-100 pt-3">
          <a href="/app/hoje" className="btn-secondary w-full">
            Voltar para o início
          </a>
        </div>
      )}
    </div>
  );
}

function FreeRow({
  value,
  onChange,
  onSend,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        className="input flex-1"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSend();
        }}
      />
      <button className="btn-primary px-4" onClick={onSend} aria-label="Enviar">
        Enviar
      </button>
    </div>
  );
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  if (bubble.from === "safety") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-teal-200 bg-teal-50 px-4 py-3 text-teal-900">
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
