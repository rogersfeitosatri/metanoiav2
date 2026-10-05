import { describe, expect, it } from "vitest";
import { computeEvolution, type EvolutionInput } from "../evolution";
import { initialEpisodeFields } from "../behavioral-episodes";
import type {
  BehavioralEpisode,
  DifficultyEvent,
  ThoughtRecord,
} from "../types";
const now = new Date("2026-09-07T22:00:00Z");
const current = "2026-09-06T16:00:00Z",
  previous = "2026-08-28T16:00:00Z";
function input(n: number, p: number): EvolutionInput {
  const difficulties = Array.from(
    { length: n + p },
    (_, i) =>
      ({
        id: String(i),
        user_id: "u",
        occurred_at: i < n ? current : previous,
        created_at: current,
        reasons: [],
      }) as DifficultyEvent,
  );
  return {
    userId: "u",
    now,
    difficulties,
    thoughts: [],
    trials: [],
    altThoughts: [],
  };
}
function thoughts(
  i: EvolutionInput,
  indices: number[],
  extra: Partial<ThoughtRecord>,
) {
  i.thoughts = indices.map((n) => ({
    id: `t${n}`,
    user_id: "u",
    difficulty_event_id: String(n),
    emotions: [],
    created_at: current,
    ...extra,
  }));
}
describe("Evolução por oportunidades", () => {
  it("convite de refeição sem ocorrência confirmada não vira oportunidade", () => {
    const i = input(0, 0);
    i.episodes = [
      {
        ...initialEpisodeFields("meal_checkin"),
        id: "meal-episode",
        user_id: "u",
        conversation_id: "c",
        started_at: current,
        created_at: current,
        updated_at: current,
        situation: "Ainda não comi",
        behavior: "Ainda não comi",
        conversation_state: {},
        status: "active",
        context_tags: [],
        physical_state: [],
        emotions: [],
        captured_evidence: [],
        followup_required: false,
      } as BehavioralEpisode,
    ];
    const r = computeEvolution(i);
    expect(r.situationsThisWeek).toBe(0);
    expect(r.tooEarly).toBe(true);
  });
  it("4/10 não é melhora sobre 3/3 e amostra pequena não dá tendência", () => {
    const i = input(10, 3);
    thoughts(i, [0, 1, 2, 3, 10, 11, 12], {
      automatic_thought: "Já estraguei tudo",
    });
    const d = computeEvolution(i).dimensions.find(
      (d) => d.key === "pensamentos",
    )!;
    expect(d.count.proportion).toBe(0.4);
    expect(d.previous.proportion).toBe(1);
    expect(d.trend).toBeUndefined();
  });
  it("2/5 para 4/5 destaca retomada", () => {
    const i = input(5, 5);
    thoughts(i, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], {
      recovery_outcome: "abandonou_dia",
    });
    [0, 1, 2, 3, 5, 6].forEach(
      (n) => (i.thoughts[n].recovery_outcome = "retomou"),
    );
    expect(computeEvolution(i).headline).toContain("de 2/5 para 4/5");
  });
  it("conta episódio sem thought_record e não duplica sua dificuldade", () => {
    const i = input(1, 0);
    const e = {
      ...initialEpisodeFields("register_event"),
      id: "ep",
      user_id: "u",
      conversation_id: "c",
      situation: "Reunião",
      physical_state: ["cansaço"],
      emotions: ["frustração"],
      event_occurred_at: current,
      started_at: current,
      updated_at: current,
      created_at: current,
    } as BehavioralEpisode;
    i.episodes = [e];
    i.difficulties[0].episode_id = "ep";
    const result = computeEvolution(i);
    expect(result.situationsThisWeek).toBe(1);
    expect(result.dimensions.find((d) => d.key === "corporal")?.count.of).toBe(
      1,
    );
  });
  it("não usa ausência de informação como ausência de compensação", () => {
    const i = input(5, 0);
    expect(
      computeEvolution(i).dimensions.find((d) => d.key === "compensacao")?.count
        .total,
    ).toBe(0);
  });
  it("período sem registros não produz estabilidade", () => {
    const i = input(0, 5);
    thoughts(i, [0], { automatic_thought: "Só hoje" });
    const r = computeEvolution(i);
    expect(r.headline).toContain("não temos registros suficientes");
    expect(r.dimensions.every((d) => !d.trend)).toBe(true);
  });
  it("não mistura usuários nem inventa uso com times_used", () => {
    const i = input(0, 0);
    i.altThoughts = [
      {
        id: "a",
        user_id: "outro",
        original_thought: "x",
        alternative: "y",
        result: "helped_changed",
        times_used: 99,
        created_at: current,
        updated_at: current,
      },
    ];
    expect(computeEvolution(i).dimensions).toEqual([]);
  });
  it("separa criação de alternativa, uso e mudança em cada tentativa", () => {
    const i = input(0, 0);
    i.episodes = Array.from(
      { length: 3 },
      (_, n) =>
        ({
          ...initialEpisodeFields("review_strategy"),
          id: `e${n}`,
          user_id: "u",
          conversation_id: "c",
          started_at: current,
          created_at: current,
          updated_at: current,
          status: "resolved",
          context_tags: [],
          physical_state: [],
          emotions: [],
          captured_evidence: [],
          followup_required: false,
          conversation_state: {
            pending_strategy_id: `s${n}`,
            cognitive_result: n === 2 ? "thought_only" : "helped_changed",
          },
        }) as BehavioralEpisode,
    );
    const d = computeEvolution(i).dimensions.find(
      (d) => d.key === "alternativos",
    )!;
    expect(d.count).toMatchObject({ of: 3, total: 3 });
    expect(d.statement).toContain("em 2, pensar diferente");
  });
});
