import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AlternativeThought,
  BehavioralEpisode,
  CopingCard,
  Database,
  MealSchedule,
  Profile,
  StrategyTrial,
  UserMemory,
} from "../types";
import { ConversationContextSchema, type ConversationContext } from "./schemas";

export const BEHAVIOR_CONTEXT_LIMITS = {
  north: 4,
  memories: 6,
  rejected: 2,
  alternatives: 3,
  effectiveStrategies: 2,
  ineffectiveStrategies: 1,
  activeExperiments: 3,
  recentEpisodes: 2,
  total: 24,
} as const;

export interface BehaviorContextSource {
  profile?: Profile | null;
  copingCard?: CopingCard | null;
  memories: UserMemory[];
  alternativeThoughts: AlternativeThought[];
  strategyTrials: StrategyTrial[];
  episodes: BehavioralEpisode[];
  mealSchedules: MealSchedule[];
}

export interface BehaviorContextQuery {
  message?: string;
  intent?: string;
  episodeId?: string;
  now?: Date;
}

const STOP_WORDS = new Set([
  "a", "agora", "ainda", "alguma", "ao", "as", "com", "como", "da", "de",
  "do", "e", "ela", "ele", "em", "essa", "esse", "esta", "eu", "foi", "isso",
  "ja", "mais", "mas", "me", "meu", "minha", "na", "nao", "no", "o", "os",
  "ou", "para", "por", "porque", "que", "se", "sem", "so", "ta", "te", "tem",
  "tive", "tu", "um", "uma", "vou",
]);

const CONCEPTS: Array<[string, RegExp]> = [
  ["culpa", /culp|arrepend|fracass|vergonh|nojo/],
  ["tudo_ou_nada", /estraguei|tanto faz|perdi o dia|desist|larg|amanha comeco/],
  ["ansiedade", /ansios|nervos|angust|preocup/],
  ["fome", /fome|sem comer|nao almoc|nao jant|estomago vazio/],
  ["cansaco", /cansad|exaust|sono|dormi/],
  ["trabalho", /trabalh|reuniao|escritorio|plantao/],
  ["noite", /noite|jantar|fim do dia/],
  ["sexta", /sexta|fim de semana/],
  ["social", /amig|famil|festa|anivers|restaurante/],
  ["compensacao", /compens|jejum|nao vou comer|queimar/],
  ["retomada", /retom|seguir normalmente|proxima decisao|continuar normalmente/],
];

export function buildUserBehaviorContext(
  userId: string,
  query: BehaviorContextQuery,
  rawSource: BehaviorContextSource
): ConversationContext {
  const now = query.now || new Date();
  const queryText = `${query.message || ""} ${query.intent || ""}`.trim();
  const source = isolateUserSource(userId, rawSource);

  const northItems = buildNorthItems(source.copingCard, queryText).slice(
    0,
    BEHAVIOR_CONTEXT_LIMITS.north
  );

  const rankedMemories = source.memories
    .filter((memory) => !memory.superseded_at)
    .map((memory) => ({
      memory,
      relevance: memoryRelevance(memory, queryText, now),
      topical: textRelevance(queryText, `${memory.topic} ${memory.content}`),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  const relevantMemories = rankedMemories
    .filter(({ memory, relevance, topical }) => {
      if (memory.validation_status === "rejected") return false;
      if (memory.validation_status === "proposed" && !queryText) return false;
      return queryText ? topical >= 8 : relevance >= 20;
    })
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.memories)
    .map(({ memory, relevance }) => ({
      id: memory.id,
      memory_kind: memory.memory_kind,
      topic: memory.topic,
      content: memory.content,
      validation_status: memory.validation_status as "confirmed" | "proposed",
      confidence: memory.confidence,
      evidence_count: memory.evidence_count || 1,
      relevance,
    }));

  const rejectedHypotheses = rankedMemories
    .filter(
      ({ memory, topical }) =>
        memory.validation_status === "rejected" && queryText.length > 0 && topical >= 8
    )
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.rejected)
    .map(({ memory }) => ({ id: memory.id, topic: memory.topic, content: memory.content }));

  const alternatives = source.alternativeThoughts
    .filter((item) => (item.belief_level ?? 0) >= 4 && item.result !== "did_not_help")
    .map((item) => ({
      item,
      relevance: alternativeRelevance(item, queryText, now),
      topical: textRelevance(queryText, `${item.original_thought} ${item.alternative}`),
    }))
    .filter(({ relevance, topical }) => queryText ? topical >= 8 : relevance >= 24)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.alternatives)
    .map(({ item, relevance }) => ({
      id: item.id,
      original_thought: item.original_thought,
      alternative: item.alternative,
      belief_level: item.belief_level ?? null,
      result: item.result,
      relevance,
    }));

  const strategyGroups = groupStrategyTrials(source.strategyTrials, queryText, now);
  const effectiveStrategies = strategyGroups
    .filter((group) => group.helpedCount >= 2 && group.didNotHelpCount < group.helpedCount)
    .filter((group) => !queryText || group.topical >= 8)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.effectiveStrategies)
    .map((group) => ({
      key: group.key,
      title: group.latest.title_snapshot,
      trigger_context: group.latest.trigger_context || null,
      experiment_action: group.latest.experiment_action || null,
      helped_count: group.helpedCount,
      partial_count: group.partialCount,
      relevance: group.relevance,
    }));
  const ineffectiveStrategies = strategyGroups
    .filter((group) => group.didNotHelpCount >= 2 && group.helpedCount === 0)
    .filter((group) => !queryText || group.topical >= 8)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.ineffectiveStrategies)
    .map((group) => ({
      key: group.key,
      title: group.latest.title_snapshot,
      did_not_help_count: group.didNotHelpCount,
      relevance: group.relevance,
    }));

  const pendingStrategies = source.strategyTrials
    .filter((trial) => trial.result === "not_tested" || trial.result === "situation_not_occurred")
    .map((trial) => ({ trial, relevance: trialRelevance(trial, queryText, now) }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.activeExperiments)
    .map(({ trial }) => ({
      id: trial.id,
      title: trial.title_snapshot,
      strategy_key: trial.strategy_key,
      trigger_context: trial.trigger_context,
      experiment_action: trial.experiment_action,
      test_objective: trial.test_objective,
      confidence_level: trial.confidence_level,
      alternative_thought_id: trial.alternative_thought_id,
      alternative_thought: trial.alternative_thought_id
        ? source.alternativeThoughts.find((item) => item.id === trial.alternative_thought_id)
            ?.alternative || null
        : null,
    }));

  const recentEpisodes = source.episodes
    .map((episode) => ({
      episode,
      relevance:
        (episode.id === query.episodeId ? 45 : 0) +
        textRelevance(
          queryText,
          `${episode.situation || ""} ${episode.automatic_thought || ""} ${episode.context_tags.join(" ")}`
        ) +
        recencyScore(episode.event_occurred_at || episode.updated_at, now),
    }))
    .filter(({ episode, relevance }) =>
      episode.id === query.episodeId ||
      (queryText ? textRelevance(queryText, `${episode.situation || ""} ${episode.automatic_thought || ""} ${episode.context_tags.join(" ")}`) >= 8 : relevance >= 18)
    )
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, BEHAVIOR_CONTEXT_LIMITS.recentEpisodes)
    .map(({ episode, relevance }) => ({
      id: episode.id,
      situation: episode.situation || null,
      automatic_thought: episode.automatic_thought || null,
      main_influencing_factor: episode.main_influencing_factor || null,
      event_occurred_at: episode.event_occurred_at || null,
      relevance: clampScore(relevance),
    }));

  const meals = source.mealSchedules
    .filter((meal) => meal.active)
    .slice(0, 20)
    .map((meal) => ({
      id: meal.id,
      name: meal.name,
      time: meal.time_of_day.slice(0, 5),
      due: isMealDue(meal, now),
    }));

  const selectedItems =
    northItems.length + relevantMemories.length + rejectedHypotheses.length +
    alternatives.length + effectiveStrategies.length + ineffectiveStrategies.length +
    pendingStrategies.length + recentEpisodes.length;

  return ConversationContextSchema.parse({
    preferred_name: source.profile?.preferred_name,
    north: northItems.map((item) => item.content),
    confirmed_memories: relevantMemories
      .filter((item) => item.validation_status === "confirmed")
      .map((item) => item.content),
    proposed_hypotheses: relevantMemories
      .filter((item) => item.validation_status === "proposed")
      .map((item) => item.content),
    effective_strategies: effectiveStrategies.map((item) => item.title),
    pending_strategies: pendingStrategies,
    meals,
    recent_learnings: [],
    north_items: northItems,
    relevant_memories: relevantMemories,
    rejected_hypotheses: rejectedHypotheses,
    alternative_thoughts: alternatives,
    effective_strategy_resources: effectiveStrategies,
    ineffective_strategy_resources: ineffectiveStrategies,
    recent_episodes: recentEpisodes,
    context_meta: {
      selected_items: Math.min(selectedItems, BEHAVIOR_CONTEXT_LIMITS.total),
      max_items: BEHAVIOR_CONTEXT_LIMITS.total,
    },
  });
}

export function behaviorContextSourceFromDatabase(
  database: Database,
  userId: string
): BehaviorContextSource {
  return {
    profile: database.profiles.find((item) => item.id === userId),
    copingCard: database.coping_cards.find((item) => item.user_id === userId),
    memories: database.user_memories.filter((item) => item.user_id === userId),
    alternativeThoughts: database.alternative_thoughts.filter((item) => item.user_id === userId),
    strategyTrials: database.strategy_trials.filter((item) => item.user_id === userId),
    episodes: database.behavioral_episodes.filter((item) => item.user_id === userId),
    mealSchedules: database.meal_schedules.filter((item) => item.user_id === userId),
  };
}

export async function buildServerUserBehaviorContext(
  supabase: SupabaseClient,
  userId: string,
  query: BehaviorContextQuery
): Promise<ConversationContext> {
  const [profileResult, cardResult, memoryResult, alternativeResult, trialResult, episodeResult, mealResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("coping_cards").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_memories").select("*").eq("user_id", userId).limit(120),
      supabase.from("alternative_thoughts").select("*").eq("user_id", userId).limit(80),
      supabase.from("strategy_trials").select("*").eq("user_id", userId).limit(100),
      supabase.from("behavioral_episodes").select("*").eq("user_id", userId).limit(60),
      supabase.from("meal_schedules").select("*").eq("user_id", userId).eq("active", true).limit(20),
    ]);

  const failures = [profileResult, cardResult, memoryResult, alternativeResult, trialResult, episodeResult, mealResult]
    .map((result) => result.error?.message)
    .filter(Boolean);
  if (failures.length) {
    throw new Error(`Falha ao recuperar contexto comportamental: ${failures.join("; ")}`);
  }

  const context = buildUserBehaviorContext(userId, query, {
    profile: profileResult.data as Profile | null,
    copingCard: cardResult.data as CopingCard | null,
    memories: (memoryResult.data || []) as UserMemory[],
    alternativeThoughts: (alternativeResult.data || []) as AlternativeThought[],
    strategyTrials: (trialResult.data || []) as StrategyTrial[],
    episodes: (episodeResult.data || []) as BehavioralEpisode[],
    mealSchedules: (mealResult.data || []) as MealSchedule[],
  });

  const usedMemoryIds = context.relevant_memories.map((memory) => memory.id);
  if (usedMemoryIds.length) {
    const { error } = await supabase
      .from("user_memories")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", usedMemoryIds);
    if (error) console.warn("Não foi possível atualizar last_used_at das memórias.");
  }
  return context;
}

export function memorySimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

export function findEquivalentMemory(
  memories: UserMemory[],
  candidate: Pick<UserMemory, "memory_kind" | "topic" | "content">
): UserMemory | undefined {
  const normalizedTopic = normalize(candidate.topic);
  return memories
    .filter(
      (memory) =>
        !memory.superseded_at &&
        memory.memory_kind === candidate.memory_kind &&
        normalize(memory.topic) === normalizedTopic
    )
    .map((memory) => ({ memory, similarity: memorySimilarity(memory.content, candidate.content) }))
    .sort((a, b) => b.similarity - a.similarity)
    .find((item) => item.similarity >= 0.6)?.memory;
}

function isolateUserSource(userId: string, source: BehaviorContextSource): BehaviorContextSource {
  return {
    profile: source.profile?.id === userId ? source.profile : null,
    copingCard: source.copingCard?.user_id === userId ? source.copingCard : null,
    memories: source.memories.filter((item) => item.user_id === userId),
    alternativeThoughts: source.alternativeThoughts.filter((item) => item.user_id === userId),
    strategyTrials: source.strategyTrials.filter((item) => item.user_id === userId),
    episodes: source.episodes.filter((item) => item.user_id === userId),
    mealSchedules: source.mealSchedules.filter((item) => item.user_id === userId),
  };
}

function buildNorthItems(card: CopingCard | null | undefined, query: string) {
  if (!card) return [];
  const items = [
    ["main_goal", card.main_goal, 16],
    ["why_it_matters", card.why_it_matters, 18],
    ["future_difference", card.future_difference, 12],
    ["cost_of_no_change", card.cost_of_no_change, 8],
    ["desired_identity", card.desired_identity, 17],
    ["reminder_statement", card.reminder_statement, 20],
    ["personal_commitment", card.personal_commitment, 12],
    ["sabotaging_thoughts", card.sabotaging_thoughts?.join("; "), 11],
    ...Object.entries(card.life_impacts || {}).map(([key, value]) => [`impact_${key}`, value, 10]),
  ] as Array<[string, string | undefined, number]>;
  const ranked = items
    .filter((item): item is [string, string, number] => Boolean(item[1]?.trim()))
    .map(([key, content, base]) => ({
      key,
      content: content.trim(),
      relevance: clampScore(base + textRelevance(query, content)),
    }))
    .sort((a, b) => b.relevance - a.relevance);
  return query.trim()
    ? ranked.filter((item) => textRelevance(query, item.content) >= 8)
    : ranked;
}

function memoryRelevance(memory: UserMemory, query: string, now: Date): number {
  const validation = memory.validation_status === "confirmed" ? 16 : memory.validation_status === "proposed" ? 2 : -20;
  const evidence = Math.min(10, ((memory.evidence_count || 1) - 1) * 2);
  const importance = (memory.importance ?? defaultImportance(memory.memory_kind)) * 1.6;
  return clampScore(
    validation + evidence + importance + memory.confidence * 10 +
      textRelevance(query, `${memory.topic} ${memory.content}`) +
      recencyScore(memory.updated_at, now)
  );
}

function alternativeRelevance(item: AlternativeThought, query: string, now: Date): number {
  const resultBoost = item.result === "helped_changed" ? 18 : item.result === "thought_only" ? 9 : 3;
  return clampScore(
    resultBoost + (item.belief_level || 0) + Math.min(10, item.times_used * 2) +
      textRelevance(query, `${item.original_thought} ${item.alternative}`) +
      recencyScore(item.updated_at, now)
  );
}

function groupStrategyTrials(trials: StrategyTrial[], query: string, now: Date) {
  const groups = new Map<string, StrategyTrial[]>();
  for (const trial of trials) {
    const key = trial.strategy_id || trial.strategy_key || normalize(trial.title_snapshot);
    groups.set(key, [...(groups.get(key) || []), trial]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const sorted = [...group].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    const latest = sorted[0];
    return {
      key,
      latest,
      helpedCount: group.filter((item) => item.result === "helped").length,
      partialCount: group.filter((item) => item.result === "partially_helped").length,
      didNotHelpCount: group.filter((item) => item.result === "did_not_help").length,
      topical: textRelevance(
        query,
        `${latest.title_snapshot} ${latest.trigger_context || ""} ${latest.experiment_action || ""}`
      ),
      relevance: clampScore(
        textRelevance(
          query,
          `${latest.title_snapshot} ${latest.trigger_context || ""} ${latest.experiment_action || ""}`
        ) + recencyScore(latest.updated_at, now) + 10
      ),
    };
  });
}

function trialRelevance(trial: StrategyTrial, query: string, now: Date): number {
  const planned = trial.planned_for ? new Date(trial.planned_for).getTime() : 0;
  const dueBoost = planned && planned <= now.getTime() ? 20 : 8;
  return clampScore(
    dueBoost + recencyScore(trial.updated_at, now) +
      textRelevance(query, `${trial.title_snapshot} ${trial.trigger_context || ""}`)
  );
}

function textRelevance(query: string, content: string): number {
  if (!query.trim()) return 0;
  const left = tokens(query);
  const right = tokens(content);
  let matches = 0;
  for (const token of left) if (right.has(token)) matches += token.includes("_") ? 3 : 1;
  return clampScore(matches * 8 + memorySimilarity(query, content) * 24);
}

function tokens(value: string): Set<string> {
  const normalized = normalize(value);
  const result = new Set(
    normalized
      .replace(/[^a-z0-9_\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  );
  for (const [concept, matcher] of CONCEPTS) if (matcher.test(normalized)) result.add(concept);
  return result;
}

function recencyScore(value: string | null | undefined, now: Date): number {
  if (!value) return 0;
  const age = Math.max(0, now.getTime() - new Date(value).getTime()) / 86_400_000;
  if (age <= 7) return 12;
  if (age <= 30) return 8;
  if (age <= 90) return 4;
  return 1;
}

function defaultImportance(kind: UserMemory["memory_kind"]): number {
  if (kind === "anchor" || kind === "identity") return 9;
  if (kind === "pattern" || kind === "protective_factor") return 7;
  return kind === "hypothesis" ? 4 : 5;
}

function isMealDue(meal: MealSchedule, now: Date): boolean {
  if (!meal.days_of_week.includes(now.getDay())) return false;
  const [hours, minutes] = meal.time_of_day.split(":").map(Number);
  const mealMinutes = hours * 60 + minutes;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.abs(currentMinutes - mealMinutes) <= 60;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}
