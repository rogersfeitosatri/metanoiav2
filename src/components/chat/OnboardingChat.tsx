"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, type OnboardingData } from "@/lib/store";
import { TERMS_TEXT } from "@/lib/demo-data";
import { TypingDots } from "@/components/ui";
import { LIFE_IMPACT_DIMENSIONS } from "@/lib/labels";

type Step = "goal" | "difference" | "pain" | "meaning" | "hypothesis" | "correction" | "identity" | "impact_area" | "impact" | "impact_more" | "anchor" | "meal_name" | "meal_time" | "meal_days" | "reminder" | "terms";
type Bubble = { from: "assistant" | "user"; text: string };

const GOALS = ["Emagrecer", "Manter o peso", "Sair do efeito sanfona", "Outro objetivo"];
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const INITIAL = "Oi! Antes de tudo: o que te trouxe até aqui?";

// Ordem dos pontos explorados pela IA. A IA escolhe as PALAVRAS; a ordem é nossa,
// para o Meu Norte sempre sair completo.
const EXPLORACAO: Array<"difference" | "pain" | "meaning" | "identity"> = [
  "difference", "pain", "meaning", "identity",
];

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
  const [impacts, setImpacts] = useState<Record<string, string>>({});
  const areaRef = useRef<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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

  // Pede à IA a pergunta para um ponto específico, aproveitando o que a pessoa
  // acabou de dizer. O roteiro antigo continua como rede de segurança.
  async function askAI(
    campoAlvo: (typeof EXPLORACAO)[number],
    resposta: string,
    respostas: Record<string, string>
  ) {
    setTyping(true);
    let message = "";
    try {
      const res = await fetch("/api/ai/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          field: campoAlvo,
          lastMessage: resposta,
          answers: respostas,
          preferredName: store.currentProfile?.preferred_name,
        }),
      });
      const data = await res.json();
      message = typeof data?.message === "string" ? data.message : "";
    } catch {
      message = "";
    }
    setTyping(false);
    if (!message) message = "Me conta um pouco mais sobre isso.";
    setStep(campoAlvo);
    persist("assistant", message, campoAlvo);
  }

  // A pessoa travou: repetimos o mesmo ponto por outro caminho, sem guardar a resposta.
  function travou(texto: string) {
    return /^\s*(n[ãa]o sei|sei l[áa]|n[ãa]o entendi|n[ãa]o fa[çc]o ideia|sla|nada)\b/i.test(texto);
  }

  // Guarda a resposta e segue para o próximo ponto (ou para as áreas de vida).
  function avancar(campo: (typeof EXPLORACAO)[number], value: string) {
    const next = { ...answers, [campo]: value };
    setAnswers(next);
    persist("user", value, step);
    setDraft("");
    if (travou(value)) {
      void askAI(campo, value, next); // mesmo ponto, outra abordagem
      return;
    }
    const proximo = EXPLORACAO[EXPLORACAO.indexOf(campo) + 1];
    if (proximo) {
      void askAI(proximo, value, next);
    } else {
      setStep("impact_area");
      persist("assistant", "Onde tu sentiria isso primeiro?", "impact_area", LIFE_IMPACT_DIMENSIONS.map((d) => d.label));
    }
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
    if (step === "difference" || step === "pain" || step === "identity") {
      avancar(step as (typeof EXPLORACAO)[number], value);
    }
    else if (step === "meaning") {
      const next = { ...answers, meaning: value };
      setAnswers(next); persist("user", value, step); setDraft("");
      // Antes de seguir, devolvemos a síntese como HIPÓTESE, para ela confirmar.
      ask("hypothesis", hypothesisFor(next), ["Faz sentido", "Mais ou menos", "Não é bem isso"]);
    } else if (step === "anchor") {
      answer("anchor", value, "meal_name", "Agora me diz: qual refeição tu quer que eu acompanhe primeiro?");
    } else if (step === "correction") {
      const next = { ...answers, meaning: value };
      setAnswers(next); persist("user", value, step); setDraft("");
      void askAI("identity", value, next);
    }
    else if (step === "impact") {
      const key = areaRef.current || "geral";
      const next = { ...impacts, [key]: value };
      setImpacts(next);
      persist("user", value, step);
      setDraft("");
      const restantes = LIFE_IMPACT_DIMENSIONS.filter((d) => !next[d.key]);
      if (restantes.length === 0 || Object.keys(next).length >= 3) {
        ask("anchor", "Última coisa: que frase tu diria pra ti num momento difícil?");
      } else {
        ask("impact_more", "Tem mais alguma área?", [...restantes.map((d) => d.label), "Só essa por enquanto"]);
      }
    }
    
    else if (step === "meal_name") { setAnswers((current) => ({ ...current, meal_name: value })); persist("user", value, step); setDraft(""); ask("meal_time", `Que horas costuma ser ${lowerFirst(value)}?`); }
  }

  function choose(value: string) {
    if (step === "goal") {
      const next = { ...answers, goal: value };
      setAnswers(next);
      persist("user", value, step);
      void askAI("difference", value, next);
    }
    else if (step === "hypothesis") {
      persist("user", value, step);
      if (value === "Faz sentido") { const next = { ...answers, hypothesis_confirmed: "true" }; setAnswers(next); void askAI("identity", "confirmou a síntese", next); }
      else ask("correction", "Tudo bem. Como tu diria isso com tuas palavras?");
    } else if (step === "impact_area" || step === "impact_more") {
      if (value === "Só essa por enquanto") {
        persist("user", value, step);
        ask("anchor", "Última coisa: que frase tu diria pra ti num momento difícil?");
        return;
      }
      const dim = LIFE_IMPACT_DIMENSIONS.find((d) => d.label === value);
      areaRef.current = dim?.key || "geral";
      persist("user", value, step);
      ask("impact", dim ? dim.prompt : "O que mudaria nessa parte da vida?");
    } else if (step === "reminder") { setAnswers((current) => ({ ...current, reminder: value })); persist("user", value, step); ask("terms", "Por último: preciso da tua autorização para guardar estas conversas e usar no teu acompanhamento."); }
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
      life_impacts: impacts,
      meals: [{ name: answers.meal_name || "Refeição", time_of_day: mealTime, days_of_week: days, reminder_enabled: answers.reminder === "Sim, quero" }],
    };
    store.completeOnboarding(data);
    if (conversationId.current) store.closeConversation(conversationId.current, `Norte inicial: ${data.why_it_matters || data.goal_description}`);
    router.push("/app/hoje");
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await store.logout();
    router.replace("/");
    router.refresh();
  }

  const textSteps = ["difference", "pain", "meaning", "correction", "identity", "impact", "anchor", "meal_name"].includes(step);
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-[#fcfbf8] px-4 sm:px-6">
      <header className="flex h-16 items-center justify-between border-b border-warmgray-100">
        <div><p className="font-semibold text-sage-800">Metanóia</p><p className="text-xs text-warmgray-500">Tua primeira conversa</p></div>
        <button
          type="button"
          className="text-sm font-medium text-warmgray-500 transition-colors hover:text-sage-700 disabled:cursor-wait disabled:opacity-60"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="Sair e voltar para o login"
        >
          {loggingOut ? "Saindo..." : "Sair"}
        </button>
      </header>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-6">
        {bubbles.map((bubble, index) => <div key={index} className={`flex ${bubble.from === "user" ? "justify-end" : "justify-start"}`}><div className={bubble.from === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}>{bubble.text}</div></div>)}
        {typing && <div className="chat-bubble-assistant w-fit"><TypingDots /></div>}
      </div>
      <div className="sticky bottom-0 border-t border-warmgray-100 bg-[#fcfbf8] py-4">
        {step === "goal" && <Choices options={GOALS} onChoose={choose} />}
        {step === "hypothesis" && <Choices options={["Faz sentido", "Mais ou menos", "Não é bem isso"]} onChoose={choose} />}
        {step === "impact_area" && <Choices options={LIFE_IMPACT_DIMENSIONS.map((d) => d.label)} onChoose={choose} />}
        {step === "impact_more" && <Choices options={[...LIFE_IMPACT_DIMENSIONS.filter((d) => !impacts[d.key]).map((d) => d.label), "Só essa por enquanto"]} onChoose={choose} />}
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
function hypothesisFor(answers: Record<string, string>) { return `Deixa eu ver se entendi: ${(answers.goal || "mudar").toLowerCase()} é parte do caminho, mas o que importa mesmo é ${lowerFirst(answers.meaning || answers.difference || "ter mais tranquilidade")}. Faz sentido ou viajei?`; }
