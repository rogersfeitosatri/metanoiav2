import { describe, expect, it } from "vitest";
import {
  abandonEpisodePatch,
  inferEventMoment,
  initialEpisodeFields,
  isExplicitNewDemand,
  patchEpisodeFromTurn,
  resolveFollowupEpisodePatch,
  resumeLastQuestion,
  selectEpisodeForEntry,
} from "../behavioral-episodes";
import {
  ConversationEngineResponseSchema,
  ConversationEngineStateSchema,
  type ConversationAction,
  type ConversationEngineState,
} from "../ai/schemas";
import type { BehavioralEpisode } from "../types";

const NOW = new Date("2026-08-27T18:00:00-03:00");

function episode(patch: Partial<BehavioralEpisode> = {}): BehavioralEpisode {
  return {
    id: "episode-1",
    user_id: "user-1",
    conversation_id: "conversation-1",
    episode_type: "event",
    entry_intent: "register_event",
    current_intent: "register_event",
    status: "active",
    started_at: "2026-08-27T16:00:00-03:00",
    ended_at: null,
    situation: "Comi mais do que pretendia no almoço",
    event_occurred_at: null,
    event_time_description: null,
    event_time_precision: null,
    current_stage: "hunger",
    awaiting_field: "hunger",
    conversation_state: {
      intent: "register_event",
      stage: "hunger",
      asked: ["situation"],
      situation: "Comi mais do que pretendia no almoço",
      last_question: "Como estava tua fome?",
    },
    result_summary: null,
    followup_required: false,
    followup_reason: null,
    followup_at: null,
    related_meal_checkin_id: null,
    related_strategy_trial_id: null,
    related_difficulty_event_id: null,
    created_at: "2026-08-27T16:00:00-03:00",
    updated_at: "2026-08-27T17:00:00-03:00",
    ...patch,
  };
}

function response(
  statePatch: Partial<ConversationEngineState>,
  options: { actions?: ConversationAction[]; close?: boolean } = {}
) {
  const state = ConversationEngineStateSchema.parse({
    intent: "register_event",
    stage: "hunger",
    asked: ["situation"],
    situation: "Comi mais do que pretendia no almoço",
    ...statePatch,
  });
  return ConversationEngineResponseSchema.parse({
    reply: options.close ? "Tá. Por aqui já temos o suficiente." : "Como estava tua fome?",
    quick_replies: [],
    next_stage: state.stage,
    response_kind: options.close ? "closing" : "question",
    needs_clarification: false,
    suggest_close: options.close || false,
    state,
    actions: options.actions || [],
    source: "local",
    provider: null,
    safety: {
      risk: false,
      level: "none",
      categories: [],
      alert_recorded: false,
      interrupted: false,
    },
  });
}

describe("seleção e criação de episódios", () => {
  it("uma intenção explícita cria uma nova demanda", () => {
    expect(
      selectEpisodeForEntry([episode()], {
        userId: "user-1",
        intent: "register_event",
        now: NOW,
      }).kind
    ).toBe("create");
  });

  it("reload de intenção explícita recupera o episódio ativo", () => {
    const selected = selectEpisodeForEntry([episode()], {
      userId: "user-1",
      intent: "register_event",
      isReload: true,
      now: NOW,
    });
    expect(selected.kind).toBe("resume");
    if (selected.kind === "resume") expect(selected.episode.id).toBe("episode-1");
  });

  it("entrada normal retoma episódio recente e oferece escolha para episódio antigo", () => {
    expect(
      selectEpisodeForEntry([episode({ current_intent: "default" })], {
        userId: "user-1",
        intent: "default",
        now: NOW,
      }).kind
    ).toBe("resume");

    const old = episode({
      current_intent: "default",
      updated_at: "2026-08-26T08:00:00-03:00",
    });
    expect(
      selectEpisodeForEntry([old], {
        userId: "user-1",
        intent: "default",
        now: NOW,
      }).kind
    ).toBe("offer_resume");
  });

  it("reconhece troca explícita de assunto sem confundir uma continuação comum", () => {
    expect(isExplicitNewDemand("Agora aconteceu outra coisa.")).toBe(true);
    expect(isExplicitNewDemand("Mudando de assunto, queria contar outra situação agora")).toBe(true);
    expect(isExplicitNewDemand("Isso aconteceu outra vez ontem")).toBe(false);
  });

  it("help_now nasce com o momento do evento separado do registro", () => {
    const fields = initialEpisodeFields("help_now", NOW);
    expect(fields.entry_intent).toBe("help_now");
    expect(fields.episode_type).toBe("help_now");
    expect(fields.event_occurred_at).toBe(NOW.toISOString());
    expect(fields.event_time_precision).toBe("approximate");
  });
});

describe("estado persistente e ciclo de vida", () => {
  it("persiste estágio e informações conhecidas para continuar após reload", () => {
    const turn = response({
      stage: "thought",
      hunger_level: 8,
      physical_context: "Fazia seis horas que eu não comia",
      last_question: "O que passou pela tua cabeça?",
    });
    const patch = patchEpisodeFromTurn(episode(), turn, {}, NOW);
    expect(patch.status).toBe("active");
    expect(patch.current_stage).toBe("thought");
    expect(patch.awaiting_field).toBe("thought");
    expect(patch.conversation_state).toMatchObject({
      hunger_level: 8,
      physical_context: "Fazia seis horas que eu não comia",
    });
  });

  it("encerra como resolvido quando não há acompanhamento pendente", () => {
    const patch = patchEpisodeFromTurn(
      episode(),
      response({ stage: "done" }, { close: true }),
      {},
      NOW
    );
    expect(patch.status).toBe("resolved");
    expect(patch.ended_at).toBe(NOW.toISOString());
    expect(patch.followup_required).toBe(false);
  });

  it("uma estratégia aceita deixa o episódio aguardando follow-up", () => {
    const trialAction: ConversationAction = {
      type: "create_strategy_trial",
      title: "Deixar um lanche pronto",
    };
    const patch = patchEpisodeFromTurn(
      episode(),
      response(
        { stage: "done", strategy: "Deixar um lanche pronto", strategy_recorded: true },
        { actions: [trialAction], close: true }
      ),
      {
        strategyTrialId: "trial-1",
        strategyPlannedFor: "2026-08-28T18:00:00-03:00",
      },
      NOW
    );
    expect(patch.status).toBe("waiting_followup");
    expect(patch.followup_required).toBe(true);
    expect(patch.followup_reason).toMatch(/estratégia/i);
    expect(patch.related_strategy_trial_id).toBe("trial-1");
    expect(patch.followup_at).toBeTruthy();
    expect(patch.ended_at).toBeNull();
  });

  it("preserva relações com check-in, dificuldade e estratégia", () => {
    const patch = patchEpisodeFromTurn(
      episode(),
      response({ stage: "recovery", active_checkin_id: "checkin-1" }),
      {
        mealCheckinId: "checkin-1",
        difficultyEventId: "difficulty-1",
        strategyTrialId: "trial-1",
      },
      NOW
    );
    expect(patch.related_meal_checkin_id).toBe("checkin-1");
    expect(patch.related_difficulty_event_id).toBe("difficulty-1");
    expect(patch.related_strategy_trial_id).toBe("trial-1");
  });

  it("abandono explícito é neutro e não vira indicador de fracasso", () => {
    const patch = abandonEpisodePatch(NOW);
    expect(patch.status).toBe("abandoned");
    expect(patch.result_summary).toMatch(/outra demanda/i);
    expect(patch.result_summary).not.toMatch(/fracasso|resistência|falha/i);
  });

  it("uma revisão concluída resolve o episódio que aguardava follow-up", () => {
    const patch = resolveFollowupEpisodePatch("A estratégia ajudou em parte.", NOW);
    expect(patch.status).toBe("resolved");
    expect(patch.ended_at).toBe(NOW.toISOString());
    expect(patch.followup_required).toBe(false);
    expect(patch.result_summary).toContain("ajudou");
  });

  it("recupera a pergunta pendente do estado persistido", () => {
    expect(resumeLastQuestion(episode())).toBe("Como estava tua fome?");
  });
});

describe("momento do acontecimento", () => {
  it("diferencia ontem à noite da hora em que o episódio foi criado", () => {
    const inferred = inferEventMoment("Ontem à noite comi muito doce", NOW);
    expect(inferred?.description).toMatch(/ontem/i);
    expect(inferred?.precision).toBe("relative");
    expect(inferred?.occurredAt).not.toBe(NOW.toISOString());
    expect(new Date(inferred!.occurredAt).getTime()).toBeLessThan(NOW.getTime());
  });

  it("mantém horário desconhecido como ausente em vez de inventar", () => {
    expect(inferEventMoment("Comi mais do que pretendia no almoço", NOW)).toBeNull();
  });
});
