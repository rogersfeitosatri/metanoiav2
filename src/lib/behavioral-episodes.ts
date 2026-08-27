import type { ConversationIntent } from "./conversation-intent";
import type {
  BehavioralEpisode,
  BehavioralEpisodeStatus,
  BehavioralEpisodeType,
  EpisodeIntent,
  EventTimePrecision,
} from "./types";
import type {
  ConversationEngineResponse,
  ConversationEngineState,
} from "./ai/schemas";

export const RECENT_EPISODE_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface EpisodeCreateInput {
  user_id: string;
  conversation_id: string;
  entry_intent: EpisodeIntent;
  current_intent?: EpisodeIntent;
  episode_type?: BehavioralEpisodeType;
  started_at?: string;
  event_occurred_at?: string | null;
  event_time_description?: string | null;
  event_time_precision?: EventTimePrecision | null;
}

export interface EpisodeRelations {
  mealCheckinId?: string;
  strategyTrialId?: string;
  difficultyEventId?: string;
  strategyPlannedFor?: string | null;
}

export type EpisodeEntrySelection =
  | { kind: "create" }
  | { kind: "resume"; episode: BehavioralEpisode }
  | { kind: "offer_resume"; episode: BehavioralEpisode };

export function selectEpisodeForEntry(
  episodes: BehavioralEpisode[],
  options: {
    userId: string;
    intent: ConversationIntent;
    isReload?: boolean;
    now?: Date;
  }
): EpisodeEntrySelection {
  const now = options.now || new Date();
  const active = episodes
    .filter(
      (episode) =>
        episode.user_id === options.userId && episode.status === "active"
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

  if (options.intent !== "default") {
    const reloadMatch = options.isReload
      ? active.find(
          (episode) =>
            episode.current_intent === options.intent ||
            episode.entry_intent === options.intent
        )
      : undefined;
    return reloadMatch ? { kind: "resume", episode: reloadMatch } : { kind: "create" };
  }

  const latest = active[0];
  if (!latest) return { kind: "create" };
  const age = now.getTime() - new Date(latest.updated_at).getTime();
  return age <= RECENT_EPISODE_WINDOW_MS
    ? { kind: "resume", episode: latest }
    : { kind: "offer_resume", episode: latest };
}

export function episodeTypeForIntent(
  intent: EpisodeIntent | ConversationIntent
): BehavioralEpisodeType {
  switch (intent) {
    case "help_now":
      return "help_now";
    case "register_event":
      return "event";
    case "prepare":
      return "preparation";
    case "review_strategy":
      return "strategy_review";
    case "meal_checkin":
      return "meal_checkin";
    default:
      return "open";
  }
}

export function initialEpisodeFields(
  intent: ConversationIntent,
  now = new Date()
): Pick<
  EpisodeCreateInput,
  | "entry_intent"
  | "current_intent"
  | "episode_type"
  | "event_occurred_at"
  | "event_time_description"
  | "event_time_precision"
> {
  const present = intent === "help_now";
  return {
    entry_intent: intent,
    current_intent: intent,
    episode_type: episodeTypeForIntent(intent),
    event_occurred_at: present ? now.toISOString() : null,
    event_time_description: present ? "agora" : null,
    event_time_precision: present ? "approximate" : null,
  };
}

export function isExplicitNewDemand(message: string): boolean {
  return /(?:agora\s+aconteceu\s+outra\s+coisa|aconteceu\s+outra\s+coisa|quero\s+falar\s+de\s+outra\s+coisa|mudando\s+de\s+assunto|outra\s+situa[cç][aã]o\s+agora)/i.test(
    message.trim()
  );
}

export function inferIntentFromNewDemand(message: string): ConversationIntent {
  if (/\b(agora|nesse momento|neste momento)\b/i.test(message)) return "help_now";
  if (/\b(amanh[ãa]|depois de amanh[ãa]|vou ter|vai acontecer)\b/i.test(message)) {
    return "prepare";
  }
  if (/\b(aconteceu|ontem|hoje mais cedo|depois do|depois da)\b/i.test(message)) {
    return "register_event";
  }
  return "default";
}

export function inferEventMoment(
  message: string,
  reference = new Date()
): {
  occurredAt: string;
  description: string;
  precision: EventTimePrecision;
} | null {
  const text = message.trim();
  if (!text) return null;

  const nowMatch = text.match(/\b(agora|nesse momento|neste momento)\b/i);
  if (nowMatch) {
    return {
      occurredAt: reference.toISOString(),
      description: nowMatch[0],
      precision: "approximate",
    };
  }

  const dayMatch = text.match(/\b(anteontem|ontem|hoje|amanh[ãa])\b/i);
  const timeMatch = text.match(/\b(?:[àa]s?\s*)?([01]?\d|2[0-3])(?::|h)([0-5]\d)?\b/i);
  const periodMatch = text.match(/\b(?:de\s+|[àa]\s+)?(madrugada|manh[ãa]|tarde|noite)\b/i);
  if (!dayMatch && !timeMatch) return null;

  const occurred = new Date(reference);
  occurred.setSeconds(0, 0);
  if (dayMatch) {
    const day = normalize(dayMatch[1]);
    const offset = day === "anteontem" ? -2 : day === "ontem" ? -1 : day === "amanha" ? 1 : 0;
    occurred.setDate(occurred.getDate() + offset);
  }

  let precision: EventTimePrecision = "date_only";
  if (timeMatch) {
    occurred.setHours(Number(timeMatch[1]), Number(timeMatch[2] || 0), 0, 0);
    precision = "exact";
  } else if (periodMatch) {
    const period = normalize(periodMatch[1]);
    const hour = period === "madrugada" ? 3 : period === "manha" ? 9 : period === "tarde" ? 15 : 21;
    occurred.setHours(hour, 0, 0, 0);
    precision = "relative";
  } else {
    occurred.setHours(12, 0, 0, 0);
  }

  const description = [dayMatch?.[0], periodMatch?.[0], timeMatch?.[0]]
    .filter(Boolean)
    .join(" ");
  return {
    occurredAt: occurred.toISOString(),
    description,
    precision,
  };
}

export function patchEpisodeEventMoment(
  episode: BehavioralEpisode,
  message: string,
  reference = new Date()
): Partial<BehavioralEpisode> {
  if (episode.event_occurred_at) return {};
  const inferred = inferEventMoment(message, reference);
  if (!inferred) return {};
  return {
    event_occurred_at: inferred.occurredAt,
    event_time_description: inferred.description,
    event_time_precision: inferred.precision,
  };
}

export function patchEpisodeFromTurn(
  episode: BehavioralEpisode,
  response: ConversationEngineResponse,
  relations: EpisodeRelations = {},
  now = new Date()
): Partial<BehavioralEpisode> {
  const state = response.state;
  const closing = response.suggest_close || state.stage === "done";
  const needsFollowup = closing && shouldWaitForFollowup(state, response);
  const status: BehavioralEpisodeStatus = response.safety.interrupted
    ? "active"
    : !closing
      ? "active"
      : needsFollowup
        ? "waiting_followup"
        : "resolved";

  const patch: Partial<BehavioralEpisode> = {
    episode_type: episodeTypeForState(state),
    current_intent: state.intent,
    status,
    situation: state.situation || episode.situation || null,
    current_stage: state.stage,
    awaiting_field: state.stage === "done" ? null : state.stage,
    conversation_state: state as unknown as Record<string, unknown>,
    ended_at: status === "resolved" ? now.toISOString() : null,
    result_summary: closing ? response.reply : episode.result_summary || null,
    followup_required: status === "waiting_followup",
    followup_reason:
      status === "waiting_followup" ? followupReason(state) : null,
    followup_at:
      status === "waiting_followup"
        ? followupDate(relations.strategyPlannedFor, episode.event_occurred_at, now)
        : null,
  };

  if (relations.mealCheckinId) patch.related_meal_checkin_id = relations.mealCheckinId;
  if (relations.strategyTrialId) patch.related_strategy_trial_id = relations.strategyTrialId;
  if (relations.difficultyEventId) patch.related_difficulty_event_id = relations.difficultyEventId;
  return patch;
}

function episodeTypeForState(state: ConversationEngineState): BehavioralEpisodeType {
  if (state.stage === "strategy_review" || state.pending_strategy_id) return "strategy_review";
  if (
    state.stage === "meal_selection" ||
    state.stage === "meal_status" ||
    state.stage === "meal_success" ||
    state.stage === "meal_difficulty_consent" ||
    state.meal_schedule_id
  ) {
    return "meal_checkin";
  }
  return episodeTypeForIntent(state.intent);
}

export function abandonEpisodePatch(now = new Date()): Partial<BehavioralEpisode> {
  return {
    status: "abandoned",
    ended_at: now.toISOString(),
    awaiting_field: null,
    result_summary: "Assunto interrompido para iniciar outra demanda.",
    followup_required: false,
    followup_reason: null,
    followup_at: null,
  };
}

export function resolveFollowupEpisodePatch(
  summary: string,
  now = new Date()
): Partial<BehavioralEpisode> {
  return {
    status: "resolved",
    ended_at: now.toISOString(),
    awaiting_field: null,
    result_summary: summary,
    followup_required: false,
    followup_reason: null,
    followup_at: null,
  };
}

export function resumeEpisodePrompt(episode: BehavioralEpisode): string {
  const situation = episode.situation?.trim();
  if (!situation) return "A gente deixou uma conversa em aberto. Tu quer continuar ou falar de outra coisa?";
  return `A gente tava falando sobre “${shorten(situation)}”. Tu quer continuar ou falar de outra coisa?`;
}

export function resumeLastQuestion(episode: BehavioralEpisode): string {
  const state = episode.conversation_state as Partial<ConversationEngineState>;
  return state.last_question || "Tá. Me conta um pouco mais de onde a gente parou.";
}

function shouldWaitForFollowup(
  state: ConversationEngineState,
  response: ConversationEngineResponse
) {
  return (
    state.strategy_recorded ||
    response.actions.some((action) => action.type === "create_strategy_trial") ||
    (state.intent === "review_strategy" && state.strategy_review_result === "not_tested")
  );
}

function followupReason(state: ConversationEngineState): string {
  if (state.intent === "prepare") return "Rever como foi a situação preparada.";
  if (state.intent === "review_strategy" && state.strategy_review_result === "not_tested") {
    return "A estratégia ainda não foi testada.";
  }
  return "Rever a estratégia combinada nesta situação.";
}

function followupDate(
  plannedFor: string | null | undefined,
  eventAt: string | null | undefined,
  now: Date
): string {
  const base = plannedFor || (eventAt && new Date(eventAt).getTime() > now.getTime() ? eventAt : null);
  const date = base ? new Date(base) : new Date(now);
  date.setDate(date.getDate() + (base ? 1 : 2));
  return date.toISOString();
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function shorten(value: string): string {
  return value.length <= 90 ? value : `${value.slice(0, 87)}...`;
}
