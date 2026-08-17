// Rótulos em português do Brasil e opções dos fluxos. Centralizados para consistência.
import type {
  MealType,
  CheckinStatus,
  GoalType,
  TrialResult,
  RiskCategory,
  ConversationType,
  StrategyCategory,
} from "./types";

export const MEAL_LABELS: Record<MealType, string> = {
  cafe_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
  outra: "Outra",
};

export const CHECKIN_STATUS_LABELS: Record<CheckinStatus, string> = {
  completed: "Realizei",
  partial: "Realizei parcialmente",
  not_completed: "Não realizei",
};

export const CHECKIN_STATUS_EMOJI: Record<CheckinStatus, string> = {
  completed: "✅",
  partial: "🟡",
  not_completed: "❌",
};

export const GOAL_OPTIONS: { value: GoalType; label: string }[] = [
  { value: "seguir_plano", label: "Seguir melhor meu plano alimentar." },
  { value: "diminuir_impulso", label: "Diminuir decisões por impulso." },
  { value: "ansiedade_comida", label: "Lidar melhor com ansiedade e comida." },
  { value: "reduzir_perda_controle", label: "Reduzir episódios de perda de controle." },
  { value: "organizacao", label: "Ter mais organização." },
  { value: "parar_de_desistir", label: "Parar de desistir depois de sair da rotina." },
  { value: "outro", label: "Outro." },
];

export const HARD_MOMENTS = [
  "Ao acordar.",
  "Durante o trabalho.",
  "No final da tarde.",
  "Depois do jantar.",
  "Durante a madrugada.",
  "Nos finais de semana.",
  "Quando estou sozinho.",
  "Quando estou ansioso.",
  "Em eventos sociais.",
  "Depois de sair do planejado.",
];

export const MAIN_DIFFICULTIES = [
  "Falta de tempo.",
  "Falta do alimento planejado.",
  "Estar fora de casa.",
  "Muita fome.",
  "Ansiedade.",
  "Estresse.",
  "Vontade de doce.",
  "Comer por impulso.",
  "Perda de controle.",
  "Eventos sociais.",
  "Pensamento de “já estraguei tudo”.",
];

export const DIFFICULTY_REASONS = [
  "Não tinha o alimento planejado.",
  "Estava fora de casa.",
  "Não tive tempo.",
  "Estava com muita fome.",
  "Estava ansioso.",
  "Estava estressado ou irritado.",
  "Tive vontade de doce.",
  "Tive vontade de um alimento específico.",
  "Comi por impulso.",
  "Senti que perdi o controle ao comer.",
  "Estava em um evento social.",
  "Alguém ofereceu comida.",
  "Eu estava cansado.",
  "Eu havia bebido álcool.",
  "Pensei que já tinha estragado o dia.",
  "Pensei que poderia compensar depois.",
  "Não estava motivado.",
];

export const AUTOMATIC_THOUGHTS = [
  "Já estraguei tudo.",
  "Só hoje.",
  "Eu mereço.",
  "Depois eu compenso.",
  "Não vou conseguir.",
  "Preciso comer isso agora.",
  "Não tenho outra opção.",
];

export const EMOTIONS = [
  "Ansiedade",
  "Estresse",
  "Irritação",
  "Tristeza",
  "Culpa",
  "Tédio",
  "Cansaço",
  "Frustração",
  "Alegria",
];

export const CONSEQUENCES = [
  "Senti alívio.",
  "Senti culpa.",
  "Continuei comendo.",
  "Desisti do restante do dia.",
  "Tentei compensar.",
  "Não mudou muita coisa.",
];

export const DECISION_POINTS = [
  "Antes de sair de casa.",
  "Quando percebi a fome aumentando.",
  "Quando surgiu o pensamento.",
  "Antes de começar a comer.",
  "Durante a refeição.",
  "Depois, ao decidir o que faria em seguida.",
  "Não consigo identificar.",
];

export const TRIAL_RESULT_LABELS: Record<TrialResult, string> = {
  helped: "Ajudou",
  partially_helped: "Ajudou parcialmente",
  did_not_help: "Não ajudou",
  not_tested: "Não consegui testar",
  situation_not_occurred: "A situação ainda não aconteceu",
};

export const IMMEDIATE_HELP_FEELINGS = [
  "Fome física.",
  "Ansiedade ou estresse.",
  "Vontade específica.",
  "Impulso.",
  "Culpa pelo que já comi.",
  "Pensamento de desistir.",
  "Senti que perdi o controle.",
  "Quero me preparar para mais tarde.",
  "Não sei identificar.",
];

export const CHAT_ENTRY_OPTIONS = [
  "Estou com muita fome.",
  "Estou ansioso.",
  "Estou com vontade de comer.",
  "Comi e me arrependi.",
  "Saí do planejado.",
  "Não tenho o que estava planejado.",
  "Quero me preparar para mais tarde.",
  "Quero conversar sobre outra situação.",
];

export const TODAY_STATE_OPTIONS = [
  { value: "following", label: "Estou conseguindo seguir." },
  { value: "soso", label: "Está mais ou menos." },
  { value: "hard", label: "Está difícil." },
  { value: "unthought", label: "Ainda não pensei nisso." },
];

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  perda_controle: "Perda de controle recorrente",
  compensacao: "Comportamento compensatório",
  restricao_severa: "Restrição intensa",
  culpa_intensa: "Culpa intensa",
  vomito: "Vômito provocado",
  laxante: "Uso de laxantes",
  medicamento: "Uso inadequado de medicamentos",
  exercicio_compensatorio: "Exercício compensatório",
  sofrimento_emocional: "Sofrimento emocional importante",
  autolesao: "Risco à própria segurança",
  piora: "Piora significativa",
};

export const CONVERSATION_TYPE_LABELS: Record<ConversationType, string> = {
  checkin_followup: "Registro",
  immediate_help: "Ajuda imediata",
  prevention: "Prevenção",
  onboarding: "Boas-vindas",
  coping_card: "Meu Norte",
  open_chat: "Conversa",
  strategy_review: "Avaliação de estratégia",
};

export const STRATEGY_CATEGORY_LABELS: Record<StrategyCategory, string> = {
  pausa: "Pausa consciente",
  cognitiva: "Reestruturação cognitiva",
  retorno: "Retorno sem compensar",
  preparacao: "Preparação",
  fome: "Manejo da fome",
  ambiente: "Ambiente",
  apoio: "Apoio",
  planejamento: "Planejamento",
};

// Dimensões de vida do Cartão de Enfrentamento (Meu Norte).
// "Como seguir o plano alimentar vai impactar a tua vida?"
export const LIFE_IMPACT_DIMENSIONS: {
  key: string;
  label: string;
  icon: string;
  prompt: string;
  /** Exemplos para ajudar quem não tem o hábito de falar disso.
   *  São possibilidades para reconhecer, nunca respostas impostas. */
  examples: string[];
}[] = [
  {
    key: "saude",
    label: "Saúde",
    icon: "❤️",
    prompt: "O que tu acha que mudaria na tua saúde ou no teu corpo?",
    examples: ["Dormir melhor", "Menos dores", "Mais leveza", "Exames melhores"],
  },
  {
    key: "emocional",
    label: "Emocional",
    icon: "🌊",
    prompt: "E no que tu sente? O que mudaria?",
    examples: ["Menos culpa depois de comer", "Menos ansiedade", "Mais paz nas refeições"],
  },
  {
    key: "autoestima",
    label: "Autoestima",
    icon: "✨",
    prompt: "O que mudaria no jeito que tu se enxerga?",
    examples: ["Me olhar no espelho sem me criticar", "Confiar mais em mim", "Me sentir bem em fotos"],
  },
  {
    key: "social",
    label: "Social",
    icon: "🤝",
    prompt: "E quando tu está com outras pessoas, o que mudaria?",
    examples: ["Sair sem ficar ansioso com a comida", "Aceitar convites sem medo", "Usar a roupa que eu gosto"],
  },
  {
    key: "familiar",
    label: "Familiar",
    icon: "🏠",
    prompt: "E em casa, com tua família, o que seria diferente?",
    examples: ["Dar um exemplo melhor", "Ter pique pros meus filhos", "Comer junto sem tensão"],
  },
  {
    key: "energia",
    label: "Energia e disposição",
    icon: "⚡",
    prompt: "Como estaria tua energia no dia a dia?",
    examples: ["Acordar melhor", "Não apagar depois do almoço", "Dar conta do dia inteiro"],
  },
  {
    key: "profissional",
    label: "Profissional",
    icon: "💼",
    prompt: "E no trabalho, o que mudaria?",
    examples: ["Mais foco", "Mais disposição nas reuniões", "Mais confiança pra me expor"],
  },
];

export const CURRENT_TERMS_VERSION = "1.0";
export const CURRENT_PRIVACY_VERSION = "1.0";
