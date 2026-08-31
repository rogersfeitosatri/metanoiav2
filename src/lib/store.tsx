"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Profile,
  Role,
  MealCheckin,
  DifficultyEvent,
  ThoughtRecord,
  StrategyTrial,
  CopingCard,
  Conversation,
  ConversationMessage,
  RiskFlag,
  ProfessionalNote,
  Strategy,
  ProfessionalUserLink,
  AlternativeThought,
  MealSchedule,
  UserMemory,
  MemoryKind,
  BehavioralEpisode,
  EventTimePrecision,
} from "./types";
import type { EpisodeCreateInput } from "./behavioral-episodes";
import { resolveAlternativeThought } from "./alternative-thoughts";
import { buildDemoDatabase, uid, USER_ID, ADMIN_ID } from "./demo-data";
import { computeConsistency } from "./consistency";
import { classifyPatterns, type PatternSummary } from "./patterns";
import { buildWeeklyReport } from "./reports";
import { analyzeSafetyLocal } from "./ai/safety";
import { isSupabaseConfigured } from "./supabase/config";
import { createClient } from "./supabase/client";
import { loadDatabase, newId, clean, withDatabaseDefaults } from "./supabase/data";

const DB_KEY = "metanoia_db_v1";
const SESSION_KEY = "metanoia_session_v1";
const SB = isSupabaseConfigured;

interface StoreValue {
  db: Database;
  currentUserId: string | null;
  currentProfile: Profile | null;
  ready: boolean;
  mode: "demo" | "supabase";
  authError: string | null;
  // sessão (demo)
  login: (role: Role) => void;
  logout: () => Promise<void>;
  // sessão (supabase)
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, preferredName: string) => Promise<{ error?: string }>;
  // usuário
  completeOnboarding: (data: OnboardingData) => void;
  addCheckin: (input: Partial<MealCheckin> & { status: MealCheckin["status"] }) => MealCheckin;
  recordDifficulty: (
    userId: string,
    answers: Record<string, unknown>,
    conversationId?: string,
    checkinId?: string,
    episodeId?: string,
    eventMoment?: {
      occurredAt?: string | null;
      description?: string | null;
      precision?: EventTimePrecision | null;
    }
  ) => { event: DifficultyEvent; thought: ThoughtRecord | null };
  addAlternativeThought: (
    input: Partial<AlternativeThought> & { user_id: string; original_thought: string; alternative: string }
  ) => AlternativeThought;
  updateAlternativeThought: (id: string, patch: Partial<AlternativeThought>) => void;
  saveCopingCard: (userId: string, patch: Partial<CopingCard>) => void;
  createConversation: (userId: string, type: Conversation["type"], title: string) => Conversation;
  createEpisode: (input: EpisodeCreateInput) => BehavioralEpisode;
  updateEpisode: (id: string, patch: Partial<BehavioralEpisode>) => void;
  addMessage: (msg: Omit<ConversationMessage, "id" | "created_at">) => ConversationMessage;
  closeConversation: (conversationId: string, summary?: string) => void;
  addStrategyTrial: (input: Partial<StrategyTrial> & { user_id: string; title_snapshot: string }) => StrategyTrial;
  updateStrategyTrial: (id: string, patch: Partial<StrategyTrial>) => void;
  addMealSchedule: (input: Pick<MealSchedule, "name" | "time_of_day" | "days_of_week" | "reminder_enabled"> & Partial<MealSchedule>) => MealSchedule;
  updateMealSchedule: (id: string, patch: Partial<MealSchedule>) => void;
  saveMemory: (input: Pick<UserMemory, "memory_kind" | "topic" | "content"> & Partial<UserMemory>) => UserMemory;
  updateMemory: (id: string, patch: Partial<UserMemory>) => void;
  runSafety: (userId: string, text: string, conversationId?: string, messageId?: string) => ReturnType<typeof analyzeSafetyLocal>;
  // profissional
  addProfessionalNote: (input: Omit<ProfessionalNote, "id" | "created_at" | "updated_at">) => void;
  updateRiskFlag: (id: string, patch: Partial<RiskFlag>) => void;
  createStrategy: (input: Partial<Strategy> & { title: string; description: string }) => Strategy;
  // admin
  linkUserToProfessional: (userId: string, professionalId: string) => void;
  logAudit: (action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>) => void;
  refreshDatabase: () => Promise<void>;
  // selectors
  patternsFor: (userId: string) => PatternSummary;
  consistencyFor: (userId: string) => ReturnType<typeof computeConsistency>;
  weeklyReportFor: (userId: string) => ReturnType<typeof buildWeeklyReport>;
  usersOfProfessional: (professionalId: string) => Profile[];
}

export interface OnboardingData {
  preferred_name: string;
  goal_type: string;
  goal_description: string;
  hard_moments: string[];
  difficulties: string[];
  support_times: string[];
  first_commitment: string;
  accepted_terms: boolean;
  why_it_matters?: string;
  future_difference?: string;
  cost_of_no_change?: string;
  desired_identity?: string;
  reminder_statement?: string;
  life_impacts?: Record<string, string>;
  meals?: Array<{
    name: string;
    time_of_day: string;
    days_of_week: number[];
    reminder_enabled: boolean;
  }>;
}

const StoreContext = createContext<StoreValue | null>(null);

function genId(prefix = "id"): string {
  return SB ? newId() : uid(prefix);
}

async function bootstrapServerProfile(): Promise<string | null> {
  const response = await fetch("/api/auth/bootstrap-profile", { method: "POST" });
  if (response.ok) return null;
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || "Nao consegui preparar teu perfil de acesso.";
}

function loadLocalDb(): Database {
  if (typeof window === "undefined") return buildDemoDatabase();
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Database>;
      return withDatabaseDefaults(saved);
    }
  } catch {
    /* ignora */
  }
  return buildDemoDatabase();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Database>(() => (SB ? emptyDatabase() : buildDemoDatabase()));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const supabaseWritesRef = useRef<Promise<void>>(Promise.resolve());

  // ---------- Inicialização ----------
  useEffect(() => {
    if (!SB) {
      setDb(loadLocalDb());
      try {
        const s = localStorage.getItem(SESSION_KEY);
        if (s) setCurrentUserId(s);
      } catch {
        /* noop */
      }
      setReady(true);
      return;
    }

    const supabase = createClient();
    supabaseRef.current = supabase;
    if (!supabase) {
      setReady(true);
      return;
    }

    let active = true;
    async function bootstrap(uidStr: string | null) {
      if (!uidStr) {
        if (active) {
          setDb(emptyDatabase());
          setCurrentUserId(null);
          setReady(true);
        }
        return;
      }
      const profileError = await bootstrapServerProfile();
      if (profileError) {
        await supabase!.auth.signOut();
        if (active) {
          setAuthError(profileError);
          setDb(emptyDatabase());
          setCurrentUserId(null);
          setReady(true);
        }
        return;
      }
      const data = await loadDatabase(supabase!);
      if (!active) return;
      setDb(data);
      setCurrentUserId(uidStr);
      setReady(true);
    }

    supabase.auth.getUser().then(({ data }) => bootstrap(data.user?.id ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      bootstrap(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---------- write-through helpers (supabase) ----------
  const enqueueSupabaseWrite = useCallback((label: string, operation: () => Promise<void>) => {
    if (!SB) return;
    supabaseWritesRef.current = supabaseWritesRef.current
      .then(operation)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${label}:`, message);
      });
  }, []);

  const sbInsert = useCallback((table: string, row: Record<string, unknown>) => {
    const client = supabaseRef.current;
    if (!SB || !client) return;
    enqueueSupabaseWrite(`insert ${table}`, async () => {
      const { error } = await client.from(table).insert(clean(row));
      if (error) throw error;
    });
  }, [enqueueSupabaseWrite]);

  const sbUpsert = useCallback((table: string, row: Record<string, unknown>, onConflict: string) => {
    const client = supabaseRef.current;
    if (!SB || !client) return;
    enqueueSupabaseWrite(`upsert ${table}`, async () => {
      const { error } = await client.from(table).upsert(clean(row), { onConflict });
      if (error) throw error;
    });
  }, [enqueueSupabaseWrite]);

  const sbUpdate = useCallback((table: string, id: string, patch: Record<string, unknown>) => {
    const client = supabaseRef.current;
    if (!SB || !client) return;
    enqueueSupabaseWrite(`update ${table}`, async () => {
      const { error } = await client.from(table).update(clean(patch)).eq("id", id);
      if (error) throw error;
    });
  }, [enqueueSupabaseWrite]);

  // Atualiza o estado local (e persiste no localStorage apenas em modo demo).
  const mutate = useCallback((fn: (draft: Database) => void) => {
    setDb((prev) => {
      const next: Database = structuredClone(prev);
      fn(next);
      if (!SB) {
        try {
          localStorage.setItem(DB_KEY, JSON.stringify(next));
        } catch {
          /* quota */
        }
      }
      return next;
    });
  }, []);

  const currentProfile = currentUserId
    ? db.profiles.find((p) => p.id === currentUserId) || null
    : null;

  // ---------- Auth ----------
  const login = useCallback((role: Role) => {
    if (SB) return; // demo apenas
    const id = role === "user" ? USER_ID : role === "professional" ? "demo-pro-laura-profile" : ADMIN_ID;
    setCurrentUserId(id);
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {
      /* noop */
    }
  }, []);

  const logout = useCallback(async () => {
    if (SB && supabaseRef.current) {
      try {
        await supabaseRef.current.auth.signOut({ scope: "local" });
      } finally {
        setCurrentUserId(null);
        setDb(emptyDatabase());
        setAuthError(null);
      }
      return;
    }
    setCurrentUserId(null);
    setAuthError(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const signIn = useCallback<StoreValue["signIn"]>(async (email, password) => {
    setAuthError(null);
    if (!supabaseRef.current) return { error: "Supabase não configurado." };
    const { error } = await supabaseRef.current.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = traduzErro(error.message, error.status);
      setAuthError(msg);
      return { error: msg };
    }
    const profileError = await bootstrapServerProfile();
    if (profileError) {
      await supabaseRef.current.auth.signOut();
      setAuthError(profileError);
      return { error: profileError };
    }
    return {};
  }, []);

  const signUp = useCallback<StoreValue["signUp"]>(async (email, password, preferredName) => {
    setAuthError(null);
    if (!supabaseRef.current) return { error: "Supabase não configurado." };
    const { data, error } = await supabaseRef.current.auth.signUp({
      email,
      password,
      options: { data: { preferred_name: preferredName, full_name: preferredName } },
    });
    if (error) {
      const msg = traduzErro(error.message, error.status);
      setAuthError(msg);
      return { error: msg };
    }
    if (data.session) {
      const profileError = await bootstrapServerProfile();
      if (profileError) {
        setAuthError(profileError);
        return { error: profileError };
      }
    }
    return {};
  }, []);

  const refreshDatabase = useCallback(async () => {
    if (!SB || !supabaseRef.current) return;
    await supabaseWritesRef.current;
    const data = await loadDatabase(supabaseRef.current);
    setDb(data);
  }, []);

  // ---------- logAudit ----------
  const logAudit = useCallback(
    (action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) => {
      const row = {
        id: genId("audit"),
        actor_id: currentUserId || "system",
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
        created_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.audit_logs.unshift(row);
      });
      // Auditoria server-side é feita com service role; no cliente é best-effort.
      sbInsert("audit_logs", row);
    },
    [mutate, currentUserId, sbInsert]
  );

  // ---------- Onboarding ----------
  const completeOnboarding = useCallback(
    (data: OnboardingData) => {
      if (!currentUserId) return;
      const nowIso = new Date().toISOString();
      const goal = {
        id: genId("goal"),
        user_id: currentUserId,
        goal_type: data.goal_type,
        description: data.goal_description,
        active: true,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const acceptance = {
        id: genId("acc"),
        user_id: currentUserId,
        document_id: currentDocId(db, "terms"),
        accepted_at: nowIso,
        ip_address: null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      };
      const prefsRow = {
        id: genId("np"),
        user_id: currentUserId,
        enabled: data.support_times.length > 0,
        allowed_days: [0, 1, 2, 3, 4, 5, 6],
        allowed_start_time: "08:00",
        allowed_end_time: "21:00",
        maximum_daily_notifications: 2,
        preventive_enabled: true,
        checkin_enabled: true,
        support_times: data.support_times,
        timezone: "America/Sao_Paulo",
        created_at: nowIso,
        updated_at: nowIso,
      };
      const copingCard: CopingCard = {
        id: genId("card"),
        user_id: currentUserId,
        desired_identity: data.desired_identity || undefined,
        main_goal: data.goal_description,
        why_it_matters: data.why_it_matters || undefined,
        future_difference: data.future_difference || undefined,
        cost_of_no_change: data.cost_of_no_change || undefined,
        life_impacts: data.life_impacts || {},
        reminder_statement: data.reminder_statement || undefined,
        personal_commitment: data.first_commitment || undefined,
        completed_percentage: 100,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const memories: UserMemory[] = [
        memoryRow("fact", "objetivo", data.goal_description),
        memoryRow("fact", "por_que_importa", data.why_it_matters),
        memoryRow("identity", "identidade_desejada", data.desired_identity),
        memoryRow("anchor", "lembrete_pessoal", data.reminder_statement),
        ...data.hard_moments.map((content) => memoryRow("fact", "momento_dificil", content)),
        ...data.difficulties.map((content) => memoryRow("fact", "dificuldade", content)),
      ].filter((memory): memory is UserMemory => Boolean(memory));
      const schedules: MealSchedule[] = (data.meals || []).map((meal) => ({
        id: genId("meal"),
        user_id: currentUserId,
        name: meal.name,
        meal_type: null,
        time_of_day: meal.time_of_day,
        days_of_week: meal.days_of_week,
        reminder_enabled: meal.reminder_enabled,
        active: true,
        created_at: nowIso,
        updated_at: nowIso,
      }));

      function memoryRow(memory_kind: MemoryKind, topic: string, content?: string): UserMemory | null {
        if (!content?.trim()) return null;
        return {
          id: genId("memory"),
          user_id: currentUserId!,
          memory_kind,
          topic,
          content: content.trim(),
          source: "user",
          validation_status: "confirmed",
          confidence: 1,
          source_conversation_id: null,
          last_used_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        };
      }
      mutate((d) => {
        const p = d.profiles.find((x) => x.id === currentUserId);
        if (p) {
          p.preferred_name = data.preferred_name || p.preferred_name;
          p.onboarding_completed = true;
          p.terms_version = "1.0";
          p.terms_accepted_at = nowIso;
          p.privacy_version = "1.0";
          p.privacy_accepted_at = nowIso;
        }
        d.behavioral_goals.push(goal as never);
        d.coping_cards.push(copingCard);
        d.user_memories.push(...memories);
        d.meal_schedules.push(...schedules);
        d.legal_acceptances.push(acceptance as never);
        const existing = d.notification_preferences.find((n) => n.user_id === currentUserId);
        if (existing) existing.support_times = data.support_times;
        else d.notification_preferences.push(prefsRow as never);
      });
      sbUpdate("profiles", currentUserId, {
        preferred_name: data.preferred_name,
        onboarding_completed: true,
        terms_version: "1.0",
        terms_accepted_at: nowIso,
        privacy_version: "1.0",
        privacy_accepted_at: nowIso,
      });
      sbInsert("behavioral_goals", goal);
      sbUpsert("coping_cards", copingCard as unknown as Record<string, unknown>, "user_id");
      for (const memory of memories) sbInsert("user_memories", memory as unknown as Record<string, unknown>);
      for (const schedule of schedules) sbInsert("meal_schedules", schedule as unknown as Record<string, unknown>);
      if (acceptance.document_id) sbInsert("legal_acceptances", acceptance);
      sbUpsert("notification_preferences", prefsRow, "user_id");
    },
    [currentUserId, db, mutate, sbUpdate, sbInsert, sbUpsert]
  );

  const addCheckin: StoreValue["addCheckin"] = useCallback(
    (input) => {
      const checkin: MealCheckin = {
        id: genId("chk"),
        user_id: input.user_id || currentUserId || USER_ID,
        episode_id: input.episode_id ?? null,
        schedule_id: input.schedule_id ?? null,
        meal_type: input.meal_type ?? null,
        custom_meal_name: input.custom_meal_name ?? null,
        status: input.status,
        occurred_at: input.occurred_at || new Date().toISOString(),
        note: input.note ?? null,
        created_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.meal_checkins.unshift(checkin);
      });
      sbInsert("meal_checkins", checkin as unknown as Record<string, unknown>);
      return checkin;
    },
    [currentUserId, mutate, sbInsert]
  );

  const recordDifficulty: StoreValue["recordDifficulty"] = useCallback(
    (userId, answers, conversationId, checkinId, episodeId, eventMoment) => {
      const nowIso = new Date().toISOString();
      const existingEvent = episodeId
        ? db.difficulty_events.find((item) => item.episode_id === episodeId)
        : undefined;
      const incomingReasons = Array.isArray(answers.reasons)
        ? answers.reasons.filter((item): item is string => typeof item === "string")
        : [];
      const reasons = mergeStringValues(existingEvent?.reasons, incomingReasons);
      const contextTags = Array.isArray(answers.context)
        ? answers.context.filter((item): item is string => typeof item === "string")
        : [];
      const event: DifficultyEvent = {
        id: existingEvent?.id || genId("diff"),
        user_id: userId,
        episode_id: episodeId || null,
        checkin_id: checkinId || existingEvent?.checkin_id || null,
        conversation_id: conversationId || existingEvent?.conversation_id || null,
        occurred_at: eventMoment?.occurredAt || existingEvent?.occurred_at || nowIso,
        event_time_description:
          eventMoment?.description || existingEvent?.event_time_description || null,
        event_time_precision:
          eventMoment?.precision || existingEvent?.event_time_precision || null,
        primary_reason: reasons[0] || existingEvent?.primary_reason || null,
        reasons,
        context:
          mergeOptionalText(
            existingEvent?.context,
            [answers.situation, contextTags.join(", ")].filter(Boolean).join(" | ")
          ) || null,
        hunger_intensity:
          (answers.hunger_intensity as number) ?? existingEvent?.hunger_intensity ?? null,
        urge_intensity:
          (answers.urge_intensity as number) ?? existingEvent?.urge_intensity ?? null,
        emotional_intensity:
          (answers.emotional_intensity as number) ??
          existingEvent?.emotional_intensity ??
          null,
        created_at: existingEvent?.created_at || nowIso,
      };
      const existingThought = db.thought_records.find(
        (item) => item.difficulty_event_id === event.id
      );
      const incomingEmotions = Array.isArray(answers.emotions)
        ? answers.emotions.filter((item): item is string => typeof item === "string")
        : answers.emotion
          ? [answers.emotion as string]
          : [];
      const hasThoughtRecordCore = Boolean(
        answers.situation &&
          answers.automatic_thought &&
          answers.behavior
      );
      const consequence = [
        answers.consequences,
        answers.immediate_consequence,
        answers.later_consequence,
      ].filter((item): item is string => typeof item === "string" && Boolean(item)).join(" | ");
      const thought: ThoughtRecord | null = existingThought || hasThoughtRecordCore
        ? {
            id: existingThought?.id || genId("thr"),
            user_id: userId,
            difficulty_event_id: event.id,
            situation:
              mergeOptionalText(existingThought?.situation, answers.situation as string) || undefined,
            automatic_thought:
              mergeOptionalText(
                existingThought?.automatic_thought,
                answers.automatic_thought as string
              ) || undefined,
            emotions: mergeStringValues(existingThought?.emotions, incomingEmotions),
            behavior:
              mergeOptionalText(existingThought?.behavior, answers.behavior as string) || undefined,
            consequences:
              mergeOptionalText(existingThought?.consequences, consequence) || undefined,
            decision_point:
              mergeOptionalText(
                existingThought?.decision_point,
                answers.decision_point as string
              ) || undefined,
            alternative_thought:
              (answers.alternative_thought as string) ||
              existingThought?.alternative_thought ||
              undefined,
            hunger_level:
              (answers.hunger_intensity as number) ?? existingThought?.hunger_level ?? null,
            noticed_hunger_early:
              typeof answers.hunger_intensity === "number"
                ? (answers.hunger_intensity as number) <= 6
                : existingThought?.noticed_hunger_early,
            thought_self_identified:
              (answers.thought_self_identified as boolean | undefined) ??
              existingThought?.thought_self_identified,
            emotion_self_identified:
              (answers.emotion_self_identified as boolean | undefined) ??
              existingThought?.emotion_self_identified,
            all_or_nothing:
              (answers.all_or_nothing as boolean | undefined) ??
              existingThought?.all_or_nothing ??
              detectAllOrNothing(
                `${(answers.automatic_thought as string) || ""} ${(answers.situation as string) || ""}`
              ),
            guilt_level:
              (answers.guilt_level as number) ?? existingThought?.guilt_level ?? null,
            recovery_outcome:
              (answers.recovery_outcome as ThoughtRecord["recovery_outcome"]) ||
              existingThought?.recovery_outcome,
            created_at: existingThought?.created_at || nowIso,
          }
        : null;
      let trial: StrategyTrial | null = null;
      if (answers.commitment && answers.strategy_choice) {
        trial = {
          id: genId("trial"),
          user_id: userId,
          episode_id: episodeId || null,
          strategy_id: null as unknown as string,
          difficulty_event_id: event.id,
          planned_for: new Date(Date.now() + 86400000).toISOString(),
          tested_at: null,
          result: "not_tested",
          user_feedback: null,
          title_snapshot: answers.strategy_choice as string,
          created_at: nowIso,
          updated_at: nowIso,
        };
      }
      mutate((d) => {
        const eventIndex = d.difficulty_events.findIndex((item) => item.id === event.id);
        if (eventIndex >= 0) d.difficulty_events[eventIndex] = event;
        else d.difficulty_events.unshift(event);
        if (thought) {
          const thoughtIndex = d.thought_records.findIndex((item) => item.id === thought.id);
          if (thoughtIndex >= 0) d.thought_records[thoughtIndex] = thought;
          else d.thought_records.unshift(thought);
        }
        if (trial) d.strategy_trials.unshift(trial);
      });
      if (existingEvent) {
        sbUpdate("difficulty_events", event.id, event as unknown as Record<string, unknown>);
      } else {
        sbInsert("difficulty_events", event as unknown as Record<string, unknown>);
      }
      if (thought) {
        if (existingThought) {
          sbUpdate("thought_records", thought.id, thought as unknown as Record<string, unknown>);
        } else {
          sbInsert("thought_records", thought as unknown as Record<string, unknown>);
        }
      }
      if (trial) sbInsert("strategy_trials", trial as unknown as Record<string, unknown>);
      return { event, thought };
    },
    [db.difficulty_events, db.thought_records, mutate, sbInsert, sbUpdate]
  );

  const addAlternativeThought: StoreValue["addAlternativeThought"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const existing = input.thought_record_id
        ? db.alternative_thoughts.find(
            (item) => item.thought_record_id === input.thought_record_id
          )
        : undefined;
      const row = input.thought_record_id && input.belief_level != null
        ? resolveAlternativeThought(
            existing,
            {
              user_id: input.user_id,
              thought_record_id: input.thought_record_id,
              original_thought: input.original_thought,
              alternative: input.alternative,
              belief_level: input.belief_level,
            },
            genId("alt"),
            nowIso
          )
        : {
            id: genId("alt"),
            user_id: input.user_id,
            thought_record_id: input.thought_record_id ?? null,
            original_thought: input.original_thought,
            alternative: input.alternative,
            belief_level: input.belief_level ?? null,
            result: "pending" as const,
            times_used: 0,
            last_used_at: null,
            created_at: nowIso,
            updated_at: nowIso,
          };
      mutate((d) => {
        const index = d.alternative_thoughts.findIndex((item) => item.id === row.id);
        if (index >= 0) d.alternative_thoughts[index] = row;
        else d.alternative_thoughts.unshift(row);
      });
      if (existing) {
        sbUpdate("alternative_thoughts", row.id, row as unknown as Record<string, unknown>);
      } else {
        sbInsert("alternative_thoughts", row as unknown as Record<string, unknown>);
      }
      return row;
    },
    [db.alternative_thoughts, mutate, sbInsert, sbUpdate]
  );

  const updateAlternativeThought: StoreValue["updateAlternativeThought"] = useCallback(
    (id, patch) => {
      const updated = { ...patch, updated_at: new Date().toISOString() };
      mutate((d) => {
        const a = d.alternative_thoughts.find((x) => x.id === id);
        if (a) Object.assign(a, updated);
      });
      sbUpdate("alternative_thoughts", id, updated as Record<string, unknown>);
    },
    [mutate, sbUpdate]
  );

  const saveCopingCard: StoreValue["saveCopingCard"] = useCallback(
    (userId, patch) => {
      let snapshot: CopingCard | null = null;
      mutate((d) => {
        let card = d.coping_cards.find((c) => c.user_id === userId);
        if (!card) {
          card = {
            id: genId("card"),
            user_id: userId,
            completed_percentage: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          d.coping_cards.push(card);
        }
        Object.assign(card, patch);
        const impactCount = card.life_impacts
          ? Object.values(card.life_impacts).filter((v) => v && v.trim().length > 0).length
          : 0;
        const fields = [
          card.desired_identity,
          card.main_goal,
          impactCount >= 3 ? "x" : impactCount > 0 ? "half" : "",
          card.sabotaging_thoughts?.length ? "x" : "",
          card.reminder_statement,
          card.personal_commitment,
        ];
        const filled = fields.filter((f) => f && String(f).trim().length > 0).length;
        card.completed_percentage = Math.round((filled / fields.length) * 100);
        card.updated_at = new Date().toISOString();
        snapshot = structuredClone(card);
      });
      if (snapshot) sbUpsert("coping_cards", snapshot as unknown as Record<string, unknown>, "user_id");
    },
    [mutate, sbUpsert]
  );

  const createConversation: StoreValue["createConversation"] = useCallback(
    (userId, type, title) => {
      const profile = db.profiles.find((p) => p.id === userId);
      const nowIso = new Date().toISOString();
      const conv: Conversation = {
        id: genId("conv"),
        user_id: userId,
        professional_id: profile?.professional_id || null,
        type,
        status: "open",
        title,
        started_at: nowIso,
        ended_at: null,
        risk_level: "none",
        summary: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      mutate((d) => {
        d.conversations.unshift(conv);
      });
      sbInsert("conversations", conv as unknown as Record<string, unknown>);
      return conv;
    },
    [db.profiles, mutate, sbInsert]
  );

  const createEpisode: StoreValue["createEpisode"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const episode: BehavioralEpisode = {
        id: genId("episode"),
        user_id: input.user_id,
        conversation_id: input.conversation_id,
        episode_type: input.episode_type || "open",
        entry_intent: input.entry_intent,
        current_intent: input.current_intent || input.entry_intent,
        status: "active",
        started_at: input.started_at || nowIso,
        ended_at: null,
        situation: null,
        event_occurred_at: input.event_occurred_at ?? null,
        event_time_description: input.event_time_description ?? null,
        event_time_precision: input.event_time_precision ?? null,
        context_tags: [],
        physical_state: [],
        hunger_level: null,
        satiety_level: null,
        urge: null,
        urge_intensity: null,
        automatic_thought: null,
        emotions: [],
        emotion_intensity: null,
        behavior: null,
        immediate_consequence: null,
        later_consequence: null,
        recovery_outcome: null,
        compensatory_behavior: null,
        decision_point: null,
        main_influencing_factor: null,
        captured_evidence: [],
        current_stage: null,
        awaiting_field: null,
        conversation_state: {},
        result_summary: null,
        followup_required: false,
        followup_reason: null,
        followup_at: null,
        related_meal_checkin_id: null,
        related_strategy_trial_id: null,
        related_difficulty_event_id: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      mutate((d) => {
        d.behavioral_episodes.unshift(episode);
      });
      sbInsert("behavioral_episodes", episode as unknown as Record<string, unknown>);
      return episode;
    },
    [mutate, sbInsert]
  );

  const updateEpisode: StoreValue["updateEpisode"] = useCallback(
    (id, patch) => {
      const updated = { ...patch, updated_at: new Date().toISOString() };
      mutate((d) => {
        const episode = d.behavioral_episodes.find((item) => item.id === id);
        if (episode) Object.assign(episode, updated);
      });
      sbUpdate("behavioral_episodes", id, updated as Record<string, unknown>);
    },
    [mutate, sbUpdate]
  );

  const addMessage: StoreValue["addMessage"] = useCallback(
    (msg) => {
      const full: ConversationMessage = {
        ...msg,
        id: genId("msg"),
        created_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.conversation_messages.push(full);
        const conv = d.conversations.find((c) => c.id === msg.conversation_id);
        if (conv) conv.updated_at = full.created_at;
      });
      sbInsert("conversation_messages", full as unknown as Record<string, unknown>);
      return full;
    },
    [mutate, sbInsert]
  );

  const closeConversation: StoreValue["closeConversation"] = useCallback(
    (conversationId, summary) => {
      const endedAt = new Date().toISOString();
      mutate((d) => {
        const conv = d.conversations.find((c) => c.id === conversationId);
        if (conv) {
          conv.status = "closed";
          conv.ended_at = endedAt;
          if (summary) conv.summary = summary;
        }
      });
      sbUpdate("conversations", conversationId, { status: "closed", ended_at: endedAt, summary });
    },
    [mutate, sbUpdate]
  );

  const addStrategyTrial: StoreValue["addStrategyTrial"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const trial: StrategyTrial = {
        id: genId("trial"),
        user_id: input.user_id,
        episode_id: input.episode_id ?? null,
        strategy_id: input.strategy_id ?? (null as unknown as string),
        difficulty_event_id: input.difficulty_event_id ?? null,
        planned_for: input.planned_for ?? null,
        tested_at: input.tested_at ?? null,
        result: input.result || "not_tested",
        user_feedback: input.user_feedback ?? null,
        title_snapshot: input.title_snapshot,
        created_at: nowIso,
        updated_at: nowIso,
      };
      mutate((d) => {
        d.strategy_trials.unshift(trial);
      });
      sbInsert("strategy_trials", trial as unknown as Record<string, unknown>);
      return trial;
    },
    [mutate, sbInsert]
  );

  const updateStrategyTrial: StoreValue["updateStrategyTrial"] = useCallback(
    (id, patch) => {
      const updated = { ...patch, updated_at: new Date().toISOString() };
      mutate((d) => {
        const t = d.strategy_trials.find((x) => x.id === id);
        if (t) Object.assign(t, updated);
      });
      sbUpdate("strategy_trials", id, updated as Record<string, unknown>);
    },
    [mutate, sbUpdate]
  );

  const addMealSchedule: StoreValue["addMealSchedule"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const schedule: MealSchedule = {
        id: genId("meal"),
        user_id: input.user_id || currentUserId || USER_ID,
        name: input.name.trim(),
        meal_type: input.meal_type ?? null,
        time_of_day: input.time_of_day,
        days_of_week: input.days_of_week,
        reminder_enabled: input.reminder_enabled,
        active: input.active ?? true,
        created_at: nowIso,
        updated_at: nowIso,
      };
      mutate((d) => d.meal_schedules.push(schedule));
      sbInsert("meal_schedules", schedule as unknown as Record<string, unknown>);
      return schedule;
    },
    [currentUserId, mutate, sbInsert]
  );

  const updateMealSchedule: StoreValue["updateMealSchedule"] = useCallback(
    (id, patch) => {
      const updated = { ...patch, updated_at: new Date().toISOString() };
      mutate((d) => {
        const schedule = d.meal_schedules.find((item) => item.id === id);
        if (schedule) Object.assign(schedule, updated);
      });
      sbUpdate("meal_schedules", id, updated as Record<string, unknown>);
    },
    [mutate, sbUpdate]
  );

  const saveMemory: StoreValue["saveMemory"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const memory: UserMemory = {
        id: genId("memory"),
        user_id: input.user_id || currentUserId || USER_ID,
        memory_kind: input.memory_kind,
        topic: input.topic,
        content: input.content.trim(),
        source: input.source || "user",
        validation_status: input.validation_status || "confirmed",
        confidence: input.confidence ?? 1,
        source_conversation_id: input.source_conversation_id ?? null,
        last_used_at: input.last_used_at ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      mutate((d) => d.user_memories.unshift(memory));
      sbInsert("user_memories", memory as unknown as Record<string, unknown>);
      return memory;
    },
    [currentUserId, mutate, sbInsert]
  );

  const updateMemory: StoreValue["updateMemory"] = useCallback(
    (id, patch) => {
      const updated = { ...patch, updated_at: new Date().toISOString() };
      mutate((d) => {
        const memory = d.user_memories.find((item) => item.id === id);
        if (memory) Object.assign(memory, updated);
      });
      sbUpdate("user_memories", id, updated as Record<string, unknown>);
    },
    [mutate, sbUpdate]
  );

  const runSafety: StoreValue["runSafety"] = useCallback(
    (userId, text, conversationId, messageId) => {
      const result = analyzeSafetyLocal(text);
      if (result.risk && result.categories.length) {
        const flags = result.categories.map((cat) => ({
          id: genId("risk"),
          user_id: userId,
          conversation_id: conversationId || null,
          message_id: messageId || null,
          category: cat.category,
          severity: cat.severity,
          evidence: cat.evidence,
          status: "open" as const,
          reviewed_by: null,
          reviewed_at: null,
          professional_note: null,
          created_at: new Date().toISOString(),
        }));
        mutate((d) => {
          for (const f of flags) d.risk_flags.unshift(f);
          if (conversationId) {
            const conv = d.conversations.find((c) => c.id === conversationId);
            if (conv) conv.risk_level = result.level;
          }
        });
        for (const f of flags) sbInsert("risk_flags", f as unknown as Record<string, unknown>);
        if (conversationId) sbUpdate("conversations", conversationId, { risk_level: result.level });
      }
      return result;
    },
    [mutate, sbInsert, sbUpdate]
  );

  const addProfessionalNote: StoreValue["addProfessionalNote"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const note = { ...input, id: genId("note"), created_at: nowIso, updated_at: nowIso };
      mutate((d) => {
        d.professional_notes.unshift(note);
      });
      sbInsert("professional_notes", note as unknown as Record<string, unknown>);
      logAudit("add_professional_note", "user", input.user_id, { professional_id: input.professional_id });
    },
    [mutate, sbInsert, logAudit]
  );

  const updateRiskFlag: StoreValue["updateRiskFlag"] = useCallback(
    (id, patch) => {
      mutate((d) => {
        const f = d.risk_flags.find((x) => x.id === id);
        if (f) Object.assign(f, patch);
      });
      sbUpdate("risk_flags", id, patch as Record<string, unknown>);
    },
    [mutate, sbUpdate]
  );

  const createStrategy: StoreValue["createStrategy"] = useCallback(
    (input) => {
      const nowIso = new Date().toISOString();
      const strat: Strategy = {
        id: genId("strat"),
        title: input.title,
        description: input.description,
        category: input.category || "planejamento",
        instructions: input.instructions || "",
        source_type: input.source_type || "professional",
        professional_id: input.professional_id ?? null,
        global: input.global ?? false,
        active: true,
        created_at: nowIso,
        updated_at: nowIso,
      };
      mutate((d) => {
        d.strategies.push(strat);
      });
      sbInsert("strategies", strat as unknown as Record<string, unknown>);
      return strat;
    },
    [mutate, sbInsert]
  );

  const linkUserToProfessional: StoreValue["linkUserToProfessional"] = useCallback(
    (userId, professionalId) => {
      const link: ProfessionalUserLink = {
        id: genId("link"),
        professional_id: professionalId,
        user_id: userId,
        started_at: new Date().toISOString(),
        ended_at: null,
        active: true,
      };
      const closedIds: string[] = [];
      mutate((d) => {
        d.professional_user_links.forEach((l) => {
          if (l.user_id === userId && l.active) {
            l.active = false;
            l.ended_at = new Date().toISOString();
            closedIds.push(l.id);
          }
        });
        d.professional_user_links.push(link);
        const p = d.profiles.find((x) => x.id === userId);
        if (p) p.professional_id = professionalId;
      });
      for (const id of closedIds) sbUpdate("professional_user_links", id, { active: false, ended_at: new Date().toISOString() });
      sbInsert("professional_user_links", link as unknown as Record<string, unknown>);
      sbUpdate("profiles", userId, { professional_id: professionalId });
      logAudit("link_user", "user", userId, { professional_id: professionalId });
    },
    [mutate, sbUpdate, sbInsert, logAudit]
  );

  // ----- selectors -----
  const patternsFor: StoreValue["patternsFor"] = useCallback(
    (userId) =>
      classifyPatterns(
        db.difficulty_events.filter((d) => d.user_id === userId),
        db.thought_records.filter((d) => d.user_id === userId),
        db.strategy_trials.filter((d) => d.user_id === userId),
        db.meal_checkins.filter((d) => d.user_id === userId)
      ),
    [db]
  );

  const consistencyFor: StoreValue["consistencyFor"] = useCallback(
    (userId) =>
      computeConsistency({
        checkins: db.meal_checkins.filter((d) => d.user_id === userId),
        trials: db.strategy_trials.filter((d) => d.user_id === userId),
        difficulties: db.difficulty_events.filter((d) => d.user_id === userId),
        thoughtRecords: db.thought_records.filter((d) => d.user_id === userId),
      }),
    [db]
  );

  const weeklyReportFor: StoreValue["weeklyReportFor"] = useCallback(
    (userId) => buildWeeklyReport(patternsFor(userId)),
    [patternsFor]
  );

  const usersOfProfessional: StoreValue["usersOfProfessional"] = useCallback(
    (professionalId) => {
      const ids = db.professional_user_links
        .filter((l) => l.professional_id === professionalId && l.active)
        .map((l) => l.user_id);
      return db.profiles.filter((p) => ids.includes(p.id));
    },
    [db]
  );

  const value: StoreValue = {
    db,
    currentUserId,
    currentProfile,
    ready,
    mode: SB ? "supabase" : "demo",
    authError,
    login,
    logout,
    signIn,
    signUp,
    completeOnboarding,
    addCheckin,
    recordDifficulty,
    addAlternativeThought,
    updateAlternativeThought,
    saveCopingCard,
    createConversation,
    createEpisode,
    updateEpisode,
    addMessage,
    closeConversation,
    addStrategyTrial,
    updateStrategyTrial,
    addMealSchedule,
    updateMealSchedule,
    saveMemory,
    updateMemory,
    runSafety,
    addProfessionalNote,
    updateRiskFlag,
    createStrategy,
    linkUserToProfessional,
    logAudit,
    refreshDatabase,
    patternsFor,
    consistencyFor,
    weeklyReportFor,
    usersOfProfessional,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// Detecta pensamento tudo-ou-nada ("já que saí do planejado, tanto faz").
function detectAllOrNothing(text: string): boolean | undefined {
  if (!text.trim()) return undefined;
  return /estraguei tudo|j[áa] que|tanto faz|perdi o dia|amanh[ãa] come[çc]o|acabou mesmo/i.test(text);
}

function mergeStringValues(
  current: string[] | undefined,
  additions: string[]
): string[] {
  const result = [...(current || [])];
  for (const addition of additions) {
    const normalized = normalizeStoredText(addition);
    if (!result.some((item) => normalizeStoredText(item) === normalized)) {
      result.push(addition);
    }
  }
  return result;
}

function mergeOptionalText(
  current: string | null | undefined,
  addition: string | null | undefined
): string {
  const next = addition?.trim();
  if (!next) return current || "";
  if (!current) return next;
  const normalizedCurrent = normalizeStoredText(current);
  const normalizedNext = normalizeStoredText(next);
  if (normalizedCurrent.includes(normalizedNext)) return current;
  if (normalizedNext.includes(normalizedCurrent)) return next;
  return `${current} | ${next}`.slice(0, 2000);
}

function normalizeStoredText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function emptyDatabase(): Database {
  return {
    profiles: [], professionals: [], professional_user_links: [], behavioral_goals: [],
    coping_cards: [], meal_schedules: [], user_memories: [], meal_checkins: [],
    difficulty_events: [], thought_records: [], alternative_thoughts: [],
    conversations: [], behavioral_episodes: [], conversation_messages: [], strategies: [], strategy_trials: [],
    pattern_snapshots: [], consistency_scores: [], weekly_reports: [], risk_flags: [],
    professional_notes: [], notification_preferences: [], scheduled_interventions: [],
    legal_documents: [], legal_acceptances: [], audit_logs: [],
  };
}

function currentDocId(db: Database, type: "terms" | "privacy"): string {
  return db.legal_documents.find((d) => d.type === type && d.active)?.id || "";
}

function traduzErro(msg: string, status?: number): string {
  const texto = (msg || "").trim();
  if (/invalid login credentials/i.test(texto)) return "E-mail ou senha incorretos.";
  if (/already registered|already exists/i.test(texto)) return "Este e-mail já está cadastrado.";
  if (/password should be at least/i.test(texto)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/email not confirmed/i.test(texto)) return "Confirme teu e-mail antes de entrar.";
  if (/rate limit|too many/i.test(texto)) return "Muitas tentativas. Espera um minuto e tenta de novo.";
  if (/failed to fetch|network/i.test(texto))
    return "Não consegui falar com o servidor. Verifica tua conexão e tenta novamente.";
  // Erro interno do servidor de autenticação: a mensagem costuma vir vazia ("{}").
  if (status && status >= 500) {
    return "O servidor de autenticação falhou (erro 500). Isso costuma ser um problema na conta do lado do servidor, não na tua senha.";
  }
  // Nunca mostrar um objeto vazio ou texto sem sentido para o usuário.
  if (!texto || texto === "{}" || texto === "[]") {
    return "Não consegui completar o login agora. Tenta novamente em instantes.";
  }
  return texto;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore deve ser usado dentro de StoreProvider");
  return ctx;
}
