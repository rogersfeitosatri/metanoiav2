"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TypingDots } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { Conversation, ConversationMessage, MealSchedule, UserMemory } from "@/lib/types";

type Bubble = { id: string; from: "assistant" | "user" | "safety"; text: string };
type Phase = "open" | "meal_checkin" | "difficulty_consent" | "difficulty_hunger" | "difficulty_reason" | "success_factor" | "trial_review";

interface AiResponse {
  reply: string;
  quick_replies?: string[];
  source?: string;
  safety?: { risk: boolean; level: string };
  memory_updates?: Array<Pick<UserMemory, "memory_kind" | "topic" | "content" | "source" | "validation_status" | "confidence">>;
  difficulty_capture?: { ready: boolean; reasons: string[]; situation?: string; automatic_thought?: string; emotion?: string; hunger_intensity?: number; urge_intensity?: number; emotional_intensity?: number };
  strategy_plan?: { title: string; accepted_by_user: boolean };
}

export function ConversationHome() {
  const store = useStore();
  const userId = store.currentUserId!;
  const profile = store.currentProfile!;
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const conversationRef = useRef<Conversation | null>(null);
  const phaseRef = useRef<Phase>("open");
  const activeScheduleRef = useRef<MealSchedule | null>(null);
  const activeCheckinRef = useRef<string | null>(null);
  const hungerRef = useRef<number | null>(null);
  const hypothesisRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const card = store.db.coping_cards.find((item) => item.user_id === userId);
  const memories = useMemo(() => store.db.user_memories.filter((item) => item.user_id === userId), [store.db.user_memories, userId]);
  const trials = useMemo(() => store.db.strategy_trials.filter((item) => item.user_id === userId), [store.db.strategy_trials, userId]);

  useEffect(() => {
    if (conversationRef.current) return;
    const existing = store.db.conversations
      .filter((item) => item.user_id === userId && item.type === "open_chat" && item.status === "open")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
    const conversation = existing || store.createConversation(userId, "open_chat", "Conversa com o Metanóia");
    conversationRef.current = conversation;
    const existingMessages = store.db.conversation_messages.filter((item) => item.conversation_id === conversation.id);
    if (existingMessages.length) {
      setBubbles(existingMessages.map(toBubble));
      const last = existingMessages.at(-1);
      const savedPhase = last?.structured_content?.phase;
      if (typeof savedPhase === "string" && ["open", "meal_checkin", "difficulty_consent", "difficulty_hunger", "difficulty_reason", "success_factor", "trial_review"].includes(savedPhase)) {
        phaseRef.current = savedPhase as Phase;
        if (savedPhase === "meal_checkin") activeScheduleRef.current = findRelevantMeal(store.db.meal_schedules.filter((item) => item.user_id === userId && item.active));
      }
      setQuickReplies(last?.sender_type === "assistant" ? last.quick_replies || [] : []);
      return;
    }
    const pending = trials.find((item) => item.result === "not_tested");
    const dueMeal = findRelevantMeal(store.db.meal_schedules.filter((item) => item.user_id === userId && item.active));
    let text = `Oi, ${profile.preferred_name}. Como tu chega para esta conversa hoje?`;
    let replies = ["Quero contar como estou", "Uma refeição foi difícil", "Algo deu certo", "Preciso de apoio agora"];
    if (pending) {
      text = `Na última vez, tu pensou em testar “${pending.title_snapshot}”. Chegou a experimentar em alguma situação?`;
      replies = ["Ajudou", "Ajudou em parte", "Não ajudou", "Ainda não testei"];
      phaseRef.current = "trial_review";
    } else if (dueMeal) {
      activeScheduleRef.current = dueMeal;
      text = `${dueMeal.name} estava previsto por volta de ${dueMeal.time_of_day.slice(0, 5)}. Como foi para ti?`;
      replies = ["Realizei", "Realizei em parte", "Não realizei", "Prefiro só conversar"];
      phaseRef.current = "meal_checkin";
    } else if (card?.reminder_statement) {
      text = `Oi, ${profile.preferred_name}. Teu Norte lembra: “${card.reminder_statement}”. O que está mais presente para ti agora?`;
    }
    addAssistant(text, replies, { phase: phaseRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, typing]);

  function persist(sender: "assistant" | "user", text: string, replies: string[] = [], structured: Record<string, unknown> | null = null) {
    const id = crypto.randomUUID();
    setBubbles((current) => [...current, { id, from: sender, text }]);
    if (conversationRef.current) store.addMessage({ conversation_id: conversationRef.current.id, sender_type: sender, content: text, structured_content: structured, quick_replies: replies.length ? replies : null });
  }

  function addAssistant(text: string, replies: string[] = [], structured: Record<string, unknown> | null = null) {
    persist("assistant", text, replies, structured);
    setQuickReplies(replies);
  }

  async function send(value = draft) {
    const text = value.trim();
    if (!text || typing) return;
    persist("user", text);
    setDraft(""); setQuickReplies([]);

    if (hypothesisRef.current && /faz sentido|mais ou menos|não|nao/i.test(text)) {
      store.updateMemory(hypothesisRef.current, { validation_status: /faz sentido/i.test(text) ? "confirmed" : /não|nao/i.test(text) ? "rejected" : "proposed" });
      hypothesisRef.current = null;
    }
    if (await handleStructuredMoment(text)) return;
    setTyping(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversation_id: conversationRef.current?.id, history: bubbles.slice(-10).map((item) => ({ from: item.from === "user" ? "user" : "assistant", text: item.text })), context: buildContext() }),
      });
      const data = (await response.json()) as AiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não consegui responder agora.");
      for (const update of data.memory_updates || []) {
        const memory = store.saveMemory({ ...update, source_conversation_id: conversationRef.current?.id || null });
        if (memory.validation_status === "proposed") hypothesisRef.current = memory.id;
      }
      if (data.difficulty_capture?.ready) store.recordDifficulty(userId, data.difficulty_capture, conversationRef.current?.id, activeCheckinRef.current || undefined);
      if (data.strategy_plan?.accepted_by_user) store.addStrategyTrial({ user_id: userId, title_snapshot: data.strategy_plan.title, result: "not_tested", planned_for: new Date(Date.now() + 86400000).toISOString() });
      addAssistant(data.reply, data.quick_replies || [], { source: data.source, safety: data.safety });
    } catch {
      addAssistant("Não consegui acessar o assistente agora. Teu registro ficou aqui; tenta continuar em alguns instantes.");
    } finally { setTyping(false); }
  }

  async function handleStructuredMoment(text: string) {
    const phase = phaseRef.current;
    if (phase === "trial_review") {
      const pending = trials.find((item) => item.result === "not_tested");
      if (!pending) return false;
      const result = /em parte/i.test(text) ? "partially_helped" : /^ajudou$/i.test(text) ? "helped" : /não ajudou|nao ajudou/i.test(text) ? "did_not_help" : "not_tested";
      if (result !== "not_tested") {
        store.updateStrategyTrial(pending.id, { result, tested_at: new Date().toISOString(), user_feedback: text });
        if (result === "helped" || result === "partially_helped") store.saveMemory({ memory_kind: "protective_factor", topic: "estrategia_testada", content: pending.title_snapshot, source: "user", validation_status: "confirmed", confidence: 1, source_conversation_id: conversationRef.current?.id || null });
      }
      phaseRef.current = "open";
      addAssistant(result === "not_tested" ? "Tudo bem, ela continua como uma possibilidade, não como algo que já funciona. O que tu precisa hoje?" : "Obrigado por avaliar. O que nessa experiência vale guardar para a próxima vez?", result === "not_tested" ? ["Quero conversar", "Preciso de apoio agora"] : []);
      return true;
    }
    if (phase === "meal_checkin" && !/prefiro/i.test(text)) {
      const status = /em parte/i.test(text) ? "partial" : /não|nao/i.test(text) ? "not_completed" : "completed";
      const checkin = store.addCheckin({ user_id: userId, schedule_id: activeScheduleRef.current?.id || null, custom_meal_name: activeScheduleRef.current?.name || null, status });
      activeCheckinRef.current = checkin.id;
      if (status === "completed") { phaseRef.current = "success_factor"; addAssistant("O que ajudou essa refeição a acontecer desse jeito?"); }
      else { phaseRef.current = "difficulty_consent"; addAssistant("Entendi. Tu prefere apenas registrar ou quer entender o que tornou esse momento mais difícil?", ["Só registrar", "Quero entender"]); }
      return true;
    }
    if (phase === "difficulty_consent") {
      if (/só|so registrar/i.test(text)) { phaseRef.current = "open"; addAssistant("Registrado, sem julgamento. Estou por aqui quando quiser conversar."); }
      else { phaseRef.current = "difficulty_hunger"; addAssistant("Primeiro, como estava tua fome naquele momento?", ["Baixa, até 3", "Média, de 4 a 6", "Alta, 7 ou mais"]); }
      return true;
    }
    if (phase === "difficulty_hunger") {
      hungerRef.current = /alta|7/i.test(text) ? 8 : /média|media|4/i.test(text) ? 5 : 2;
      phaseRef.current = "difficulty_reason"; addAssistant("Além da fome, o que mais influenciou o que aconteceu?"); return true;
    }
    if (phase === "difficulty_reason") {
      store.recordDifficulty(userId, { reasons: [text], situation: text, hunger_intensity: hungerRef.current }, conversationRef.current?.id, activeCheckinRef.current || undefined);
      phaseRef.current = "open"; addAssistant("Ficou registrado junto dessa refeição. Em que ponto teria sido mais possível te apoiar: antes, durante ou depois?", ["Antes", "Durante", "Depois"]); return true;
    }
    if (phase === "success_factor") {
      store.saveMemory({ memory_kind: "protective_factor", topic: activeScheduleRef.current?.name || "refeicao", content: text, source: "user", validation_status: "confirmed", confidence: 1, source_conversation_id: conversationRef.current?.id || null });
      phaseRef.current = "open"; addAssistant("Guardei isso como algo que te ajuda, porque veio da tua experiência. O que tu gostaria de repetir na próxima vez?"); return true;
    }
    return false;
  }

  function buildContext() {
    const confirmed = memories.filter((item) => item.validation_status === "confirmed");
    return {
      preferred_name: profile.preferred_name,
      north: [card?.main_goal, card?.why_it_matters, card?.desired_identity, card?.reminder_statement].filter(Boolean),
      confirmed_memories: confirmed.slice(0, 12).map((item) => item.content),
      proposed_hypotheses: memories.filter((item) => item.validation_status === "proposed").map((item) => item.content),
      effective_strategies: trials.filter((item) => item.result === "helped" || item.result === "partially_helped").map((item) => item.title_snapshot),
      pending_strategies: trials.filter((item) => item.result === "not_tested").map((item) => item.title_snapshot),
      meals: store.db.meal_schedules.filter((item) => item.user_id === userId && item.active).map((item) => `${item.name} às ${item.time_of_day.slice(0, 5)}`),
    };
  }

  return (
    <section className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] flex-col md:h-[calc(100dvh-4rem)]">
      <header className="flex items-center justify-between border-b border-warmgray-100 pb-3"><div><h1 className="font-semibold text-sage-800">Metanóia</h1><p className="text-xs text-warmgray-500">Uma pergunta de cada vez</p></div><Link href="/app/conversas" className="text-sm font-medium text-sage-700">Histórico</Link></header>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-5">
        {bubbles.map((bubble) => <div key={bubble.id} className={`flex ${bubble.from === "user" ? "justify-end" : "justify-start"}`}><div className={bubble.from === "user" ? "chat-bubble-user" : bubble.from === "safety" ? "max-w-[86%] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-warmgray-700" : "chat-bubble-assistant"}>{bubble.text}</div></div>)}
        {typing && <div className="chat-bubble-assistant w-fit"><TypingDots /></div>}
      </div>
      <div className="border-t border-warmgray-100 bg-sand-50 pt-3">
        {quickReplies.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{quickReplies.map((reply) => <button key={reply} className="chip" onClick={() => send(reply)}>{reply}</button>)}</div>}
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea aria-label="Mensagem" rows={1} className="input max-h-32 resize-none" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreve do teu jeito..." /><button className="btn-primary self-end" type="submit" disabled={!draft.trim() || typing}>Enviar</button></form>
      </div>
    </section>
  );
}

function toBubble(message: ConversationMessage): Bubble { return { id: message.id, from: message.sender_type === "user" ? "user" : "assistant", text: message.content }; }
function findRelevantMeal(schedules: MealSchedule[]) { const now = new Date(); const today = now.getDay(); const minutes = now.getHours() * 60 + now.getMinutes(); const closest = schedules.filter((item) => item.days_of_week.includes(today)).sort((a, b) => distance(a.time_of_day, minutes) - distance(b.time_of_day, minutes))[0]; return closest && distance(closest.time_of_day, minutes) <= 90 ? closest : null; }
function distance(time: string, minutes: number) { const [hour, minute] = time.split(":").map(Number); return Math.abs(hour * 60 + minute - minutes); }
