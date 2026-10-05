import type { Database, UserMemory, BehavioralEpisode } from "./types";
import { strategyKey } from "./microexperiments";
import { memorySimilarity } from "./ai/user-behavior-context";

export type InsightsDatabase = Pick<
  Database,
  | "behavioral_episodes"
  | "difficulty_events"
  | "thought_records"
  | "strategy_trials"
  | "alternative_thoughts"
  | "user_memories"
  | "coping_cards"
>;
export interface InsightsInput {
  userId: string;
  db: InsightsDatabase;
  now?: Date;
  timezone?: string;
}
export interface InsightBlock {
  key: string;
  title: string;
  body: string;
  after?: string;
  north?: string;
  kind: "combination" | "sequence" | "observation" | "resource";
  evidence: "observed" | "pattern";
  evidenceIds: string[];
  episodeIds: string[];
  confidence: number;
  status: "proposed" | "confirmed" | "qualified";
  memoryId?: string;
  memoryContent: string;
  practice?: string;
  priority: number;
  generatedAt: string;
}
export interface InsightsResult {
  blocks: InsightBlock[];
  practice: string | null;
  tooEarly: boolean;
  basedOn: number;
}
export const INSIGHT_WINDOW_DAYS = 90;
export const insightTopic = (key: string) => `aprendizados:${key}`;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const unique = <T extends { id: string }>(rows: T[]) => [
  ...new Map(rows.map((r) => [r.id, r])).values(),
];
const allOrNothing = (s: string) =>
  /estrag(?:uei|ado) tudo|tanto faz|dia.*perdid|amanha (?:eu )?comeco/.test(
    norm(s),
  );
type Situation = {
  id: string;
  episodeId?: string;
  thought: string;
  hunger?: number | null;
  text: string;
  emotions: string[];
  recovery?: string | null;
  early: boolean;
  window?: string;
  immediate?: string | null;
  later?: string | null;
};

// Proposed extraction never becomes evidence just because a field was populated.
function reported<T>(
  e: BehavioralEpisode,
  field: keyof BehavioralEpisode,
  value: T,
): T | undefined {
  const aliases: Partial<Record<keyof BehavioralEpisode, string>> = {
    context_tags: "context",
    hunger_level: "hunger",
    satiety_level: "satiety",
    emotions: "emotion",
    recovery_outcome: "recovery",
    compensatory_behavior: "compensation",
  };
  const evidence = (e.captured_evidence || []).filter(
    (x) => x.field === field || x.field === aliases[field],
  );
  if (!evidence.length) return value;
  const accepted = evidence.filter(
    (x) => x.status === "reported" || x.status === "confirmed",
  );
  if (!accepted.length) return undefined;
  if (Array.isArray(value))
    return value.filter((item) =>
      accepted.some((x) =>
        norm(x.value)
          .split(/[,;|]/)
          .map((s) => s.trim())
          .includes(norm(String(item))),
      ),
    ) as T;
  const pending = evidence.filter(
    (x) =>
      x.status === "proposed" &&
      !accepted.some((a) => norm(a.value) === norm(x.value)),
  );
  if (pending.some((x) => norm(String(value ?? "")).includes(norm(x.value))))
    return undefined;
  return value;
}
function eventWindow(
  at: string | null | undefined,
  precision: string | null | undefined,
  description: string | null | undefined,
  timezone: string,
) {
  if (at && (precision === "exact" || precision === "approximate")) {
    const date = new Date(at);
    if (!Number.isFinite(date.getTime())) return undefined;
    const hour = Number(
      new Intl.DateTimeFormat("en", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: timezone,
      }).format(date),
    );
    return hour < 6
      ? "madrugada"
      : hour < 12
        ? "manhã"
        : hour < 15
          ? "início da tarde"
          : hour < 18
            ? "final da tarde"
            : "noite";
  }
  const text = norm(description || "");
  return /fim|final/.test(text) && /tarde/.test(text)
    ? "final da tarde"
    : /noite/.test(text)
      ? "noite"
      : /manha/.test(text)
        ? "manhã"
        : undefined;
}

function collectSituations(input: InsightsInput): Situation[] {
  const { db, userId } = input;
  const now = (input.now || new Date()).getTime();
  const recent = (at: string) =>
    Date.parse(at) >= now - INSIGHT_WINDOW_DAYS * 86400000 &&
    Date.parse(at) <= now;
  const episodes = unique(
    db.behavioral_episodes.filter((e) => e.user_id === userId),
  );
  const difficulties = unique(
    db.difficulty_events.filter((d) => d.user_id === userId),
  );
  const thoughts = db.thought_records.filter((t) => t.user_id === userId);
  let timezone = input.timezone || "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });
  } catch {
    timezone = "America/Sao_Paulo";
  }
  const rows: Situation[] = [];
  for (const e of episodes) {
    if (
      !recent(e.event_occurred_at || e.created_at) ||
      ["preparation", "strategy_review"].includes(e.episode_type)
    )
      continue;
    if (
      e.episode_type === "meal_checkin" &&
      !e.related_meal_checkin_id &&
      !e.related_difficulty_event_id &&
      !e.conversation_state?.checkin_recorded
    )
      continue;
    if (
      !reported(e, "situation", e.situation) &&
      !reported(e, "behavior", e.behavior)
    )
      continue;
    const event = difficulties.find(
      (d) => d.episode_id === e.id || d.id === e.related_difficulty_event_id,
    );
    const t = thoughts.find((t) => t.difficulty_event_id === event?.id);
    rows.push({
      id: `episode:${e.id}`,
      episodeId: e.id,
      thought:
        reported(e, "automatic_thought", e.automatic_thought) ||
        (!e.automatic_thought ? t?.automatic_thought : "") ||
        "",
      hunger: reported(e, "hunger_level", e.hunger_level),
      text: norm(
        [
          reported(e, "situation", e.situation),
          ...(reported(e, "context_tags", e.context_tags) || []),
          ...(reported(e, "physical_state", e.physical_state) || []),
          reported(e, "behavior", e.behavior),
          reported(e, "urge", e.urge),
        ]
          .filter(Boolean)
          .join(" "),
      ),
      emotions: (reported(e, "emotions", e.emotions) || []).map(norm),
      recovery: reported(e, "recovery_outcome", e.recovery_outcome),
      early:
        e.conversation_state?.noticed_hunger_early === true ||
        t?.noticed_hunger_early === true,
      window: eventWindow(
        e.event_occurred_at,
        e.event_time_precision,
        e.event_time_description,
        timezone,
      ),
      immediate: reported(e, "immediate_consequence", e.immediate_consequence),
      later: reported(e, "later_consequence", e.later_consequence),
    });
  }
  // Preserve legacy data without counting an episode and its difficulty twice.
  for (const d of difficulties) {
    if (
      episodes.some(
        (e) => e.id === d.episode_id || e.related_difficulty_event_id === d.id,
      ) ||
      !recent(d.occurred_at)
    )
      continue;
    const t = thoughts.find((t) => t.difficulty_event_id === d.id);
    rows.push({
      id: `difficulty:${d.id}`,
      thought: t?.automatic_thought || "",
      hunger: d.hunger_intensity ?? t?.hunger_level,
      text: norm(
        [t?.situation, t?.behavior, d.context, ...d.reasons]
          .filter(Boolean)
          .join(" "),
      ),
      emotions: (t?.emotions || []).map(norm),
      recovery: t?.recovery_outcome,
      early: t?.noticed_hunger_early === true,
      window: eventWindow(
        d.occurred_at,
        d.event_time_precision,
        d.event_time_description,
        timezone,
      ),
    });
  }
  return rows;
}

export function buildInsights(input: InsightsInput): InsightsResult {
  const { db, userId } = input;
  const now = input.now || new Date();
  const recent = (at: string) =>
    Date.parse(at) <= now.getTime() &&
    Date.parse(at) >= now.getTime() - INSIGHT_WINDOW_DAYS * 86400000;
  const rows = collectSituations(input);
  const memories = db.user_memories.filter(
    (m) => m.user_id === userId && !m.superseded_at,
  );
  const card = [...db.coping_cards]
    .filter((c) => c.user_id === userId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const candidates: InsightBlock[] = [];
  const add = (
    key: string,
    matched: Situation[],
    content: string,
    practice: string,
    priority: number,
    kind: InsightBlock["kind"] = "combination",
    after?: string,
  ) => {
    if (matched.length < 3) return;
    const memory = memories
      .filter((m) => m.topic === insightTopic(key))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (
      memory?.validation_status === "rejected" ||
      memories.some(
        (m) =>
          m.validation_status === "rejected" &&
          memorySimilarity(m.content, content) >= 0.75,
      )
    )
      return;
    const confirmed = memory?.validation_status === "confirmed";
    const qualified =
      memory?.validation_status === "proposed" && memory.source === "user";
    const block: InsightBlock = {
      key,
      kind,
      title: "O que estamos percebendo",
      body: `${content} Isso apareceu em ${matched.length} situações que tu trouxe.`,
      after,
      evidence: "pattern",
      evidenceIds: matched.map((r) => r.id),
      episodeIds: matched.flatMap((r) => (r.episodeId ? [r.episodeId] : [])),
      confidence: confirmed ? 0.9 : Math.min(0.8, 0.45 + matched.length * 0.05),
      status: confirmed ? "confirmed" : qualified ? "qualified" : "proposed",
      memoryId: memory?.id,
      memoryContent: content,
      practice,
      priority: priority + Math.min(matched.length, 10) + (confirmed ? 5 : 0),
      generatedAt: now.toISOString(),
    };
    if (key.startsWith("all-or-nothing")) {
      const north = [
        card?.why_it_matters,
        card?.future_difference,
        card?.desired_identity,
        card?.reminder_statement,
        card?.main_goal,
      ].find((v) => v && /desist|abandon|retom|continuar|seguir/.test(norm(v)));
      if (north)
        block.north = `No teu Norte, tu escreveu: “${north}”. Talvez olhar para o que acontece depois de uma escolha diferente ajude a entender esse desejo.`;
    }
    candidates.push(block);
  };
  const highHunger = rows.filter((r) => (r.hunger ?? 0) >= 8);
  const delayed = highHunger.filter(
    (r) =>
      /almoco.*atras|atras.*almoco|nao almoc|sem almoc|sem comer|pulei.*almoco/.test(
        r.text,
      ) &&
      !/almoco nao atras|nao atras.*almoco|nao fiquei sem comer/.test(r.text),
  );
  add(
    "delayed-meal-hunger",
    delayed,
    "Almoço atrasado ou um intervalo longo sem comer apareceu junto com fome alta.",
    "Vale observar quando o horário aperta e a fome começa a aumentar, sem esperar chegar no limite.",
    70,
  );
  add(
    "hunger-fatigue",
    highHunger.filter((r) => /cans|sono|exaust/.test(r.text)),
    "Fome alta e cansaço apareceram juntos nas situações que tu contou.",
    "Vale notar qual sinal aparece primeiro: fome ou cansaço.",
    60,
  );
  add(
    "anxiety-social-night",
    rows.filter(
      (r) =>
        r.emotions.some((e) => /ansied|ansios/.test(e)) &&
        /amig|festa|social|famil|restaurante/.test(r.text) &&
        r.window === "noite",
    ),
    "Ansiedade apareceu junto com situações sociais à noite.",
    "Vale observar o que acontece pouco antes de a ansiedade aparecer nessas situações.",
    60,
  );
  const extremes = rows.filter((r) => allOrNothing(r.thought));
  const abandonment = extremes.filter((r) => r.recovery === "abandonou_dia");
  const compensation = extremes.filter((r) => r.recovery === "compensou");
  add(
    "all-or-nothing-abandonment",
    abandonment,
    "O pensamento de que uma escolha diferente estragou tudo apareceu em situações que depois viraram abandono do restante do dia.",
    "Vale perceber o “já que...” antes da próxima decisão. Uma coisa é o que aconteceu; outra é a conclusão que veio depois.",
    100,
    "sequence",
    "Nesses relatos, o pensamento veio acompanhado da dificuldade de retomar. Isso mostra uma sequência, não prova uma causa.",
  );
  add(
    "all-or-nothing-compensation",
    compensation,
    "Pensamentos como “já estraguei tudo” apareceram em situações seguidas de compensação.",
    "Vale levar esse ciclo à conversa e ao profissional que te acompanha, sem transformar compensação em plano.",
    105,
    "sequence",
  );
  if (abandonment.length < 3 && compensation.length < 3)
    add(
      "all-or-nothing",
      extremes,
      "Pensamentos como “já estraguei tudo” ou “tanto faz” estão reaparecendo.",
      "Vale notar quando esse pensamento aparece, antes de decidir o que fazer depois.",
      65,
      "observation",
    );
  const repeatedThoughts = new Map<string, Situation[]>();
  for (const r of rows.filter((r) => r.thought && !allOrNothing(r.thought))) {
    const key = norm(r.thought)
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ");
    repeatedThoughts.set(key, [...(repeatedThoughts.get(key) || []), r]);
  }
  for (const [thought, matched] of repeatedThoughts)
    add(
      `thought-${strategyKey("thought", thought)}`,
      matched,
      `A frase “${matched[0].thought}” apareceu em mais de uma situação.`,
      "Vale perceber quando essa frase aparece e o que tu acaba fazendo depois.",
      50,
      "observation",
    );
  add(
    "reward-relief-guilt",
    rows.filter(
      (r) =>
        /merec/.test(norm(r.thought)) &&
        /alivio/.test(norm(r.immediate || "")) &&
        /culpa/.test(norm(r.later || "")),
    ),
    "O “eu mereço” apareceu em relatos com alívio na hora e culpa depois.",
    "Vale observar o que tu precisava naquele momento, sem tratar a vontade de comer como errada.",
    85,
    "sequence",
  );
  add(
    "early-hunger-recovery",
    rows.filter(
      (r) =>
        r.early && ["retomou", "retomou_depois"].includes(r.recovery || ""),
    ),
    "Perceber a fome mais cedo apareceu em situações em que tu conseguiu retomar depois.",
    "Vale observar se perceber o sinal mais cedo ajuda também nas próximas situações.",
    55,
  );
  for (const window of [
    "manhã",
    "início da tarde",
    "final da tarde",
    "noite",
    "madrugada",
  ])
    add(
      `time-${window}`,
      rows.filter((r) => r.window === window),
      `Há relatos de situações na faixa de ${window}. Ainda não dá para dizer que esse horário, por si só, dificulta as coisas.`,
      `Vale observar o que costuma acontecer antes dessas situações na faixa de ${window}.`,
      10,
      "observation",
    );

  const resource = (
    key: string,
    body: string,
    ids: string[],
    priority: number,
    practice?: string,
  ): InsightBlock => ({
    key,
    title: "O que tem ajudado",
    body,
    kind: "resource",
    evidence: ids.length >= 3 ? "pattern" : "observed",
    evidenceIds: ids,
    episodeIds: [],
    confidence: 1,
    status: "confirmed",
    memoryContent: body,
    priority,
    practice,
    generatedAt: now.toISOString(),
  });
  const resources: InsightBlock[] = [];
  const allTrials = unique(
    db.strategy_trials.filter((t) => t.user_id === userId),
  );
  const trials = allTrials.filter((t) => recent(t.tested_at || t.updated_at));
  const groups = new Map<string, typeof trials>();
  for (const t of trials) {
    const key =
      t.strategy_id ||
      t.strategy_key ||
      strategyKey(
        t.trigger_context || "",
        t.experiment_action || t.title_snapshot,
      );
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  for (const [key, group] of groups) {
    const tested = group.filter((t) =>
      ["helped", "partially_helped", "did_not_help"].includes(t.result),
    );
    const helped = tested.filter((t) => t.result === "helped").length;
    const partial = tested.filter(
      (t) => t.result === "partially_helped",
    ).length;
    const failed = tested.filter((t) => t.result === "did_not_help").length;
    const latest = [...group].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    )[0];
    if (
      !tested.length ||
      helped + partial <= failed ||
      latest.result === "discarded" ||
      latest.result === "did_not_help"
    )
      continue;
    const wording =
      tested.length === 1
        ? helped
          ? "Ajudou dessa vez."
          : "Ajudou em parte dessa vez."
        : `Nos ${tested.length} testes relatados, ajudou em ${helped}, ajudou em parte em ${partial} e não ajudou em ${failed}.`;
    resources.push(
      resource(
        `strategy-${key}`,
        `“${latest.title_snapshot}”. ${wording} Isso ainda não é uma regra para toda situação.`,
        tested.map((t) => `trial:${t.id}`),
        40 + helped * 2,
        `Vale avaliar se “${latest.title_snapshot}” ainda cabe numa situação parecida.`,
      ),
    );
  }
  for (const alt of db.alternative_thoughts.filter(
    (a) => a.user_id === userId,
  )) {
    const reviews = new Map<string, BehavioralEpisode>();
    for (const e of [...db.behavioral_episodes]
      .filter((e) => e.user_id === userId)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
      const trialId = String(e.conversation_state?.pending_strategy_id || "");
      if (
        allTrials.some(
          (t) => t.id === trialId && t.alternative_thought_id === alt.id,
        ) &&
        e.conversation_state?.cognitive_result &&
        recent(e.updated_at)
      )
        reviews.set(trialId, e);
    }
    const used = [...reviews.values()].filter((e) =>
      ["helped_changed", "thought_only", "did_not_help"].includes(
        String(e.conversation_state.cognitive_result),
      ),
    );
    const helped = used.filter(
      (e) => e.conversation_state.cognitive_result === "helped_changed",
    );
    if (helped.length && alt.result !== "did_not_help")
      resources.push(
        resource(
          `alternative-${alt.id}`,
          `“${alt.alternative}”. Tu lembrou dessa resposta em ${used.length} situações avaliadas; em ${helped.length}, relatou que ela mudou o que fez depois.`,
          used.map((e) => `episode:${e.id}`),
          50 + helped.length,
          "Essa resposta ainda faz sentido numa situação parecida? Vale retomar na conversa.",
        ),
      );
    else if (
      alt.result === "helped_changed" &&
      alt.times_used > 0 &&
      !reviews.size &&
      recent(alt.last_used_at || alt.updated_at)
    )
      resources.push(
        resource(
          `alternative-${alt.id}`,
          `“${alt.alternative}”. No último uso relatado, pensar diferente mudou o que tu fez. Ainda não dá para chamar isso de padrão.`,
          [`alternative:${alt.id}`],
          35,
        ),
      );
  }
  for (const m of memories.filter(
    (m) =>
      m.memory_kind === "protective_factor" &&
      m.validation_status === "confirmed",
  ))
    resources.push(
      resource(
        `protective-${m.id}`,
        `Tu confirmou que isso te ajuda: “${m.content}”.`,
        [`memory:${m.id}`],
        30,
      ),
    );
  candidates.sort(
    (a, b) => b.priority - a.priority || a.key.localeCompare(b.key),
  );
  const selected: InsightBlock[] = [];
  for (const c of candidates) {
    // Avoid repeating the same evidence as several cards with different headings.
    if (
      selected.some((s) =>
        c.evidenceIds.every((id) => s.evidenceIds.includes(id)),
      )
    )
      continue;
    selected.push(c);
    if (selected.length === 2) break;
  }
  if (selected[1]) selected[1].title = "O que também aparece";
  resources.sort(
    (a, b) => b.priority - a.priority || a.key.localeCompare(b.key),
  );
  if (resources[0]) selected.push(resources[0]);
  let practice =
    selected.find((b) => b.kind !== "resource" && b.status !== "qualified")
      ?.practice ||
    resources[0]?.practice ||
    null;
  if (!practice) {
    const pending = [...trials]
      .filter((t) => t.result === "not_tested")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (pending)
      practice = `“${pending.title_snapshot}” ainda está em teste. Quando a situação acontecer, vale observar o que muda. Ainda não sabemos se ajuda.`;
    else {
      const pendingAlt = db.alternative_thoughts.find(
        (a) =>
          a.user_id === userId &&
          a.result === "pending" &&
          (a.belief_level ?? 0) >= 4,
      );
      if (pendingAlt)
        practice = `Tu construiu a resposta “${pendingAlt.alternative}”. Ainda não temos um uso avaliado para saber se ajuda.`;
    }
  }
  return {
    blocks: selected,
    practice,
    tooEarly: !selected.length,
    basedOn: rows.length,
  };
}

export type InsightFeedback = "confirmed" | "qualified" | "rejected";
export function insightFeedbackMemory(
  userId: string,
  block: InsightBlock,
  choice: InsightFeedback,
  id: string,
  now: Date,
  previous?: UserMemory,
): UserMemory {
  if (block.kind === "resource" || (previous && previous.user_id !== userId))
    throw new Error("Aprendizado inválido.");
  return {
    id: previous?.id || id,
    user_id: userId,
    topic: insightTopic(block.key),
    memory_kind: "pattern",
    content: block.memoryContent,
    source: "user",
    validation_status: choice === "qualified" ? "proposed" : choice,
    confidence: choice === "confirmed" ? 0.9 : choice === "qualified" ? 0.4 : 0,
    evidence_count: block.evidenceIds.length,
    importance: 0.8,
    source_conversation_id: previous?.source_conversation_id || null,
    last_confirmed_at: choice === "confirmed" ? now.toISOString() : null,
    last_used_at: previous?.last_used_at || null,
    superseded_at: null,
    created_at: previous?.created_at || now.toISOString(),
    updated_at: now.toISOString(),
  };
}
