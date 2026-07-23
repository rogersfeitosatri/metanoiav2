// Dados de demonstração (seção 32). Gera um banco completo e coerente para
// demonstrar telas, padrões e o painel profissional sem serviços externos.

import type {
  Database,
  Strategy,
  MealCheckin,
  DifficultyEvent,
  ThoughtRecord,
  Conversation,
  ConversationMessage,
  StrategyTrial,
} from "./types";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "./labels";

let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

function daysAgo(days: number, hour = 17, minute = 20): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const now = () => new Date().toISOString();

const USER_ID = "demo-user-mariana";
const PRO_ID = "demo-pro-laura";
const PRO_PROFILE_ID = "demo-pro-laura-profile";
const ADMIN_ID = "demo-admin";

// ---------- Estratégias globais ----------
export const GLOBAL_STRATEGIES: Strategy[] = [
  {
    id: "strat-pausa-2min",
    title: "Pausa de dois minutos",
    description: "Criar um intervalo curto entre a vontade e a ação para observar o que muda.",
    category: "pausa",
    instructions:
      "Ao sentir o impulso, não decida agora. Marque dois minutos. Respire, observe a intensidade da vontade e só então escolha, de forma consciente.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-pensamento",
    title: "Identificar o pensamento automático",
    description: "Nomear o pensamento que aparece antes da escolha difícil.",
    category: "cognitiva",
    instructions:
      "Quando a vontade surgir, pergunte-se: 'que frase está passando pela minha cabeça agora?'. Escreva. Só de nomear, o pensamento perde força.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-retorno",
    title: "Retornar na próxima escolha",
    description: "Recomeçar na próxima refeição, sem compensar.",
    category: "retorno",
    instructions:
      "Uma escolha diferente do planejado não precisa virar punição nem continuação. A próxima escolha simplesmente recomeça.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-alternativa",
    title: "Preparar uma alternativa antes de sair",
    description: "Verificar uma opção prática antes do momento de vulnerabilidade.",
    category: "preparacao",
    instructions:
      "Antes de sair do trabalho ou de casa, confira se há algo organizado para o próximo horário difícil. Uma opção simples já reduz a pressão.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-fome-cedo",
    title: "Observar a fome mais cedo",
    description: "Perceber a fome antes que ela fique muito intensa.",
    category: "fome",
    instructions:
      "Em um horário anterior ao momento crítico, observe como está tua fome. Perceber cedo evita chegar ao limite sem opção.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-plano-minimo",
    title: "Fazer um plano mínimo",
    description: "Reduzir a complexidade para o que é realmente viável no dia.",
    category: "planejamento",
    instructions:
      "Em dias corridos, escolha a versão mais simples possível do plano. O possível feito vale mais do que o perfeito não feito.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-cartao",
    title: "Relembrar o Cartão de Enfrentamento",
    description: "Retomar o que importa nos momentos difíceis.",
    category: "cognitiva",
    instructions: "Abra o Meu Norte e releia o que tu quer lembrar nos momentos difíceis.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "strat-ambiente",
    title: "Reduzir estímulos do ambiente",
    description: "Diminuir gatilhos visíveis ao redor.",
    category: "ambiente",
    instructions: "Guarde o que dispara a vontade, mude de ambiente por alguns minutos.",
    source_type: "global",
    professional_id: null,
    global: true,
    active: true,
    created_at: now(),
    updated_at: now(),
  },
];

function buildCheckins(): MealCheckin[] {
  const rows: Array<[number, MealCheckin["meal_type"], MealCheckin["status"], number, string | null]> = [
    [1, "lanche_tarde", "partial", 17, "Cheguei em casa com muita fome."],
    [1, "almoco", "completed", 12, null],
    [2, "lanche_tarde", "not_completed", 17, "Sem nada organizado."],
    [3, "jantar", "completed", 20, null],
    [3, "lanche_tarde", "partial", 17, null],
    [4, "almoco", "completed", 12, null],
    [5, "lanche_tarde", "not_completed", 18, "Dia de trabalho intenso."],
    [6, "cafe_manha", "completed", 8, null],
    [7, "lanche_tarde", "partial", 17, null],
    [8, "jantar", "completed", 20, null],
    [9, "lanche_tarde", "not_completed", 17, "Vontade de doce."],
    [10, "almoco", "completed", 12, null],
  ];
  return rows.map(([d, meal, status, hour, note]) => ({
    id: uid("chk"),
    user_id: USER_ID,
    meal_type: meal,
    custom_meal_name: null,
    status,
    occurred_at: daysAgo(d, hour, 20),
    note,
    created_at: daysAgo(d, hour, 21),
  }));
}

function buildDifficulties(): { difficulties: DifficultyEvent[]; thoughts: ThoughtRecord[] } {
  const specs = [
    { d: 1, reasons: ["Estava com muita fome.", "Não tinha o alimento planejado."], thought: "Já estraguei tudo.", emotion: "Ansiedade", intensity: 7 },
    { d: 2, reasons: ["Comi por impulso.", "Tive vontade de doce."], thought: "Eu mereço.", emotion: "Cansaço", intensity: 6 },
    { d: 5, reasons: ["Estava estressado ou irritado.", "Não tive tempo."], thought: "Depois eu compenso.", emotion: "Estresse", intensity: 8 },
    { d: 9, reasons: ["Tive vontade de doce.", "Pensei que já tinha estragado o dia."], thought: "Já estraguei tudo.", emotion: "Frustração", intensity: 6 },
  ];
  const difficulties: DifficultyEvent[] = [];
  const thoughts: ThoughtRecord[] = [];
  for (const s of specs) {
    const deId = uid("diff");
    difficulties.push({
      id: deId,
      user_id: USER_ID,
      checkin_id: null,
      conversation_id: null,
      occurred_at: daysAgo(s.d, 17, 30),
      primary_reason: s.reasons[0],
      reasons: s.reasons,
      context: "Final da tarde, depois do trabalho.",
      hunger_intensity: s.reasons.some((r) => /fome/i.test(r)) ? 7 : 4,
      urge_intensity: 6,
      emotional_intensity: s.intensity,
      created_at: daysAgo(s.d, 17, 40),
    });
    thoughts.push({
      id: uid("thr"),
      user_id: USER_ID,
      difficulty_event_id: deId,
      situation: "Cheguei em casa cansada e com fome, sem nada organizado.",
      automatic_thought: s.thought,
      emotions: [s.emotion],
      behavior: "Comi algo diferente do planejado.",
      consequences: "Senti culpa.",
      decision_point: "Antes de sair do trabalho.",
      alternative_thought:
        s.thought === "Já estraguei tudo."
          ? "Uma escolha diferente não define o resto do dia. Posso retomar na próxima."
          : "Posso escolher de forma consciente, sem punição.",
      created_at: daysAgo(s.d, 17, 45),
    });
  }
  return { difficulties, thoughts };
}

function buildConversations(): { conversations: Conversation[]; messages: ConversationMessage[] } {
  const c1: Conversation = {
    id: uid("conv"),
    user_id: USER_ID,
    professional_id: PRO_ID,
    type: "checkin_followup",
    status: "closed",
    title: "Final da tarde difícil",
    started_at: daysAgo(1, 17, 32),
    ended_at: daysAgo(1, 17, 50),
    risk_level: "none",
    summary:
      "Mariana chegou em casa com muita fome e sem algo organizado. Pensamento 'já estraguei tudo'. Construiu o compromisso de verificar uma alternativa antes de sair do trabalho.",
    created_at: daysAgo(1, 17, 32),
    updated_at: daysAgo(1, 17, 50),
  };

  const messages: ConversationMessage[] = [
    {
      id: uid("msg"),
      conversation_id: c1.id,
      sender_type: "assistant",
      content: "O que mais influenciou essa escolha?",
      structured_content: null,
      created_at: daysAgo(1, 17, 33),
      quick_replies: null,
    },
    {
      id: uid("msg"),
      conversation_id: c1.id,
      sender_type: "user",
      content: "Estava com muita fome e não tinha o alimento planejado.",
      structured_content: null,
      created_at: daysAgo(1, 17, 34),
      quick_replies: null,
    },
    {
      id: uid("msg"),
      conversation_id: c1.id,
      sender_type: "assistant",
      content: "Entendi. Parece que tu chegou em casa com muita fome e sem nada organizado. O que passou pela tua cabeça naquele momento?",
      structured_content: null,
      created_at: daysAgo(1, 17, 35),
      quick_replies: null,
    },
    {
      id: uid("msg"),
      conversation_id: c1.id,
      sender_type: "user",
      content: "Que já tinha estragado tudo mesmo.",
      structured_content: null,
      created_at: daysAgo(1, 17, 36),
      quick_replies: null,
    },
    {
      id: uid("msg"),
      conversation_id: c1.id,
      sender_type: "assistant",
      content: "Uma escolha diferente do planejado realmente determina todas as próximas escolhas? Vamos pensar em algo possível para uma situação parecida?",
      structured_content: null,
      created_at: daysAgo(1, 17, 38),
      quick_replies: null,
    },
  ];
  return { conversations: [c1], messages };
}

function buildTrials(): StrategyTrial[] {
  return [
    {
      id: uid("trial"),
      user_id: USER_ID,
      strategy_id: "strat-alternativa",
      difficulty_event_id: null,
      planned_for: daysAgo(3, 16, 30),
      tested_at: daysAgo(3, 17, 0),
      result: "helped",
      user_feedback: "Consegui deixar algo pronto e não cheguei tão faminta.",
      title_snapshot: "Preparar uma alternativa antes de sair",
      created_at: daysAgo(4),
      updated_at: daysAgo(3),
    },
    {
      id: uid("trial"),
      user_id: USER_ID,
      strategy_id: "strat-fome-cedo",
      difficulty_event_id: null,
      planned_for: daysAgo(5, 16, 30),
      tested_at: daysAgo(5, 16, 30),
      result: "partially_helped",
      user_feedback: "Percebi a fome, mas ainda foi difícil.",
      title_snapshot: "Observar a fome mais cedo",
      created_at: daysAgo(6),
      updated_at: daysAgo(5),
    },
    {
      id: uid("trial"),
      user_id: USER_ID,
      strategy_id: "strat-retorno",
      difficulty_event_id: null,
      planned_for: daysAgo(2, 20, 0),
      tested_at: null,
      result: "not_tested",
      user_feedback: null,
      title_snapshot: "Retornar na próxima escolha sem compensar",
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    },
  ];
}

export function buildDemoDatabase(): Database {
  const checkins = buildCheckins();
  const { difficulties, thoughts } = buildDifficulties();
  const { conversations, messages } = buildConversations();
  const trials = buildTrials();

  return {
    profiles: [
      {
        id: USER_ID,
        role: "user",
        full_name: "Mariana Alves",
        preferred_name: "Mariana",
        avatar_url: null,
        email: "mariana@demo.metanoia.app",
        phone: null,
        timezone: "America/Sao_Paulo",
        professional_id: PRO_ID,
        onboarding_completed: true,
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: daysAgo(30, 9, 0),
        privacy_version: CURRENT_PRIVACY_VERSION,
        privacy_accepted_at: daysAgo(30, 9, 0),
        created_at: daysAgo(30),
        updated_at: now(),
      },
      {
        id: PRO_PROFILE_ID,
        role: "professional",
        full_name: "Laura Mendes",
        preferred_name: "Dra. Laura",
        avatar_url: null,
        email: "laura@demo.metanoia.app",
        phone: null,
        timezone: "America/Sao_Paulo",
        professional_id: null,
        onboarding_completed: true,
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: daysAgo(60, 9, 0),
        privacy_version: CURRENT_PRIVACY_VERSION,
        privacy_accepted_at: daysAgo(60, 9, 0),
        created_at: daysAgo(60),
        updated_at: now(),
      },
      {
        id: ADMIN_ID,
        role: "admin",
        full_name: "Administrador Metanóia",
        preferred_name: "Admin",
        avatar_url: null,
        email: "admin@demo.metanoia.app",
        phone: null,
        timezone: "America/Sao_Paulo",
        professional_id: null,
        onboarding_completed: true,
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: daysAgo(90, 9, 0),
        privacy_version: CURRENT_PRIVACY_VERSION,
        privacy_accepted_at: daysAgo(90, 9, 0),
        created_at: daysAgo(90),
        updated_at: now(),
      },
    ],
    professionals: [
      {
        id: PRO_ID,
        profile_id: PRO_PROFILE_ID,
        profession: "nutricionista",
        registration_number: "CRN 12345",
        organization_name: "Clínica Bem Viver",
        active: true,
        created_at: daysAgo(60),
        updated_at: now(),
      },
    ],
    professional_user_links: [
      {
        id: uid("link"),
        professional_id: PRO_ID,
        user_id: USER_ID,
        started_at: daysAgo(30),
        ended_at: null,
        active: true,
      },
    ],
    behavioral_goals: [
      {
        id: uid("goal"),
        user_id: USER_ID,
        goal_type: "parar_de_desistir",
        description:
          "Conseguir seguir meu plano sem desistir quando alguma refeição sai diferente.",
        active: true,
        created_at: daysAgo(30),
        updated_at: now(),
      },
    ],
    coping_cards: [
      {
        id: uid("card"),
        user_id: USER_ID,
        desired_identity: "Alguém que cuida de si com constância, mesmo nos dias difíceis.",
        main_goal: "Seguir meu plano sem desistir quando algo sai diferente.",
        life_impacts: {
          saude: "Vou dormir melhor, ter menos azia e me sentir mais leve.",
          emocional: "Menos culpa depois de comer e mais paz nas refeições.",
          autoestima: "Vou confiar mais em mim por cumprir o que combino comigo.",
          social: "Consigo aproveitar encontros sem ficar ansiosa com a comida.",
          familiar: "Dou um exemplo melhor para meus filhos e como junto com eles.",
          energia: "Mais disposição para o trabalho e para brincar à tarde.",
        },
        sabotaging_thoughts: ["Já estraguei tudo.", "Depois eu compenso."],
        reminder_statement:
          "Uma escolha diferente não apaga tudo. Eu sempre posso retomar na próxima.",
        personal_commitment: "Nos dias difíceis, faço uma pausa antes de decidir.",
        completed_percentage: 100,
        created_at: daysAgo(28),
        updated_at: now(),
      },
    ],
    meal_checkins: checkins,
    difficulty_events: difficulties,
    thought_records: thoughts,
    conversations,
    conversation_messages: messages,
    strategies: GLOBAL_STRATEGIES,
    strategy_trials: trials,
    pattern_snapshots: [],
    consistency_scores: [],
    weekly_reports: [],
    risk_flags: [
      {
        id: uid("risk"),
        user_id: USER_ID,
        conversation_id: conversations[0].id,
        message_id: null,
        category: "culpa_intensa",
        severity: "low",
        evidence: "Relatos recorrentes do pensamento 'já estraguei tudo' com culpa associada.",
        status: "open",
        reviewed_by: null,
        reviewed_at: null,
        professional_note: null,
        created_at: daysAgo(1),
      },
    ],
    professional_notes: [
      {
        id: uid("note"),
        professional_id: PRO_ID,
        user_id: USER_ID,
        conversation_id: conversations[0].id,
        content:
          "Trabalhar reestruturação do pensamento 'já estraguei tudo'. Reforçar preparo antes das 17h.",
        created_at: daysAgo(1),
        updated_at: daysAgo(1),
      },
    ],
    notification_preferences: [
      {
        id: uid("np"),
        user_id: USER_ID,
        enabled: true,
        allowed_days: [1, 2, 3, 4, 5],
        allowed_start_time: "08:00",
        allowed_end_time: "21:00",
        maximum_daily_notifications: 2,
        preventive_enabled: true,
        checkin_enabled: true,
        support_times: ["16:30"],
        timezone: "America/Sao_Paulo",
        created_at: daysAgo(30),
        updated_at: now(),
      },
    ],
    scheduled_interventions: [
      {
        id: uid("sched"),
        user_id: USER_ID,
        intervention_type: "preventive",
        scheduled_for: daysAgo(-0, 16, 30), // hoje 16:30
        status: "scheduled",
        rule_source: "dificuldade recorrente no final da tarde (>=3)",
        payload: {
          message:
            "O final da tarde tem aparecido como um momento mais difícil. Quer pensar em uma estratégia antes que ele chegue?",
        },
        sent_at: null,
        responded_at: null,
        created_at: now(),
      },
    ],
    legal_documents: [
      {
        id: "legal-terms-1",
        type: "terms",
        version: CURRENT_TERMS_VERSION,
        content: TERMS_TEXT,
        active_from: daysAgo(120),
        active: true,
      },
      {
        id: "legal-privacy-1",
        type: "privacy",
        version: CURRENT_PRIVACY_VERSION,
        content: PRIVACY_TEXT,
        active_from: daysAgo(120),
        active: true,
      },
    ],
    legal_acceptances: [
      {
        id: uid("acc"),
        user_id: USER_ID,
        document_id: "legal-terms-1",
        accepted_at: daysAgo(30, 9, 0),
        ip_address: "203.0.113.10",
        user_agent: "DemoBrowser/1.0",
      },
    ],
    audit_logs: [
      {
        id: uid("audit"),
        actor_id: PRO_ID,
        action: "view_conversation",
        resource_type: "conversation",
        resource_id: conversations[0].id,
        metadata: { user_id: USER_ID },
        created_at: daysAgo(1, 18, 0),
      },
    ],
  };
}

export const TERMS_TEXT = `TERMOS E CONDIÇÕES DE USO — METANÓIA

Ao aceitar estes Termos, tu concordas que:

1. As informações que forneces serão processadas por Inteligência Artificial para oferecer apoio comportamental.
2. O profissional de saúde responsável pelo teu acompanhamento poderá visualizar tuas conversas e registros.
3. O objetivo do Metanóia é apoio comportamental — ele não substitui atendimento profissional, diagnóstico ou tratamento de saúde.
4. Dados sensíveis (relacionados a comportamento alimentar, emoções e saúde) serão tratados para execução do acompanhamento.
5. Tu podes solicitar acesso, correção, exportação ou exclusão dos teus dados conforme as regras aplicáveis (LGPD).

O Metanóia não cria dietas, não conta calorias, não fiscaliza refeições e não substitui profissionais de saúde.`;

export const PRIVACY_TEXT = `POLÍTICA DE PRIVACIDADE — METANÓIA

Tratamos dados sensíveis com base no teu consentimento e na execução do acompanhamento.
- Minimização: coletamos apenas o necessário.
- Compartilhamento: apenas com o profissional vinculado à tua conta.
- Segurança: criptografia em trânsito, controle de acesso e registro de auditoria.
- Teus direitos: acesso, correção, exportação e exclusão.

Contato do encarregado: privacidade@metanoia.app`;

export { USER_ID, PRO_ID, ADMIN_ID };
