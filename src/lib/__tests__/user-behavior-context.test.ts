import { describe, expect, it } from "vitest";
import { runDeterministicTurn, createConversationState } from "../ai/conversation";
import {
  BEHAVIOR_CONTEXT_LIMITS,
  buildUserBehaviorContext,
  findEquivalentMemory,
  type BehaviorContextSource,
} from "../ai/user-behavior-context";
import type {
  AlternativeThought,
  BehavioralEpisode,
  CopingCard,
  Profile,
  StrategyTrial,
  UserMemory,
} from "../types";

const USER_A = "user-a";
const USER_B = "user-b";
const NOW = new Date("2026-08-31T18:00:00.000Z");

function source(patch: Partial<BehaviorContextSource> = {}): BehaviorContextSource {
  return {
    profile: profile(USER_A),
    copingCard: null,
    memories: [],
    alternativeThoughts: [],
    strategyTrials: [],
    episodes: [],
    mealSchedules: [],
    ...patch,
  };
}

function profile(id: string): Profile {
  return {
    id,
    role: "user",
    full_name: "Pessoa Teste",
    preferred_name: "Pessoa",
    email: `${id}@example.com`,
    timezone: "America/Sao_Paulo",
    onboarding_completed: true,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function memory(
  id: string,
  content: string,
  patch: Partial<UserMemory> = {}
): UserMemory {
  return {
    id,
    user_id: USER_A,
    memory_kind: "fact",
    topic: "alimentacao",
    content,
    source: "user",
    validation_status: "confirmed",
    confidence: 1,
    evidence_count: 1,
    importance: 5,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...patch,
  };
}

function alternative(
  id: string,
  original: string,
  response: string,
  patch: Partial<AlternativeThought> = {}
): AlternativeThought {
  return {
    id,
    user_id: USER_A,
    thought_record_id: null,
    original_thought: original,
    alternative: response,
    belief_level: 8,
    result: "pending",
    times_used: 0,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...patch,
  };
}

function trial(
  id: string,
  result: StrategyTrial["result"],
  patch: Partial<StrategyTrial> = {}
): StrategyTrial {
  return {
    id,
    user_id: USER_A,
    strategy_id: null,
    strategy_key: "sexta-pausa",
    trigger_context: "sexta à noite quando chego cansado",
    experiment_action: "deixar a decisão para depois de uma pausa",
    test_objective: "decidir com mais calma",
    result,
    title_snapshot: "Pausa ao chegar em casa na sexta",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...patch,
  };
}

function episode(id: string, userId = USER_A): BehavioralEpisode {
  return {
    id,
    user_id: userId,
    conversation_id: `conversation-${userId}`,
    episode_type: "event",
    entry_intent: "register_event",
    current_intent: "register_event",
    status: "active",
    started_at: NOW.toISOString(),
    situation: "Comi pizza e veio culpa",
    context_tags: ["casa"],
    physical_state: [],
    emotions: ["culpa"],
    automatic_thought: "Já estraguei tudo",
    captured_evidence: [],
    conversation_state: {},
    followup_required: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

describe("contexto comportamental relevante", () => {
  it("prioriza culpa e não envia memória não relacionada", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "Estou com culpa porque comi pizza", now: NOW },
      source({
        memories: [
          memory("guilt", "Culpa costuma aparecer depois de refeições diferentes", { topic: "culpa" }),
          memory("running", "Gosta de correr de manhã", { topic: "corrida" }),
        ],
      })
    );
    expect(context.confirmed_memories).toContain("Culpa costuma aparecer depois de refeições diferentes");
    expect(context.confirmed_memories).not.toContain("Gosta de correr de manhã");
  });

  it("recupera pensamento alternativo acreditável em situação semelhante", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "Comi diferente e pensei que já estraguei tudo", now: NOW },
      source({
        alternativeThoughts: [
          alternative(
            "alt-1",
            "Já estraguei tudo",
            "Uma refeição diferente não decide o restante do dia"
          ),
        ],
      })
    );
    expect(context.alternative_thoughts[0]?.id).toBe("alt-1");
  });

  it("prioriza estratégia testada que ajudou e separa a que não ajudou", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "Sexta à noite chego cansado", now: NOW },
      source({
        strategyTrials: [
          trial("help-1", "helped"),
          trial("help-2", "helped"),
          trial("fail-1", "did_not_help", { strategy_key: "sexta-agua", title_snapshot: "Beber água" }),
          trial("fail-2", "did_not_help", { strategy_key: "sexta-agua", title_snapshot: "Beber água" }),
        ],
      })
    );
    expect(context.effective_strategy_resources[0]?.key).toBe("sexta-pausa");
    expect(context.ineffective_strategy_resources[0]?.key).toBe("sexta-agua");
    expect(context.effective_strategies).not.toContain("Beber água");
  });

  it("diferencia hipótese proposta, confirmada e rejeitada", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "No fim da tarde chego cansado", now: NOW },
      source({
        memories: [
          memory("proposed", "O cansaço pode deixar o fim da tarde mais difícil", {
            memory_kind: "hypothesis",
            topic: "cansaço no fim da tarde",
            validation_status: "proposed",
            source: "ai",
          }),
          memory("confirmed", "O fim da tarde fica mais difícil quando chega cansado", {
            memory_kind: "pattern",
            topic: "cansaço no fim da tarde",
          }),
          memory("rejected", "Ansiedade explica o fim da tarde", {
            memory_kind: "hypothesis",
            topic: "ansiedade no fim da tarde",
            validation_status: "rejected",
            source: "ai",
          }),
        ],
      })
    );
    expect(context.proposed_hypotheses).toHaveLength(1);
    expect(context.confirmed_memories).toHaveLength(1);
    expect(context.rejected_hypotheses).toHaveLength(1);
    expect(context.confirmed_memories.join(" ")).not.toContain("Ansiedade explica");
  });

  it("detecta duplicação sem confundir outro tópico", () => {
    const memories = [
      memory("one", "Eu fico ansiosa no fim da tarde", { topic: "fim da tarde" }),
    ];
    expect(
      findEquivalentMemory(memories, {
        memory_kind: "fact",
        topic: "fim da tarde",
        content: "No fim da tarde eu costumo ficar ansiosa",
      })?.id
    ).toBe("one");
    expect(
      findEquivalentMemory(memories, {
        memory_kind: "fact",
        topic: "corrida",
        content: "No fim da tarde eu costumo correr",
      })
    ).toBeUndefined();
  });

  it("ignora informação superada e usa a versão atual", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "Tenho corrido durante a semana", now: NOW },
      source({
        memories: [
          memory("old", "Eu nunca corro", { topic: "corrida", superseded_at: NOW.toISOString() }),
          memory("new", "Agora corro quatro vezes por semana", { topic: "corrida" }),
        ],
      })
    );
    expect(context.confirmed_memories).toEqual(["Agora corro quatro vezes por semana"]);
  });

  it("reflete imediatamente a versão editada do Meu Norte", () => {
    const oldCard = { id: "card", user_id: USER_A, main_goal: "Quero emagrecer", completed_percentage: 20, created_at: NOW.toISOString(), updated_at: NOW.toISOString() } as CopingCard;
    const newCard = { ...oldCard, main_goal: "Quero correr com mais disposição" };
    const before = buildUserBehaviorContext(USER_A, { now: NOW }, source({ copingCard: oldCard }));
    const after = buildUserBehaviorContext(USER_A, { now: NOW }, source({ copingCard: newCard }));
    expect(before.north).toContain("Quero emagrecer");
    expect(after.north).toContain("Quero correr com mais disposição");
    expect(after.north).not.toContain("Quero emagrecer");
  });

  it("isola dados por usuário mesmo se a fonte vier misturada", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "culpa", now: NOW },
      source({
        memories: [
          memory("mine", "Eu sinto culpa depois", { topic: "culpa" }),
          memory("other", "Segredo do usuário B sobre culpa", { user_id: USER_B, topic: "culpa" }),
        ],
        episodes: [episode("mine-episode"), episode("other-episode", USER_B)],
      })
    );
    expect(JSON.stringify(context)).not.toContain("Segredo do usuário B");
    expect(context.recent_episodes.map((item) => item.id)).not.toContain("other-episode");
  });

  it("aplica limites fixos mesmo com muitas memórias", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "culpa depois de comer", now: NOW },
      source({
        memories: Array.from({ length: 50 }, (_, index) =>
          memory(`memory-${index}`, `Culpa depois de comer número ${index}`, { topic: "culpa" })
        ),
      })
    );
    expect(context.relevant_memories.length).toBe(BEHAVIOR_CONTEXT_LIMITS.memories);
    expect(context.context_meta?.selected_items).toBeLessThanOrEqual(BEHAVIOR_CONTEXT_LIMITS.total);
  });

  it("mantém o episódio atual no contexto após reload", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "voltei", episodeId: "episode-current", now: NOW },
      source({ episodes: [episode("episode-current")] })
    );
    expect(context.recent_episodes[0]?.id).toBe("episode-current");
  });

  it("entrega a memória relevante ao fallback determinístico", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "Já estraguei tudo", now: NOW },
      source({
        alternativeThoughts: [
          alternative(
            "alt-fallback",
            "Já estraguei tudo",
            "Uma refeição diferente não decide o restante do dia"
          ),
        ],
      })
    );
    const state = createConversationState("register_event", context);
    const examining = {
      ...state,
      stage: "cognitive_examine" as const,
      automatic_thought: "Já estraguei tudo",
      behavior: "Continuei comendo",
    };
    const turn = runDeterministicTurn(examining, "Foi só o almoço", context);
    expect(turn.decision.reply).toContain("Uma refeição diferente");
    expect(turn.state.stage).toBe("alternative_personalize");
  });

  it("persiste confirmação e rejeição pelo mesmo ciclo do motor", () => {
    const context = buildUserBehaviorContext(
      USER_A,
      { message: "sexta à noite eu chego cansado", now: NOW },
      source({
        memories: [
          memory("hypothesis", "O cansaço pode deixar a sexta à noite mais difícil", {
            memory_kind: "hypothesis",
            topic: "sexta à noite cansado",
            validation_status: "proposed",
            source: "ai",
          }),
        ],
      })
    );
    const opened = runDeterministicTurn(
      createConversationState("register_event", context),
      "Sexta à noite eu chego cansado",
      context
    );
    expect(opened.state.stage).toBe("memory_hypothesis_review");
    const confirmed = runDeterministicTurn(opened.state, "É exatamente isso", context);
    expect(confirmed.actions).toContainEqual({
      type: "update_memory_validation",
      memory_id: "hypothesis",
      validation_status: "confirmed",
    });

    const rejected = runDeterministicTurn(opened.state, "Não tem nada a ver", context);
    expect(rejected.actions).toContainEqual({
      type: "update_memory_validation",
      memory_id: "hypothesis",
      validation_status: "rejected",
    });
  });
});
