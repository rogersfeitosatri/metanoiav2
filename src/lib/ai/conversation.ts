// Conversa adaptativa do Metanoia.
//
// A estrutura interna (situação → estado físico → pensamento → emoção → impulso →
// comportamento → consequência → ponto de decisão → nova possibilidade) é só um mapa
// nosso. A pessoa NUNCA precisa percorrer todas as etapas: a cada resposta decidimos
// qual é a próxima pergunta útil — ou se já dá para fechar.
//
// Este motor é determinístico e funciona sem chave de API. Quando há LLM configurado,
// a rota /api/ai/converse melhora a redação, mas preenche exatamente os mesmos campos,
// então a persistência é idêntica nos dois caminhos.

import type { RecoveryOutcome } from "../types";

export type Slot =
  | "situation"
  | "hunger"
  | "thought"
  | "emotion"
  | "behavior"
  | "consequence"
  | "recovery"
  | "alternative"
  | "belief"
  | "strategy"
  | "done";

export interface ConversationState {
  situation?: string;
  hunger_level?: number | null;
  noticed_hunger_early?: boolean;
  automatic_thought?: string;
  thought_self_identified?: boolean;
  emotion?: string;
  emotion_self_identified?: boolean;
  behavior?: string;
  consequence?: string;
  recovery_outcome?: RecoveryOutcome;
  all_or_nothing?: boolean;
  guilt_level?: number | null;
  alternative?: string;
  belief_level?: number | null;
  strategy?: string;
  /** Quantas perguntas já fizemos — para não virar interrogatório. */
  asked: Slot[];
}

export interface Turn {
  /** O que o assistente diz agora. */
  message: string;
  /** Campo que a próxima resposta vai preencher. */
  slot: Slot;
  /** Sugestões clicáveis (a pessoa sempre pode escrever livremente). */
  quickReplies?: string[];
  /** Escala 0–10 em vez de texto. */
  scale?: boolean;
  /** Encerra a conversa depois desta mensagem. */
  closing?: boolean;
}

// ---------- Detecção de sinais no texto livre ----------

const RE = {
  fomeAlta: /muita fome|morrendo de fome|faminta?o?|sem comer|não almocei|nao almocei|pulei (o )?(almoço|almoco|café|cafe|jantar)|horas sem/i,
  emocional: /ansios|estress|nervos|briga|brigu|triste|chate|raiva|irrit|frustr|sozinh|entedia|tédio|tedio|cansad|angústia|angustia/i,
  impulso: /impulso|sem pensar|automátic|automatic|nem percebi|do nada|de repente/i,
  vontade: /vontade|desejo|fissura|doce|chocolate|queria muito/i,
  culpa: /culpa|arrepend|me odeio|fracass|vergonha|nojo/i,
  tudoOuNada: /estraguei tudo|já que|ja que|tanto faz|perdi o dia|acabou mesmo|foda-se|amanhã começo|amanha comeco/i,
  compensar: /compens|pular|jejum|malhar|treinar|vomit|laxante|não vou comer|nao vou comer/i,
  perdaControle: /perdi o controle|não consegui parar|nao consegui parar|sem parar|descontrol/i,
};

export interface Signals {
  fome: boolean;
  emocional: boolean;
  impulso: boolean;
  vontade: boolean;
  culpa: boolean;
  tudoOuNada: boolean;
  compensar: boolean;
  perdaControle: boolean;
}

export function detectSignals(text: string): Signals {
  return {
    fome: RE.fomeAlta.test(text),
    emocional: RE.emocional.test(text),
    impulso: RE.impulso.test(text),
    vontade: RE.vontade.test(text),
    culpa: RE.culpa.test(text),
    tudoOuNada: RE.tudoOuNada.test(text),
    compensar: RE.compensar.test(text),
    perdaControle: RE.perdaControle.test(text),
  };
}

// ---------- Aberturas ----------

/** Caminhos oferecidos na entrada da conversa — o app conduz, a pessoa não precisa descobrir. */
export const ENTRY_OPTIONS = [
  "Aconteceu uma coisa agora",
  "Comi mais do que eu queria",
  "Tô com uma vontade forte",
  "Tô me sentindo culpado",
  "Acho que comi por emoção",
  "Quero entender uma situação",
  "Quero evitar que aconteça de novo",
];

export function openingMessage(preferredName?: string): Turn {
  return {
    message: preferredName
      ? `Oi, ${preferredName}. O que tá acontecendo?`
      : "Oi. O que tá acontecendo?",
    slot: "situation",
    quickReplies: ENTRY_OPTIONS,
  };
}

// ---------- Núcleo adaptativo ----------

/**
 * Decide a próxima pergunta a partir do que já sabemos e do que a pessoa acabou de dizer.
 * A ordem NÃO é fixa: os sinais do relato mudam o caminho.
 */
export function nextTurn(state: ConversationState, lastMessage: string): Turn {
  const s = detectSignals(`${lastMessage} ${state.situation || ""}`);
  const asked = new Set(state.asked);

  // 1) Sem situação ainda: pedir o relato.
  if (!state.situation) {
    return {
      message: "Tá. Me conta o que aconteceu.",
      slot: "situation",
    };
  }

  // 2) Estado físico primeiro quando o relato sugere fome — antes de psicologizar.
  //    (Ex.: "cheguei em casa e comi tudo que vi pela frente")
  if (state.hunger_level == null && !asked.has("hunger") && (s.fome || !s.emocional)) {
    return {
      message: "Antes disso — tua fome tava quanto, de 0 a 10?",
      slot: "hunger",
      scale: true,
    };
  }

  // 3) Se a fome estava muito alta, nomeia o fator objetivo e não vira análise emocional.
  if (
    state.hunger_level != null &&
    state.hunger_level >= 8 &&
    !asked.has("thought") &&
    !s.emocional
  ) {
    return {
      message: `Então antes de chamar isso de falta de controle: tu chegou nesse momento tentando decidir alguma coisa com fome ${state.hunger_level}/10. Isso muda bastante o jogo. Passou alguma frase pela tua cabeça na hora?`,
      slot: "thought",
      quickReplies: ["Não lembro", "Não sei dizer", ...THOUGHT_EXAMPLES.slice(0, 3)],
    };
  }

  // 4) Emoção primeiro quando o relato é claramente emocional.
  if (s.emocional && !state.emotion && !asked.has("emotion")) {
    return {
      message: "O que tu tava sentindo bem ali, antes de comer?",
      slot: "emotion",
      quickReplies: ["Ansiedade", "Raiva", "Tristeza", "Frustração", "Tédio", "Não sei nomear"],
    };
  }

  // 5) Pensamento automático — sem colocar palavras na boca da pessoa.
  if (!state.automatic_thought && !asked.has("thought")) {
    return {
      message: "Teve alguma frase que passou pela tua cabeça nessa hora?",
      slot: "thought",
      quickReplies: ["Não lembro", "Não sei dizer"],
    };
  }

  // 5b) A pessoa não conseguiu nomear: aí sim oferecemos exemplos, só para reconhecer.
  if (
    state.automatic_thought &&
    /^(não lembro|nao lembro|não sei|nao sei|sei lá|sei la)/i.test(state.automatic_thought) &&
    !asked.has("thought_examples" as Slot)
  ) {
    return {
      message: "Tranquilo. Alguma dessas se parece com o que passou?",
      slot: "thought",
      quickReplies: [...THOUGHT_EXAMPLES, "Nenhuma dessas"],
    };
  }

  // 6) Emoção (se ainda não temos e já falamos do pensamento).
  if (!state.emotion && !asked.has("emotion")) {
    return {
      message: "E o que tu tava sentindo nesse momento?",
      slot: "emotion",
      quickReplies: ["Ansiedade", "Raiva", "Tristeza", "Frustração", "Tédio", "Culpa", "Não sei nomear"],
    };
  }

  // 7) Tudo-ou-nada: questionamento socrático em vez de frase de efeito.
  if (hasAllOrNothing(state, s) && !state.alternative && !asked.has("alternative")) {
    const t = state.automatic_thought || "já estraguei tudo";
    if (!asked.has("consequence")) {
      return {
        message: `Quando tu fala “${shorten(t)}” — o que exatamente foi estragado?`,
        slot: "consequence",
      };
    }
    return {
      message:
        "Uma refeição ter saído diferente significa necessariamente que a próxima também precisa sair?",
      slot: "alternative",
      quickReplies: ["Não, não precisa", "Na prática acaba saindo", "Nunca pensei nisso"],
    };
  }

  // 8) O que aconteceu depois — desfecho é o que mais importa para nós.
  if (!state.recovery_outcome && !asked.has("recovery")) {
    return {
      message: "E depois disso, como foi o resto do dia?",
      slot: "recovery",
      quickReplies: [
        "Segui normalmente depois",
        "Demorei, mas retomei",
        "Acabei largando o resto do dia",
        "Tentei compensar depois",
      ],
    };
  }

  // 9) Construir o pensamento alternativo — a pessoa é quem formula.
  if (state.automatic_thought && !state.alternative && !asked.has("alternative")) {
    return {
      message: `Qual seria uma forma mais justa de olhar pra isso? Do teu jeito, não precisa ser bonito.`,
      slot: "alternative",
    };
  }

  // 10) Quanto ela acredita nessa nova leitura (mede se é real ou só bonita).
  if (state.alternative && state.belief_level == null && !asked.has("belief")) {
    return {
      message: "De 0 a 10, quanto tu acredita nisso agora?",
      slot: "belief",
      scale: true,
    };
  }

  // 11) Fechamento com algo concreto para a próxima vez.
  if (!state.strategy && !asked.has("strategy")) {
    return {
      message: "Se acontecer parecido de novo, tem uma coisa pequena que dá pra fazer diferente?",
      slot: "strategy",
      quickReplies: buildStrategySuggestions(state, s),
    };
  }

  return {
    message: closingLine(state),
    slot: "done",
    closing: true,
  };
}

const THOUGHT_EXAMPLES = [
  "Já estraguei tudo",
  "Só hoje",
  "Eu mereço",
  "Depois eu compenso",
  "Não consigo me controlar",
  "Já que comecei, tanto faz",
  "Amanhã começo de novo",
];

function shorten(t: string): string {
  return t.length > 40 ? t.slice(0, 40).trim() + "…" : t.replace(/\.$/, "");
}

function hasAllOrNothing(state: ConversationState, s: Signals): boolean {
  return Boolean(state.all_or_nothing) || s.tudoOuNada ||
    RE.tudoOuNada.test(state.automatic_thought || "");
}

function buildStrategySuggestions(state: ConversationState, s: Signals): string[] {
  const out: string[] = [];
  if ((state.hunger_level ?? 0) >= 7 || s.fome) {
    out.push("Comer alguma coisa antes de chegar nesse horário");
    out.push("Reparar na fome no meio da tarde");
  }
  if (s.emocional || state.emotion) out.push("Perceber a emoção antes de decidir");
  if (s.impulso || s.vontade) out.push("Esperar alguns minutos antes de decidir");
  out.push("Retomar na próxima refeição, sem compensar");
  return [...new Set(out)].slice(0, 4);
}

function closingLine(state: ConversationState): string {
  if (state.alternative) {
    return `Fechou. Guardei isso: “${shorten(state.alternative)}”. Quando aparecer situação parecida, eu te lembro pra gente ver se funcionou.`;
  }
  return "Fechou. Guardei essa situação. Se acontecer parecido, é só voltar aqui.";
}

/** Aplica a resposta da pessoa ao slot correspondente. */
export function applyAnswer(
  state: ConversationState,
  slot: Slot,
  raw: string,
  numeric?: number
): ConversationState {
  const next: ConversationState = { ...state, asked: [...state.asked, slot] };
  const s = detectSignals(raw);

  switch (slot) {
    case "situation":
      next.situation = raw;
      if (s.tudoOuNada) next.all_or_nothing = true;
      break;
    case "hunger":
      next.hunger_level = numeric ?? null;
      // Perceber a fome cedo = não ter chegado no limite.
      if (numeric != null) next.noticed_hunger_early = numeric <= 6;
      break;
    case "thought": {
      const naoSabe = /^(não lembro|nao lembro|não sei|nao sei|sei lá|sei la|nenhuma dessas)/i.test(raw);
      if (!naoSabe) {
        next.automatic_thought = raw;
        // Se veio da lista de exemplos, não foi identificação espontânea.
        next.thought_self_identified = !THOUGHT_EXAMPLES.includes(raw);
        if (RE.tudoOuNada.test(raw)) next.all_or_nothing = true;
      } else {
        next.automatic_thought = raw; // guarda o "não lembro" para ramificar
        next.thought_self_identified = false;
      }
      break;
    }
    case "emotion": {
      const naoSabe = /não sei nomear|nao sei nomear/i.test(raw);
      next.emotion = naoSabe ? undefined : raw;
      next.emotion_self_identified = !naoSabe;
      if (s.culpa) next.guilt_level = 7;
      break;
    }
    case "behavior":
      next.behavior = raw;
      break;
    case "consequence":
      next.consequence = raw;
      break;
    case "recovery":
      next.recovery_outcome = mapRecovery(raw);
      break;
    case "alternative":
      next.alternative = raw;
      break;
    case "belief":
      next.belief_level = numeric ?? null;
      break;
    case "strategy":
      next.strategy = raw;
      break;
  }
  return next;
}

function mapRecovery(raw: string): RecoveryOutcome {
  if (/segui normalmente|retomei na próxima|retomei na proxima|normal/i.test(raw)) return "retomou";
  if (/demorei/i.test(raw)) return "retomou_depois";
  if (/larg|abandon|resto do dia|desisti/i.test(raw)) return "abandonou_dia";
  if (/compens|pulei|jejum|treinar|malhar/i.test(raw)) return "compensou";
  return "indefinido";
}

export function emptyState(): ConversationState {
  return { asked: [] };
}
