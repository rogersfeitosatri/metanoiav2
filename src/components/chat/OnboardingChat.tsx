"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, type OnboardingData } from "@/lib/store";
import { TERMS_TEXT } from "@/lib/demo-data";
import { TypingDots } from "@/components/ui";

type Step = "goal" | "difference" | "pain" | "meaning" | "hypothesis" | "correction" | "identity" | "impact" | "anchor" | "meal_name" | "meal_time" | "meal_days" | "reminder" | "terms";
type Bubble = { from: "assistant" | "user"; text: string };

const GOALS = ["Emagrecer", "Manter o peso", "Sair do efeito sanfona", "Outro objetivo"];
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const INITIAL = "Antes de começarmos, quero entender o que tu espera encontrar aqui. Qual destes objetivos mais se aproxima do teu momento?";

export function OnboardingChat() {
  const store = useStore();
  const router = useRouter();
  const userId = store.currentUserId!;
  const [step, setStep] = useState<Step>("goal");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bubbles, setBubbles] = useState<Bubble[]>([{ from: "assistant", text: INITIAL }]);
  const [draft, setDraft] = useState("");
  const [mealTime, setMealTime] = useState("12:00");
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [typing, setTyping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const conversationId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId || conversationId.current) return;
    const conversation = store.createConversation(userId, "onboarding", "Primeira conversa");
    conversationId.current = conversation.id;
    store.addMessage({ conversation_id: conversation.id, sender_type: "assistant", content: INITIAL, structured_content: { phase: "goal" }, quick_replies: GOALS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, typing]);

  function persist(from: Bubble["from"], text: string, phase: Step, quickReplies?: string[]) {
    setBubbles((current) => [...current, { from, text }]);
    if (conversationId.current) store.addMessage({ conversation_id: conversationId.current, sender_type: from, content: text, structured_content: { phase }, quick_replies: quickReplies || null });
  }

  function ask(next: Step, text: string, quickReplies?: string[]) {
    setStep(next);
    setTyping(true);
    window.setTimeout(() => { setTyping(false); persist("assistant", text, next, quickReplies); }, 420);
  }

  function answer(field: string, value: string, next: Step, question: string, quickReplies?: string[]) {
    setAnswers((current) => ({ ...current, [field]: value }));
    persist("user", value, step);
    setDraft("");
    ask(next, question, quickReplies);
  }

  function submitText() {
    const value = draft.trim();
    if (!value) return;
    if (step === "difference") answer("difference", value, "pain", "E hoje, o que mais pesa ou te cansa nessa relação com a alimentação?");
    else if (step === "pain") answer("pain", value, "meaning", "Se isso começasse a melhorar, o que ficaria diferente na tua vida, além do peso?");
    else if (step === "meaning") {
      const next = { ...answers, meaning: value };
      setAnswers(next); persist("user", value, step); setDraft("");
      ask("hypothesis", hypothesisFor(next), ["Faz sentido", "Mais ou menos", "Não é bem isso"]);
    } else if (step === "correction") answer("meaning", value, "identity", "Obrigado por corrigir. Quando o peso não estiver decidindo teu valor, quem tu quer ser no cuidado contigo?");
    else if (step === "identity") answer("identity", value, "impact", "Em qual parte da vida tu sentiria essa mudança primeiro?");
    else if (step === "impact") answer("impact", value, "anchor", "Quando vier um momento difícil, que frase tua poderia te lembrar desse Norte?");
    else if (step === "anchor") answer("anchor", value, "meal_name", "Agora vamos combinar os momentos em que eu posso estar por perto. Qual refeição tu quer cadastrar primeiro?");
    else if (step === "meal_name") { setAnswers((current) => ({ ...current, meal_name: value })); persist("user", value, step); setDraft(""); ask("meal_time", `Que horas costuma ser ${lowerFirst(value)}?`); }
  }

  function choose(value: string) {
    if (step === "goal") answer("goal", value, "difference", "O que tu espera que mude na tua vida ao avançar nesse objetivo?");
    else if (step === "hypothesis") {
      persist("user", value, step);
      if (value === "Faz sentido") { setAnswers((current) => ({ ...current, hypothesis_confirmed: "true" })); ask("identity", "Quando o peso não estiver decidindo teu valor, quem tu quer ser no cuidado contigo?"); }
      else ask("correction", "Tudo bem. Como tu diria isso com tuas palavras?");
    } else if (step === "reminder") { setAnswers((current) => ({ ...current, reminder: value })); persist("user", value, step); ask("terms", "Antes de seguir, preciso da tua autorização para guardar estas conversas e usá-las no teu acompanhamento."); }
  }

  function finish() {
    if (submitting) return;
    setSubmitting(true); persist("user", "Li e aceito", step);
    const data: OnboardingData = {
      preferred_name: store.currentProfile?.preferred_name || "amigo",
      goal_type: answers.goal === "Sair do efeito sanfona" ? "parar_de_desistir" : answers.goal === "Manter o peso" ? "organizacao" : "outro",
      goal_description: answers.goal || "Transformar minha relação com a alimentação",
      hard_moments: answers.pain ? [answers.pain] : [], difficulties: [],
      support_times: answers.reminder === "Sim, quero" ? [mealTime] : [],
      first_commitment: "Observar o próximo momento com curiosidade, sem compensar.", accepted_terms: true,
      why_it_matters: answers.meaning || answers.difference, future_difference: answers.difference, cost_of_no_change: answers.pain,
      desired_identity: answers.identity, reminder_statement: answers.anchor,
      life_impacts: answers.impact ? { primeiro_impacto: answers.impact } : {},
      meals: [{ name: answers.meal_name || "Refeição", time_of_day: mealTime, days_of_week: days, reminder_enabled: answers.reminder === "Sim, quero" }],
    };
    store.completeOnboarding(data);
    if (conversationId.current) store.closeConversation(conversationId.current, `Norte inicial: ${data.why_it_matters || data.goal_description}`);
    router.push("/app/hoje");
  }

  const textSteps = ["difference", "pain", "meaning", "correction", "identity", "impact", "anchor", "meal_name"].includes(step);
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-[#fcfbf8] px-4 sm:px-6">
      <header className="flex h-16 items-center border-b border-warmgray-100"><div><p className="font-semibold text-sage-800">Metanóia</p><p className="text-xs text-warmgray-500">Tua primeira conversa</p></div></header>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-6">
        {bubbles.map((bubble, index) => <div key={index} className={`flex ${bubble.from === "user" ? "justify-end" : "justify-start"}`}><div className={bubble.from === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}>{bubble.text}</div></div>)}
        {typing && <div className="chat-bubble-assistant w-fit"><TypingDots /></div>}
      </div>
      <div className="sticky bottom-0 border-t border-warmgray-100 bg-[#fcfbf8] py-4">
        {step === "goal" && <Choices options={GOALS} onChoose={choose} />}
        {step === "hypothesis" && <Choices options={["Faz sentido", "Mais ou menos", "Não é bem isso"]} onChoose={choose} />}
        {step === "reminder" && <Choices options={["Sim, quero", "Não por enquanto"]} onChoose={choose} />}
        {step === "meal_time" && <div className="flex gap-2"><input aria-label="Horário da refeição" type="time" className="input" value={mealTime} onChange={(event) => setMealTime(event.target.value)} /><button className="btn-primary" onClick={() => { persist("user", mealTime, step); ask("meal_days", "Em quais dias essa refeição costuma acontecer?"); }}>Continuar</button></div>}
        {step === "meal_days" && <div className="space-y-3"><div className="grid grid-cols-7 gap-2">{DAYS.map((label, value) => <button key={value} aria-pressed={days.includes(value)} className={`h-11 rounded-lg border text-sm font-medium ${days.includes(value) ? "border-sage-500 bg-sage-100 text-sage-800" : "border-warmgray-200 bg-white text-warmgray-500"}`} onClick={() => setDays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())}>{label}</button>)}</div><button className="btn-primary w-full" disabled={!days.length} onClick={() => { persist("user", days.length === 7 ? "Todos os dias" : `${days.length} dias por semana`, step); ask("reminder", "Quer receber um lembrete próximo desse horário?", ["Sim, quero", "Não por enquanto"]); }}>Continuar</button></div>}
        {step === "terms" && <div className="space-y-3"><details className="rounded-lg border border-warmgray-200 bg-white p-3 text-sm text-warmgray-600"><summary className="cursor-pointer font-medium text-warmgray-700">Ler termos e privacidade</summary><pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">{TERMS_TEXT}</pre></details><button className="btn-primary w-full" disabled={submitting} onClick={finish}>{submitting ? "Preparando..." : "Li, aceito e quero começar"}</button></div>}
        {textSteps && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); submitText(); }}><textarea rows={1} className="input max-h-32 resize-none" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreve do teu jeito..." autoFocus /><button className="btn-primary self-end" disabled={!draft.trim()} type="submit">Enviar</button></form>}
      </div>
    </main>
  );
}

function Choices({ options, onChoose }: { options: string[]; onChoose: (value: string) => void }) { return <div className="flex flex-wrap gap-2">{options.map((option) => <button key={option} className="chip" onClick={() => onChoose(option)}>{option}</button>)}</div>; }
function lowerFirst(value: string) { const clean = value.trim().replace(/[.!?]+$/, ""); return clean ? clean.charAt(0).toLowerCase() + clean.slice(1) : clean; }
function hypothesisFor(answers: Record<string, string>) { return `Deixa eu ver se entendi: para ti, ${(answers.goal || "mudar").toLowerCase()} parece ser uma parte do caminho, mas o que realmente importa é ${lowerFirst(answers.meaning || answers.difference || "ter mais tranquilidade")}. Faz sentido ou viajei?`; }
