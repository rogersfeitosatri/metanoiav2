import { describe, it, expect, vi } from "vitest";
import {
  defaultPreferences,
  planSupport,
  reconcileSupport,
  canSendSupport,
  dueSupport,
  allowedAt,
  interventionIntent,
  isRelevantInvitation,
  PUSH_COPY,
  type SupportDatabase,
} from "../support";
import {
  ConversationContextSchema,
  ConversationRequestSchema,
} from "../ai/schemas";
import { createOpeningTurn, runDeterministicTurn } from "../ai/conversation";
import { orchestrateConversation } from "../ai/conversation-orchestrator";
import { buildUserBehaviorContext } from "../ai/user-behavior-context";
import { validPushEndpoint } from "../push";
import { loginDestination } from "../login-destination";
import type { BehavioralEpisode, StrategyTrial } from "../types";

const now = new Date("2026-09-07T16:00:00Z"); // Monday 13:00 Sao Paulo.
function database(): SupportDatabase {
  const p = defaultPreferences("u");
  p.created_at = p.updated_at = "2026-09-01T00:00:00Z";
  p.push_enabled = true;
  return {
    profiles: [],
    notification_preferences: [p],
    meal_schedules: [
      {
        id: "meal",
        user_id: "u",
        name: "Almoço",
        time_of_day: "12:30",
        days_of_week: [1, 2, 3, 4, 5],
        active: true,
        reminder_enabled: true,
        support_mode: "after",
        support_offset_minutes: 30,
        created_at: p.created_at,
        updated_at: p.updated_at,
      },
    ],
    strategy_trials: [],
    behavioral_episodes: [],
    meal_checkins: [],
    scheduled_interventions: [],
  };
}
function current(db = database()) {
  db.scheduled_interventions = reconcileSupport(db, "u", now);
  return {
    db,
    i: db.scheduled_interventions.find(
      (i) => i.payload.local_date === "2026-09-07",
    )!,
    p: db.notification_preferences[0],
  };
}
describe("Agenda opcional", () => {
  it("preparação retoma recurso relevante sem pedir toda a história", () => {
    const context = ConversationContextSchema.parse({
      support_invitation: {
        id: "i",
        type: "preventive",
        meal_name: "Lanche do trabalho",
      },
      effective_strategies: ["Deixar um plano B combinado para a reunião"],
    });
    const turn = createOpeningTurn("prepare", context);
    expect(turn.decision.reply).toContain("plano B combinado");
    expect(turn.state.stage).toBe("prepare_obstacle");
    expect(turn.state.situation).toContain("Lanche do trabalho");
    expect(turn.actions).toEqual([]);
  });
  it.each(["responded_at", "attempted_at", "opened_at"] as const)(
    "editar preferências não repete ocorrência com %s",
    (field) => {
      const { db, i, p } = current();
      i[field] = now.toISOString();
      p.updated_at = now.toISOString();
      const planned = planSupport(db, "u", now);
      expect(
        planned.some((x) => x.payload.local_date === i.payload.local_date),
      ).toBe(false);
      expect(planned.some((x) => x.payload.local_date === "2026-09-08")).toBe(
        true,
      );
    },
  );
  it("depois de 12:30+30 significa 13h local, não antes", () => {
    const { db, i } = current();
    expect(Date.parse(i.scheduled_for)).toBe(now.getTime());
    expect(dueSupport(db, "u", new Date("2026-09-07T15:59:00Z"))).toHaveLength(
      0,
    );
    expect(dueSupport(db, "u", now)).toHaveLength(1);
  });
  it("respeita dias, fuso distinto e modo preventivo separado", () => {
    const db = database();
    db.notification_preferences[0].timezone = "America/New_York";
    db.meal_schedules[0].support_mode = "before";
    const planned = planSupport(db, "u", now);
    const monday = planned.find((i) => i.payload.local_date === "2026-09-07")!;
    expect(Date.parse(monday.scheduled_for)).toBe(
      Date.parse("2026-09-07T16:00:00Z"),
    );
    expect(monday.intervention_type).toBe("preventive");
    expect(
      planSupport(db, "u", new Date("2026-09-12T15:00:00Z")).some(
        (i) => i.payload.local_date === "2026-09-12",
      ),
    ).toBe(false);
  });
  it("antes da meia-noite pertence à ocorrência do dia seguinte", () => {
    const db = database();
    Object.assign(db.meal_schedules[0], {
      time_of_day: "00:15",
      support_mode: "before",
      days_of_week: [2],
    });
    const monday = new Date("2026-09-08T02:45:00Z");
    const i = planSupport(db, "u", monday).find(
      (i) => i.payload.local_date === "2026-09-08",
    )!;
    expect(Date.parse(i.scheduled_for)).toBe(monday.getTime());
    expect(i.payload.occurrence_at).toBe("2026-09-08T03:15:00Z");
  });
  it("horário inexistente no DST não vira ocorrência inventada", () => {
    const db = database();
    db.notification_preferences[0].timezone = "America/New_York";
    Object.assign(db.meal_schedules[0], {
      time_of_day: "02:30",
      days_of_week: [0],
    });
    expect(
      planSupport(db, "u", new Date("2026-03-08T05:00:00Z")).some(
        (i) => i.payload.local_date === "2026-03-08",
      ),
    ).toBe(false);
  });
  it("sem preferência persistida ou apoio explícito não agenda", () => {
    const db = database();
    db.notification_preferences = [];
    expect(planSupport(db, "u", now)).toEqual([]);
    db.notification_preferences = [defaultPreferences("u")];
    db.meal_schedules[0].support_mode = "none";
    expect(planSupport(db, "u", now)).toEqual([]);
  });
  it.each(["active", "reminder_enabled"] as const)(
    "desligar %s cancela",
    (key) => {
      const { db, i } = current();
      db.meal_schedules[0][key] = false;
      expect(
        reconcileSupport(db, "u", now).find((x) => x.id === i.id)?.status,
      ).toBe("cancelled");
    },
  );
  it("editar horário cancela o antigo e remover não mantém convites", () => {
    const { db, i } = current();
    db.meal_schedules[0].time_of_day = "15:00";
    db.meal_schedules[0].updated_at = now.toISOString();
    const next = reconcileSupport(db, "u", now);
    expect(next.find((x) => x.id === i.id)?.status).toBe("cancelled");
    expect(
      next.some(
        (x) =>
          x.status === "scheduled" &&
          x.scheduled_for === "2026-09-07T18:30:00Z",
      ),
    ).toBe(true);
    db.meal_schedules = [];
    expect(
      reconcileSupport(db, "u", now).every((x) => x.status === "cancelled"),
    ).toBe(true);
  });
  it("silêncio, dias permitidos e janelas que atravessam a meia-noite", () => {
    const p = database().notification_preferences[0];
    expect(allowedAt(p, new Date("2026-09-08T02:00:00Z"))).toBe(false);
    p.allowed_days = [2];
    expect(allowedAt(p, now)).toBe(false);
    p.allowed_days = [1];
    p.allowed_start_time = "22:00";
    p.allowed_end_time = "06:00";
    expect(allowedAt(p, new Date("2026-09-08T02:00:00Z"))).toBe(true);
  });
});
describe("Idempotência e frequência", () => {
  it("duas execuções preservam exatamente as mesmas ocorrências", () => {
    const { db } = current();
    expect(reconcileSupport(db, "u", now)).toEqual(db.scheduled_interventions);
  });
  it("limite diário compartilhado e intervalo mínimo", () => {
    const { db, i, p } = current();
    expect(canSendSupport(i, db, p, now)).toBe(true);
    db.scheduled_interventions.push({
      ...i,
      id: "previous",
      status: "sent",
      attempted_at: "2026-09-07T15:00:00Z",
    });
    expect(canSendSupport(i, db, p, now)).toBe(false);
    db.scheduled_interventions.at(-1)!.attempted_at = "2026-09-07T11:00:00Z";
    db.scheduled_interventions.push({
      ...i,
      id: "previous2",
      status: "failed",
      attempted_at: "2026-09-07T13:00:00Z",
    });
    expect(canSendSupport(i, db, p, now)).toBe(false);
  });
  it.each([
    "responded",
    "cancelled",
    "expired",
    "failed",
    "sending",
    "sent",
  ] as const)("não reenvia status %s", (status) => {
    const { db, i, p } = current();
    i.status = status;
    expect(canSendSupport(i, db, p, now)).toBe(false);
  });
  it("envio desativado e conversa ativa impedem envio", () => {
    const { db, i, p } = current();
    p.push_enabled = false;
    expect(canSendSupport(i, db, p, now)).toBe(false);
    p.push_enabled = true;
    db.behavioral_episodes = [
      {
        user_id: "u",
        status: "active",
        updated_at: now.toISOString(),
      } as BehavioralEpisode,
    ];
    expect(canSendSupport(i, db, p, now)).toBe(false);
  });
  it("registro equivalente e expirados não disparam", () => {
    const { db, i, p } = current();
    db.meal_checkins = [
      {
        id: "c",
        user_id: "u",
        schedule_id: "meal",
        status: "completed",
        occurred_at: now.toISOString(),
        created_at: now.toISOString(),
      },
    ];
    expect(canSendSupport(i, db, p, now)).toBe(false);
    db.meal_checkins = [];
    expect(
      reconcileSupport(db, "u", new Date(now.getTime() + 2 * 3600000)).find(
        (x) => x.id === i.id,
      )?.status,
    ).toBe("expired");
  });
  it("nenhuma resposta não altera estratégia, episódio ou refeição", () => {
    const db = database();
    const before = structuredClone(db);
    reconcileSupport(db, "u", now);
    expect(db).toEqual(before);
  });
  it("isola outro usuário", () => {
    const { db, i, p } = current();
    i.user_id = "outro";
    expect(isRelevantInvitation(i, db, p, now)).toBe(false);
    expect(planSupport(db, "outro", now)).toEqual([]);
  });
  it("follow-up avaliado não reaparece como pendente", () => {
    const db = database();
    db.meal_schedules = [];
    db.strategy_trials = [
      { id: "trial", user_id: "u", result: "not_tested" } as StrategyTrial,
    ];
    db.behavioral_episodes = [
      {
        id: "ep",
        user_id: "u",
        status: "waiting_followup",
        followup_required: true,
        followup_at: now.toISOString(),
        related_strategy_trial_id: "trial",
      } as BehavioralEpisode,
    ];
    const i = planSupport(db, "u", now)[0];
    expect(interventionIntent(i)).toBe("review_strategy");
    db.strategy_trials[0].result = "helped";
    expect(planSupport(db, "u", now)).toEqual([]);
  });
});
describe("Conversa canônica e privacidade", () => {
  function context() {
    return ConversationContextSchema.parse({
      meals: [{ id: "meal", name: "Almoço", time: "12:30", due: true }],
      support_invitation: {
        id: "invitation",
        type: "meal_checkin",
        meal_name: "Almoço",
        meal_schedule_id: "meal",
      },
    });
  }
  it("ainda não comi não cria check-in; adiar permanece no mesmo estágio", () => {
    const c = context(),
      start = createOpeningTurn("meal_checkin", c);
    expect(start.decision.reply).toContain("Almoço");
    const turn = runDeterministicTurn(start.state, "Ainda não comi", c);
    expect(turn.actions).toEqual([]);
    expect(turn.state.situation).toBeUndefined();
    expect(turn.state.behavior).toBeUndefined();
    expect(turn.state.captured_evidence).toEqual([]);
    expect(turn.state.stage).toBe("meal_status");
    expect(
      runDeterministicTurn(turn.state, "Perguntar em 30 minutos", c).actions,
    ).toContainEqual({
      type: "support_response",
      invitation_id: "invitation",
      outcome: "snooze",
    });
  });
  it("foi diferente, tudo bem não cria dificuldade", () => {
    const c = context();
    const r = runDeterministicTurn(
      createOpeningTurn("meal_checkin", c).state,
      "Foi diferente, mas tudo bem",
      c,
    );
    expect(r.actions.some((a) => a.type === "create_meal_checkin")).toBe(true);
    expect(r.actions.some((a) => a.type === "record_difficulty")).toBe(false);
    expect(r.state.stage).toBe("done");
  });
  it("prefiro não registrar encerra sem refeição não realizada", () => {
    const c = context();
    const r = runDeterministicTurn(
      createOpeningTurn("meal_checkin", c).state,
      "Prefiro não registrar",
      c,
    );
    expect(r.actions.some((a) => a.type === "create_meal_checkin")).toBe(false);
  });
  it("experimento exato tem precedência sobre o primeiro da lista", () => {
    const c = ConversationContextSchema.parse({
      support_invitation: {
        id: "i",
        type: "strategy_followup",
        strategy_trial_id: "second",
      },
      pending_strategies: [
        { id: "first", title: "Outro" },
        { id: "second", title: "Plano B" },
      ],
    });
    expect(
      createOpeningTurn("review_strategy", c).state.pending_strategy_id,
    ).toBe("second");
    expect(createOpeningTurn("help_now", c).state.stage).toBe("situation");
  });
  it("preparação sabe qual momento foi escolhido", () => {
    const c = context();
    c.support_invitation!.type = "preventive";
    expect(createOpeningTurn("prepare", c).decision.reply).toContain("Almoço");
  });
  it("reload conserva estágio e ocorrência do convite", () => {
    const c = context();
    const state = createOpeningTurn("meal_checkin", c).state;
    const r = runDeterministicTurn(
      JSON.parse(JSON.stringify(state)),
      "Tive dificuldade",
      c,
    );
    expect(r.state.meal_schedule_id).toBe("meal");
    expect(r.state.stage).toBe("meal_difficulty_consent");
  });
  it("IA não reinterpreta escolhas explícitas sobre a refeição", async () => {
    const c = context();
    const generate = vi.fn();
    await orchestrateConversation(
      ConversationRequestSchema.parse({
        operation: "message",
        message: "Ainda não comi",
        intent: "meal_checkin",
        state: createOpeningTurn("meal_checkin", c).state,
        context: c,
      }),
      {
        llmConfigured: true,
        provider: {
          name: "openai",
          generateStructuredResponse: generate,
        } as never,
      },
    );
    expect(generate).not.toHaveBeenCalled();
  });
  it("segurança mantém prioridade no convite", async () => {
    const c = context();
    const r = await orchestrateConversation(
      ConversationRequestSchema.parse({
        message: "Vou provocar vômito para compensar",
        intent: "meal_checkin",
        context: c,
      }),
      { llmConfigured: false },
    );
    expect(r.source).toBe("safety");
    expect(r.actions.some((a) => a.type === "create_meal_checkin")).toBe(false);
  });
  it("contexto não usa convite de outra pessoa", () => {
    const { i } = current();
    const c = buildUserBehaviorContext(
      "outro",
      { episodeId: "ep" },
      {
        memories: [],
        alternativeThoughts: [],
        strategyTrials: [],
        episodes: [],
        mealSchedules: [],
        interventions: [{ ...i, episode_id: "ep" }],
      },
    );
    expect(c.support_invitation).toBeUndefined();
  });
  it("texto externo é genérico e endpoints não permitem SSRF", () => {
    expect(JSON.stringify(PUSH_COPY)).not.toMatch(
      /culpa|peso|ansiedade|refeição|namorado/i,
    );
    expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(
      true,
    );
    for (const url of [
      "http://localhost",
      "https://127.0.0.1",
      "https://fcm.googleapis.com.evil.test",
      "https://fcm.googleapis.com:444/token",
    ])
      expect(validPushEndpoint(url)).toBe(false);
  });
  it("login preserva convite sem permitir redirecionamento externo", () => {
    const next = "/app/hoje?invitation=11111111-1111-4111-8111-111111111111";
    expect(loginDestination(`?next=${encodeURIComponent(next)}`)).toBe(next);
    expect(loginDestination("?next=https://evil.test")).toBe("/app/hoje");
  });
});
