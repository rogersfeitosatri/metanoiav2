"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, type OnboardingData } from "@/lib/store";
import { ChipGroup, ProgressBar } from "@/components/ui";
import { GOAL_OPTIONS, HARD_MOMENTS, MAIN_DIFFICULTIES } from "@/lib/labels";
import { TERMS_TEXT } from "@/lib/demo-data";

type StepId =
  | "intro"
  | "name"
  | "goal"
  | "moments"
  | "difficulties"
  | "times"
  | "commitment"
  | "terms"
  | "done";

const ORDER: StepId[] = [
  "intro",
  "name",
  "goal",
  "moments",
  "difficulties",
  "times",
  "commitment",
  "terms",
  "done",
];

export default function OnboardingPage() {
  const store = useStore();
  const router = useRouter();
  const [idx, setIdx] = useState(0);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState<string[]>([]);
  const [goalOther, setGoalOther] = useState("");
  const [moments, setMoments] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [noTimes, setNoTimes] = useState(false);
  const [newTime, setNewTime] = useState("16:30");
  const [commitment, setCommitment] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (store.ready && !store.currentProfile) router.replace("/");
    if (store.currentProfile) setName(store.currentProfile.preferred_name || "");
  }, [store.ready, store.currentProfile, router]);

  const step = ORDER[idx];
  const progress = Math.round((idx / (ORDER.length - 1)) * 100);

  function next() {
    setIdx((i) => Math.min(i + 1, ORDER.length - 1));
  }
  function back() {
    setIdx((i) => Math.max(i - 1, 0));
  }

  function finish() {
    const goalValue = GOAL_OPTIONS.find((g) => goal.includes(g.label));
    const data: OnboardingData = {
      preferred_name: name.trim() || "amigo",
      goal_type: goalValue?.value || "outro",
      goal_description: goalValue?.value === "outro" || !goalValue ? goalOther : goalValue.label,
      hard_moments: moments,
      difficulties,
      support_times: noTimes ? [] : times,
      first_commitment: commitment.trim(),
      accepted_terms: accepted,
    };
    store.completeOnboarding(data);
    if (commitment.trim()) {
      store.addStrategyTrial({
        user_id: store.currentUserId!,
        title_snapshot: commitment.trim(),
        result: "not_tested",
      });
    }
    router.push("/app/hoje");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <div className="mb-6">
        <ProgressBar value={progress} />
      </div>

      <div className="flex-1">
        {step === "intro" && (
          <Screen
            title="Bem-vindo ao Metanóia"
            body="O Metanóia não cria dietas, não conta calorias e não fiscaliza tuas refeições. Ele vai te ajudar a entender o que dificulta tuas escolhas e construir estratégias para os momentos mais difíceis."
          />
        )}

        {step === "name" && (
          <Screen title="Como tu prefere ser chamado?">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teu nome ou apelido"
              autoFocus
            />
          </Screen>
        )}

        {step === "goal" && (
          <Screen title="O que tu mais gostaria de transformar na tua relação com a alimentação?">
            <ChipGroup options={GOAL_OPTIONS.map((g) => g.label)} value={goal} onChange={(v) => setGoal(v.slice(-1))} />
            {goal.includes("Outro.") && (
              <input
                className="input mt-3"
                value={goalOther}
                onChange={(e) => setGoalOther(e.target.value)}
                placeholder="Conta com tuas palavras…"
              />
            )}
          </Screen>
        )}

        {step === "moments" && (
          <Screen title="Em quais momentos costuma ficar mais difícil?" subtitle="Podes marcar vários.">
            <ChipGroup options={HARD_MOMENTS} value={moments} multi onChange={setMoments} />
          </Screen>
        )}

        {step === "difficulties" && (
          <Screen title="O que costuma dificultar tuas escolhas?" subtitle="Podes marcar vários.">
            <ChipGroup options={MAIN_DIFFICULTIES} value={difficulties} multi onChange={setDifficulties} />
          </Screen>
        )}

        {step === "times" && (
          <Screen title="Em quais horários uma mensagem poderia te ajudar?">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {times.map((t) => (
                  <span key={t} className="chip chip-selected">
                    {t}
                    <button className="ml-2 text-sage-600" onClick={() => setTimes(times.filter((x) => x !== t))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="time"
                  className="input"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  disabled={noTimes}
                />
                <button
                  className="btn-secondary"
                  disabled={noTimes}
                  onClick={() => {
                    if (newTime && !times.includes(newTime)) setTimes([...times, newTime]);
                  }}
                >
                  Adicionar
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-warmgray-600">
                <input type="checkbox" checked={noTimes} onChange={(e) => setNoTimes(e.target.checked)} />
                Não quero mensagens por enquanto.
              </label>
            </div>
          </Screen>
        )}

        {step === "commitment" && (
          <Screen title="Qual pequena atitude tu gostaria de tentar nesta semana?">
            <textarea
              className="input min-h-[100px]"
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              placeholder="Ex.: verificar se tenho um lanche pronto antes de sair do trabalho."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {["Fazer uma pausa antes de decidir.", "Deixar um lanche pronto.", "Observar a fome mais cedo."].map(
                (s) => (
                  <button key={s} className="chip" onClick={() => setCommitment(s)}>
                    {s}
                  </button>
                )
              )}
            </div>
          </Screen>
        )}

        {step === "terms" && (
          <Screen title="Termos e Condições">
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-warmgray-100 bg-white p-3 text-xs leading-relaxed text-warmgray-600">
              {TERMS_TEXT}
            </pre>
            <label className="mt-3 flex items-start gap-3 text-sm text-warmgray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              Li e aceito os Termos e Condições e a Política de Privacidade.
            </label>
          </Screen>
        )}

        {step === "done" && (
          <Screen
            title="Tudo pronto"
            body="A partir de agora, cada dificuldade pode se tornar uma oportunidade de entender melhor o que acontece contigo."
          />
        )}
      </div>

      <div className="mt-6 flex gap-2">
        {idx > 0 && step !== "done" && (
          <button className="btn-ghost" onClick={back}>
            Voltar
          </button>
        )}
        {step === "terms" ? (
          <button className="btn-primary flex-1" disabled={!accepted} onClick={next}>
            Continuar
          </button>
        ) : step === "done" ? (
          <button className="btn-primary flex-1" onClick={finish}>
            Começar
          </button>
        ) : (
          <button
            className="btn-primary flex-1"
            disabled={step === "name" && !name.trim()}
            onClick={next}
          >
            Continuar
          </button>
        )}
      </div>
    </main>
  );
}

function Screen({
  title,
  subtitle,
  body,
  children,
}: {
  title: string;
  subtitle?: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold leading-snug text-sage-800">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-warmgray-500">{subtitle}</p>}
      {body && <p className="mt-3 leading-relaxed text-warmgray-600">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
