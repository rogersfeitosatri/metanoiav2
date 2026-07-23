// Motor de fluxo conversacional determinístico (orquestrador + TCC + EM + estratégias).
// Conduz a conversa em etapas, uma pergunta por vez, acolhendo antes de investigar.
// Cada passo produz uma mensagem do assistente e respostas rápidas opcionais.

import {
  DIFFICULTY_REASONS,
  AUTOMATIC_THOUGHTS,
  EMOTIONS,
  CONSEQUENCES,
  DECISION_POINTS,
  IMMEDIATE_HELP_FEELINGS,
} from "../labels";

export type StepKind = "single" | "multi" | "scale" | "text" | "info";

export interface FlowStep {
  id: string;
  kind: StepKind;
  message: (ctx: FlowContext) => string;
  options?: (ctx: FlowContext) => string[];
  field?: string; // onde guardar a resposta em answers
  allowFreeText?: boolean;
  skippable?: boolean;
}

export interface FlowContext {
  answers: Record<string, unknown>;
  preferredName?: string;
  copingReminder?: string;
  effectiveStrategies?: string[]; // estratégias que já ajudaram o usuário
}

export interface FlowDefinition {
  id: string;
  title: string;
  steps: FlowStep[];
}

// ---------- Fluxo de dificuldade (seção 12) ----------
export const DIFFICULTY_FLOW: FlowDefinition = {
  id: "difficulty",
  title: "Entender o que aconteceu",
  steps: [
    {
      id: "reasons",
      kind: "multi",
      field: "reasons",
      allowFreeText: true,
      message: () => "O que mais influenciou essa escolha? Pode marcar mais de um.",
      options: () => DIFFICULTY_REASONS,
    },
    {
      id: "synthesis",
      kind: "info",
      message: (ctx) => {
        const reasons = (ctx.answers.reasons as string[]) || [];
        const clean = reasons.map((r) => r.replace(/\.$/, "").toLowerCase());
        if (clean.length === 0) return "Entendi. Vamos com calma tentar compreender esse momento.";
        if (clean.length === 1) return `Entendi. Tu estava ${clean[0]}.`;
        const last = clean[clean.length - 1];
        return `Entendi. Tu estava ${clean.slice(0, -1).join(", ")} e ${last}.`;
      },
    },
    {
      id: "situation",
      kind: "text",
      field: "situation",
      allowFreeText: true,
      message: () => "O que estava acontecendo naquele momento?",
    },
    {
      id: "thought",
      kind: "single",
      field: "automatic_thought",
      allowFreeText: true,
      message: () => "O que passou pela tua cabeça?",
      options: () => AUTOMATIC_THOUGHTS,
    },
    {
      id: "emotion",
      kind: "single",
      field: "emotion",
      allowFreeText: true,
      message: () => "Qual emoção estava mais presente?",
      options: () => EMOTIONS,
    },
    {
      id: "emotion_intensity",
      kind: "scale",
      field: "emotional_intensity",
      message: (ctx) =>
        `De 0 a 10, quão intensa estava a ${((ctx.answers.emotion as string) || "emoção").toLowerCase()}?`,
    },
    {
      id: "behavior",
      kind: "text",
      field: "behavior",
      allowFreeText: true,
      skippable: true,
      message: () => "O que tu acabou fazendo? (podes descrever com tuas palavras)",
    },
    {
      id: "consequence",
      kind: "single",
      field: "consequences",
      allowFreeText: true,
      message: () => "O que aconteceu depois dessa escolha?",
      options: () => CONSEQUENCES,
    },
    {
      id: "decision_point",
      kind: "single",
      field: "decision_point",
      message: () =>
        "Em que momento ainda existia alguma possibilidade de fazer diferente?",
      options: () => DECISION_POINTS,
    },
    {
      id: "cognitive_bridge",
      kind: "info",
      message: (ctx) => {
        const t = (ctx.answers.automatic_thought as string) || "";
        if (/estraguei tudo/i.test(t)) {
          return "Uma escolha diferente do planejado realmente determina todas as próximas escolhas? Talvez ela seja só um ponto no meio do caminho, e não o fim dele.";
        }
        if (/compenso|compensar/i.test(t)) {
          return "A próxima escolha não precisa ser uma punição nem uma continuação do que aconteceu. Ela pode simplesmente recomeçar.";
        }
        return "Faz sentido o que tu contou. Vamos pensar em algo possível para uma próxima vez parecida?";
      },
    },
    {
      id: "strategy",
      kind: "single",
      field: "strategy_choice",
      allowFreeText: true,
      message: () =>
        "Pensando em uma situação parecida, qual dessas ações parece mais possível?",
      options: (ctx) => {
        const base = [
          "Verificar uma alternativa antes de sair.",
          "Levar uma opção prática.",
          "Fazer uma pausa antes de decidir.",
          "Observar a fome em um horário anterior.",
          "Retomar na próxima refeição sem compensar.",
        ];
        // Módulo de estratégias: prioriza o que já ajudou o usuário.
        const effective = ctx.effectiveStrategies || [];
        const prioritized = [...effective.filter((e) => !base.includes(e)), ...base];
        return [...prioritized.slice(0, 5), "Criar minha própria estratégia."];
      },
    },
    {
      id: "commitment",
      kind: "text",
      field: "commitment",
      allowFreeText: true,
      message: (ctx) => {
        const s = (ctx.answers.strategy_choice as string) || "essa estratégia";
        return `Como tu resumiria isso num compromisso simples? Por exemplo: "Na próxima vez, vou ${s
          .replace(/\.$/, "")
          .toLowerCase()}".`;
      },
    },
    {
      id: "closing",
      kind: "info",
      message: () =>
        "Registrei teu compromisso. Mais pra frente vou te perguntar se conseguiu testar. Uma dificuldade de cada vez, tu está indo bem.",
    },
  ],
};

// ---------- Fluxo "Preciso de ajuda agora" (seção 14) ----------
export const IMMEDIATE_HELP_FLOW: FlowDefinition = {
  id: "immediate_help",
  title: "Preciso de ajuda agora",
  steps: [
    {
      id: "feeling",
      kind: "single",
      field: "feeling",
      message: () => "O que está mais forte agora?",
      options: () => IMMEDIATE_HELP_FEELINGS,
    },
    {
      id: "intensity",
      kind: "scale",
      field: "intensity",
      message: () => "De 0 a 10, quanto isso está intenso?",
    },
    {
      id: "thought",
      kind: "single",
      field: "thought",
      allowFreeText: true,
      message: (ctx) => {
        const f = (ctx.answers.feeling as string) || "";
        if (/impulso|vontade/i.test(f)) return "Qual pensamento está passando pela tua cabeça?";
        if (/culpa/i.test(f)) return "Que pensamento está pesando mais agora?";
        return "O que está passando pela tua cabeça neste momento?";
      },
      options: () => [
        "Só hoje.",
        "Já estraguei tudo.",
        "Eu mereço.",
        "Depois eu compenso.",
        "Não vou conseguir resistir.",
        "Preciso resolver isso agora.",
      ],
    },
    {
      id: "intervention",
      kind: "info",
      // Seleciona apenas uma intervenção principal por vez.
      message: (ctx) => {
        const f = ((ctx.answers.feeling as string) || "").toLowerCase();
        const t = ((ctx.answers.thought as string) || "").toLowerCase();
        if (/culpa|estraguei/i.test(f + t)) {
          return "O que aconteceu já passou. A próxima escolha não precisa ser uma punição nem uma continuação do que aconteceu.";
        }
        if (/impulso|vontade/i.test(f)) {
          return "Antes de decidir, vamos criar um intervalo de dois minutos. Tu não precisa prometer que não vai comer. Apenas adiar a decisão e observar o que muda.";
        }
        if (/ansiedade|estresse/i.test(f)) {
          return "Antes de pensar no que fazer com a comida, vamos dar nome ao que tu está sentindo. Respira fundo uma vez. O que essa emoção está tentando te dizer?";
        }
        if (/preparar/i.test(f)) {
          return "O que tu pode organizar agora para deixar a próxima decisão mais fácil?";
        }
        return "Vamos com calma. Antes de decidir qualquer coisa, um intervalo curto costuma ajudar a enxergar melhor.";
      },
    },
    {
      id: "next_action",
      kind: "single",
      field: "next_action",
      message: () => "O que tu quer fazer agora?",
      options: () => [
        "Seguir o que havia planejado.",
        "Fazer uma escolha diferente de forma consciente.",
        "Esperar mais um pouco.",
        "Preparar uma alternativa.",
        "Preciso continuar conversando.",
      ],
    },
    {
      id: "closing",
      kind: "info",
      message: (ctx) => {
        const a = (ctx.answers.next_action as string) || "";
        if (/continuar conversando/i.test(a))
          return "Tudo bem, estou aqui. Me conta um pouco mais do que está acontecendo.";
        return "Combinado. Seja qual for a escolha, ela não define o resto do teu dia. Tu deu um passo importante só de parar pra pensar.";
      },
    },
  ],
};

export const FLOWS: Record<string, FlowDefinition> = {
  difficulty: DIFFICULTY_FLOW,
  immediate_help: IMMEDIATE_HELP_FLOW,
};

export function getFlow(id: string): FlowDefinition | undefined {
  return FLOWS[id];
}
