import type {
  AlternativeThought,
  BehavioralEpisode,
  DifficultyEvent,
  StrategyTrial,
  ThoughtRecord,
} from "./types";

export type EvidenceLevel = "insufficient" | "observed" | "pattern";
export interface Rate {
  of: number;
  total: number;
  proportion: number | null;
}
export interface SkillDimension {
  key: string;
  label: string;
  statement: string;
  count: Rate;
  previous: Rate;
  evidence: EvidenceLevel;
  recentWeeks?: Rate[];
  trend?: "up" | "stable" | "down";
}
export interface EvolutionInput {
  userId?: string;
  difficulties: DifficultyEvent[];
  thoughts: ThoughtRecord[];
  trials: StrategyTrial[];
  altThoughts: AlternativeThought[];
  episodes?: BehavioralEpisode[];
  periodStart?: Date;
  now?: Date;
}
export interface EvolutionSummary {
  situationsThisWeek: number;
  situationsPreviousWeek: number;
  headline: string;
  dimensions: SkillDimension[];
  tooEarly: boolean;
}
const DAY = 86400000;
export const MIN_TREND_SAMPLE = 5;
const rate = (of: number, total: number): Rate => ({
  of,
  total,
  proportion: total ? of / total : null,
});
const within = (iso: string | null | undefined, start: number, end: number) => {
  const time = iso ? Date.parse(iso) : NaN;
  return time >= start && time < end;
};
type Situation = {
  id: string;
  at: string;
  e?: BehavioralEpisode;
  t?: ThoughtRecord;
};

function situations(
  input: EvolutionInput,
  owner: string | undefined,
): Situation[] {
  const ownedEpisodes = (input.episodes || []).filter(
    (e) => e.user_id === owner,
  );
  const episodes = ownedEpisodes.filter(
    (e) =>
      e.episode_type !== "preparation" &&
      e.episode_type !== "strategy_review" &&
      (e.episode_type !== "meal_checkin" ||
        Boolean(
          e.related_meal_checkin_id ||
            e.related_difficulty_event_id ||
            e.conversation_state?.checkin_recorded,
        )) &&
      Boolean(e.situation || e.behavior),
  );
  const thoughts = input.thoughts.filter((t) => t.user_id === owner);
  const values: Situation[] = episodes.map((e) => {
    const events = input.difficulties.filter(
      (d) =>
        d.user_id === owner &&
        (d.episode_id === e.id || d.id === e.related_difficulty_event_id),
    );
    return {
      id: e.id,
      at: e.event_occurred_at || e.started_at,
      e,
      t: thoughts.find((t) =>
        events.some((d) => d.id === t.difficulty_event_id),
      ),
    };
  });
  for (const d of input.difficulties.filter(
    (d) =>
      d.user_id === owner &&
      !ownedEpisodes.some(
        (e) => e.id === d.episode_id || e.related_difficulty_event_id === d.id,
      ),
  )) {
    if (!values.some((v) => v.id === d.id))
      values.push({
        id: d.id,
        at: d.occurred_at,
        t: thoughts.find((t) => t.difficulty_event_id === d.id),
      });
  }
  return values;
}

export function computeEvolution(input: EvolutionInput): EvolutionSummary {
  const owners = new Set(
    [
      ...input.difficulties,
      ...input.thoughts,
      ...input.trials,
      ...input.altThoughts,
      ...(input.episodes || []),
    ].map((r) => r.user_id),
  );
  // Compatibility for isolated callers; mixed data without an owner fails closed.
  const owner =
    input.userId || (owners.size === 1 ? [...owners][0] : undefined);
  const end = (input.now || new Date()).getTime();
  const start = input.periodStart?.getTime() ?? end - 7 * DAY;
  const previousStart = start - (end - start);
  const rows = situations(input, owner);
  const cur = rows.filter((r) => within(r.at, start, end)),
    prev = rows.filter((r) => within(r.at, previousStart, start));
  const dimensions: SkillDimension[] = [];
  const add = (
    key: string,
    label: string,
    count: Rate,
    previous: Rate,
    statement: string,
  ) => {
    let trend: SkillDimension["trend"];
    if (count.total >= MIN_TREND_SAMPLE && previous.total >= MIN_TREND_SAMPLE) {
      const delta = count.proportion! - previous.proportion!;
      trend = Math.abs(delta) < 0.1 ? "stable" : delta > 0 ? "up" : "down";
    }
    dimensions.push({
      key,
      label,
      count,
      previous,
      statement,
      trend,
      evidence:
        count.total < 2
          ? "insufficient"
          : count.total < MIN_TREND_SAMPLE
            ? "observed"
            : "pattern",
    });
  };
  const pair = (
    eligible: (r: Situation) => boolean,
    positive: (r: Situation) => boolean,
  ): [Rate, Rate] =>
    [cur, prev].map((list) => {
      const available = list.filter(eligible);
      return rate(available.filter(positive).length, available.length);
    }) as [Rate, Rate];
  const thought = (r: Situation) =>
    Boolean(r.e?.automatic_thought || r.t?.automatic_thought);
  const outcome = (r: Situation) =>
    r.e?.recovery_outcome || r.t?.recovery_outcome;
  if (cur.length || prev.length) {
    let [a, b] = pair(() => true, thought);
    const alone = cur.filter(
      (r) =>
        thought(r) &&
        (r.e?.conversation_state?.thought_self_identified ??
          r.t?.thought_self_identified) === true,
    ).length;
    const assisted = cur.filter(
      (r) =>
        thought(r) &&
        (r.e?.conversation_state?.thought_self_identified ??
          r.t?.thought_self_identified) === false,
    ).length;
    add(
      "pensamentos",
      "Reconhecimento de pensamentos",
      a,
      b,
      `Tu identificou pensamentos em ${a.of} de ${a.total} situações registradas. ${alone} sem precisar de ajuda para nomear; ${assisted} com apoio. Nos demais, a autonomia não foi informada.`,
    );
    [a, b] = pair(
      () => true,
      (r) => Boolean(r.e?.emotions?.length || r.t?.emotions?.length),
    );
    add(
      "emocoes",
      "Reconhecimento de emoções",
      a,
      b,
      `Tu nomeou o que sentia em ${a.of} de ${a.total} situações registradas.`,
    );
    [a, b] = pair(
      () => true,
      (r) =>
        typeof (r.e?.hunger_level ?? r.t?.hunger_level) === "number" ||
        Boolean(r.e?.physical_state?.length),
    );
    add(
      "corporal",
      "Reconhecimento corporal",
      a,
      b,
      `Tu reconheceu fome ou outros sinais do corpo em ${a.of} de ${a.total} situações. O nível de fome, sozinho, não diz quando tu percebeu o sinal.`,
    );
    [a, b] = pair(
      (r) => Boolean(outcome(r) && outcome(r) !== "indefinido"),
      (r) => ["retomou", "retomou_depois"].includes(outcome(r) || ""),
    );
    const countOutcome = (value: string) =>
      cur.filter((r) => outcome(r) === value).length;
    add(
      "retomada",
      "Retomada",
      a,
      b,
      a.total
        ? `Em ${a.of} de ${a.total} situações com desfecho informado, tu conseguiu retomar. ${countOutcome("retomou")} na próxima oportunidade; ${countOutcome("retomou_depois")} depois; ${countOutcome("abandonou_dia")} continuaram pelo dia; ${countOutcome("compensou")} tiveram compensação relatada.`
        : "Ainda falta saber o que aconteceu depois das situações registradas.",
    );
    dimensions.at(-1)!.recentWeeks = Array.from({ length: 4 }, (_, n) => {
      const week = rows.filter(
        (r) =>
          within(r.at, end - (4 - n) * 7 * DAY, end - (3 - n) * 7 * DAY) &&
          Boolean(outcome(r) && outcome(r) !== "indefinido"),
      );
      return rate(
        week.filter((r) =>
          ["retomou", "retomou_depois"].includes(outcome(r) || ""),
        ).length,
        week.length,
      );
    });
    [a, b] = pair(
      (r) =>
        Boolean(
          r.e?.compensatory_behavior ||
            (outcome(r) && outcome(r) !== "indefinido"),
        ),
      (r) => !r.e?.compensatory_behavior && outcome(r) !== "compensou",
    );
    add(
      "compensacao",
      "Retomada sem compensação",
      a,
      b,
      a.total
        ? `Em ${a.of} de ${a.total} situações com desfecho conhecido, não houve relato de compensação.`
        : "Ainda não há desfechos suficientes para acompanhar compensação.",
    );
    [a, b] = pair(
      () => true,
      (r) => Boolean(r.e?.decision_point || r.t?.decision_point),
    );
    add(
      "decisao",
      "Ponto de decisão",
      a,
      b,
      `Tu identificou um ponto em que poderia escolher diferente em ${a.of} de ${a.total} situações. Ainda não sabemos se foi percebido durante ou depois.`,
    );
  }
  const ownedTrials = input.trials.filter((t) => t.user_id === owner);
  const trialWindow = (from: number, to: number) =>
    ownedTrials.filter((t) => within(t.tested_at || t.updated_at, from, to));
  const trials = trialWindow(start, end),
    previousTrials = trialWindow(previousStart, start);
  const tested = (t: StrategyTrial) =>
    ["helped", "partially_helped", "did_not_help"].includes(t.result);
  const opportunity = (t: StrategyTrial) =>
    tested(t) || t.result === "did_not_use";
  if (trials.some(opportunity) || previousTrials.some(opportunity)) {
    add(
      "estrategias",
      "Uso de estratégias",
      rate(trials.filter(tested).length, trials.filter(opportunity).length),
      rate(
        previousTrials.filter(tested).length,
        previousTrials.filter(opportunity).length,
      ),
      `Tu testou em ${trials.filter(tested).length} de ${trials.filter(opportunity).length} oportunidades informadas. ${trials.filter((t) => t.result === "helped").length} ajudaram, ${trials.filter((t) => t.result === "partially_helped").length} ajudaram em parte e ${trials.filter((t) => t.result === "did_not_help").length} não ajudaram. ${trials
        .filter(tested)
        .map((t) => t.title_snapshot)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 2)
        .join("; ")}`,
    );
  }
  // Per-review evidence: never multiply the latest result by lifetime times_used.
  const reviews = (input.episodes || []).filter(
    (e) =>
      e.user_id === owner &&
      e.conversation_state?.cognitive_result &&
      e.conversation_state?.pending_strategy_id,
  );
  const unique = [
    ...new Map(
      reviews
        .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
        .map((e) => [String(e.conversation_state.pending_strategy_id), e]),
    ).values(),
  ];
  const currentCognitive = unique.filter((e) =>
      within(e.updated_at, start, end),
    ),
    previousCognitive = unique.filter((e) =>
      within(e.updated_at, previousStart, start),
    );
  const built = input.altThoughts.filter(
    (a) => a.user_id === owner && within(a.created_at, start, end),
  ).length;
  if (built || currentCognitive.length || previousCognitive.length) {
    const used = (e: BehavioralEpisode) =>
      e.conversation_state.cognitive_result !== "did_not_use";
    const changed = currentCognitive.filter(
      (e) => e.conversation_state.cognitive_result === "helped_changed",
    ).length;
    add(
      "alternativos",
      "Pensamentos alternativos",
      rate(currentCognitive.filter(used).length, currentCognitive.length),
      rate(previousCognitive.filter(used).length, previousCognitive.length),
      `${built} respostas alternativas construídas neste período. Em ${currentCognitive.filter(used).length} de ${currentCognitive.length} oportunidades avaliadas, tu lembrou da resposta; em ${changed}, pensar diferente mudou o que tu fez depois. Criar uma frase ainda não comprova seu uso.`,
    );
  }
  const change = dimensions
    .filter((d) => d.trend === "up")
    .sort(
      (a, b) =>
        b.count.proportion! -
        b.previous.proportion! -
        (a.count.proportion! - a.previous.proportion!),
    )[0];
  const recovery = dimensions.find((d) => d.key === "retomada");
  const recent = Boolean(
    cur.length || trials.some(opportunity) || built || currentCognitive.length,
  );
  const headline = !recent
    ? "Ainda não temos registros suficientes deste período para comparar."
    : change
      ? `${change.label}: de ${change.previous.of}/${change.previous.total} para ${change.count.of}/${change.count.total} nas situações registradas. Essa é a principal mudança recente.`
      : recovery?.count.of
        ? `Tu conseguiu retomar em ${recovery.count.of} de ${recovery.count.total} situações com desfecho conhecido. Ainda não há base para afirmar uma tendência.`
        : "Os registros mostram o que tu está percebendo e testando. Ainda não há base para afirmar uma tendência.";
  return {
    situationsThisWeek: cur.length,
    situationsPreviousWeek: prev.length,
    headline,
    dimensions,
    tooEarly: !recent && !prev.length,
  };
}
