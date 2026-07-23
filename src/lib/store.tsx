"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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
  RiskStatus,
  ProfessionalUserLink,
} from "./types";
import { buildDemoDatabase, uid, USER_ID, ADMIN_ID } from "./demo-data";
import { computeConsistency } from "./consistency";
import { classifyPatterns, type PatternSummary } from "./patterns";
import { buildWeeklyReport } from "./reports";
import { analyzeSafetyLocal } from "./ai/safety";

const DB_KEY = "metanoia_db_v1";
const SESSION_KEY = "metanoia_session_v1";

interface StoreValue {
  db: Database;
  currentUserId: string | null;
  currentProfile: Profile | null;
  ready: boolean;
  // sessão
  login: (role: Role) => void;
  logout: () => void;
  // usuário
  completeOnboarding: (data: OnboardingData) => void;
  addCheckin: (input: Partial<MealCheckin> & { status: MealCheckin["status"] }) => MealCheckin;
  recordDifficulty: (
    userId: string,
    answers: Record<string, unknown>,
    conversationId?: string
  ) => { event: DifficultyEvent; thought: ThoughtRecord };
  saveCopingCard: (userId: string, patch: Partial<CopingCard>) => void;
  createConversation: (userId: string, type: Conversation["type"], title: string) => Conversation;
  addMessage: (msg: Omit<ConversationMessage, "id" | "created_at">) => ConversationMessage;
  closeConversation: (conversationId: string, summary?: string) => void;
  addStrategyTrial: (input: Partial<StrategyTrial> & { user_id: string; title_snapshot: string }) => StrategyTrial;
  updateStrategyTrial: (id: string, patch: Partial<StrategyTrial>) => void;
  runSafety: (userId: string, text: string, conversationId?: string, messageId?: string) => ReturnType<typeof analyzeSafetyLocal>;
  // profissional
  addProfessionalNote: (input: Omit<ProfessionalNote, "id" | "created_at" | "updated_at">) => void;
  updateRiskFlag: (id: string, patch: Partial<RiskFlag>) => void;
  createStrategy: (input: Partial<Strategy> & { title: string; description: string }) => Strategy;
  // admin
  linkUserToProfessional: (userId: string, professionalId: string) => void;
  logAudit: (action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>) => void;
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
}

const StoreContext = createContext<StoreValue | null>(null);

function loadDb(): Database {
  if (typeof window === "undefined") return buildDemoDatabase();
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as Database;
  } catch {
    // ignora e recria
  }
  const seeded = buildDemoDatabase();
  return seeded;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Database>(() => buildDemoDatabase());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadDb();
    setDb(loaded);
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (s) setCurrentUserId(s);
    } catch {
      /* noop */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Database) => {
    setDb(next);
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }, []);

  const mutate = useCallback(
    (fn: (draft: Database) => void) => {
      setDb((prev) => {
        const next: Database = JSON.parse(JSON.stringify(prev));
        fn(next);
        try {
          localStorage.setItem(DB_KEY, JSON.stringify(next));
        } catch {
          /* quota */
        }
        return next;
      });
    },
    []
  );

  const currentProfile = currentUserId
    ? db.profiles.find((p) => p.id === currentUserId) || null
    : null;

  const login = useCallback((role: Role) => {
    const id = role === "user" ? USER_ID : role === "professional" ? PRO_ID_PROFILE() : ADMIN_ID;
    setCurrentUserId(id);
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {
      /* noop */
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentUserId(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const logAudit = useCallback(
    (action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) => {
      mutate((d) => {
        d.audit_logs.unshift({
          id: uid("audit"),
          actor_id: currentUserId || "system",
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          metadata,
          created_at: new Date().toISOString(),
        });
      });
    },
    [mutate, currentUserId]
  );

  const completeOnboarding = useCallback(
    (data: OnboardingData) => {
      if (!currentUserId) return;
      mutate((d) => {
        const p = d.profiles.find((x) => x.id === currentUserId);
        if (!p) return;
        p.preferred_name = data.preferred_name || p.preferred_name;
        p.onboarding_completed = true;
        p.terms_version = "1.0";
        p.terms_accepted_at = new Date().toISOString();
        p.privacy_version = "1.0";
        p.privacy_accepted_at = new Date().toISOString();
        d.behavioral_goals.push({
          id: uid("goal"),
          user_id: currentUserId,
          goal_type: data.goal_type as never,
          description: data.goal_description,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        d.legal_acceptances.push({
          id: uid("acc"),
          user_id: currentUserId,
          document_id: "legal-terms-1",
          accepted_at: new Date().toISOString(),
          ip_address: null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        });
        const np = d.notification_preferences.find((n) => n.user_id === currentUserId);
        if (np) {
          np.support_times = data.support_times;
        } else {
          d.notification_preferences.push({
            id: uid("np"),
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      });
    },
    [currentUserId, mutate]
  );

  const addCheckin: StoreValue["addCheckin"] = useCallback(
    (input) => {
      const checkin: MealCheckin = {
        id: uid("chk"),
        user_id: input.user_id || currentUserId || USER_ID,
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
      return checkin;
    },
    [currentUserId, mutate]
  );

  const recordDifficulty: StoreValue["recordDifficulty"] = useCallback(
    (userId, answers, conversationId) => {
      const event: DifficultyEvent = {
        id: uid("diff"),
        user_id: userId,
        checkin_id: null,
        conversation_id: conversationId || null,
        occurred_at: new Date().toISOString(),
        primary_reason: (answers.reasons as string[])?.[0] || null,
        reasons: (answers.reasons as string[]) || [],
        context: (answers.situation as string) || null,
        hunger_intensity: (answers.hunger_intensity as number) ?? null,
        urge_intensity: (answers.urge_intensity as number) ?? null,
        emotional_intensity: (answers.emotional_intensity as number) ?? null,
        created_at: new Date().toISOString(),
      };
      const thought: ThoughtRecord = {
        id: uid("thr"),
        user_id: userId,
        difficulty_event_id: event.id,
        situation: (answers.situation as string) || undefined,
        automatic_thought: (answers.automatic_thought as string) || undefined,
        emotions: answers.emotion ? [answers.emotion as string] : [],
        behavior: (answers.behavior as string) || undefined,
        consequences: (answers.consequences as string) || undefined,
        decision_point: (answers.decision_point as string) || undefined,
        alternative_thought: (answers.alternative_thought as string) || undefined,
        created_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.difficulty_events.unshift(event);
        d.thought_records.unshift(thought);
        // compromisso vira estratégia planejada
        if (answers.commitment && answers.strategy_choice) {
          d.strategy_trials.unshift({
            id: uid("trial"),
            user_id: userId,
            strategy_id: "custom",
            difficulty_event_id: event.id,
            planned_for: new Date(Date.now() + 86400000).toISOString(),
            tested_at: null,
            result: "not_tested",
            user_feedback: null,
            title_snapshot: answers.strategy_choice as string,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      });
      return { event, thought };
    },
    [mutate]
  );

  const saveCopingCard: StoreValue["saveCopingCard"] = useCallback(
    (userId, patch) => {
      mutate((d) => {
        let card = d.coping_cards.find((c) => c.user_id === userId);
        if (!card) {
          card = {
            id: uid("card"),
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
      });
    },
    [mutate]
  );

  const createConversation: StoreValue["createConversation"] = useCallback(
    (userId, type, title) => {
      const profile = db.profiles.find((p) => p.id === userId);
      const conv: Conversation = {
        id: uid("conv"),
        user_id: userId,
        professional_id: profile?.professional_id || null,
        type,
        status: "open",
        title,
        started_at: new Date().toISOString(),
        ended_at: null,
        risk_level: "none",
        summary: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.conversations.unshift(conv);
      });
      return conv;
    },
    [db.profiles, mutate]
  );

  const addMessage: StoreValue["addMessage"] = useCallback(
    (msg) => {
      const full: ConversationMessage = {
        ...msg,
        id: uid("msg"),
        created_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.conversation_messages.push(full);
        const conv = d.conversations.find((c) => c.id === msg.conversation_id);
        if (conv) conv.updated_at = full.created_at;
      });
      return full;
    },
    [mutate]
  );

  const closeConversation: StoreValue["closeConversation"] = useCallback(
    (conversationId, summary) => {
      mutate((d) => {
        const conv = d.conversations.find((c) => c.id === conversationId);
        if (conv) {
          conv.status = "closed";
          conv.ended_at = new Date().toISOString();
          if (summary) conv.summary = summary;
        }
      });
    },
    [mutate]
  );

  const addStrategyTrial: StoreValue["addStrategyTrial"] = useCallback(
    (input) => {
      const trial: StrategyTrial = {
        id: uid("trial"),
        user_id: input.user_id,
        strategy_id: input.strategy_id || "custom",
        difficulty_event_id: input.difficulty_event_id ?? null,
        planned_for: input.planned_for ?? null,
        tested_at: input.tested_at ?? null,
        result: input.result || "not_tested",
        user_feedback: input.user_feedback ?? null,
        title_snapshot: input.title_snapshot,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.strategy_trials.unshift(trial);
      });
      return trial;
    },
    [mutate]
  );

  const updateStrategyTrial: StoreValue["updateStrategyTrial"] = useCallback(
    (id, patch) => {
      mutate((d) => {
        const t = d.strategy_trials.find((x) => x.id === id);
        if (t) {
          Object.assign(t, patch);
          t.updated_at = new Date().toISOString();
        }
      });
    },
    [mutate]
  );

  const runSafety: StoreValue["runSafety"] = useCallback(
    (userId, text, conversationId, messageId) => {
      const result = analyzeSafetyLocal(text);
      if (result.risk && (result.level === "medium" || result.level === "high" || result.categories.length)) {
        mutate((d) => {
          for (const cat of result.categories) {
            d.risk_flags.unshift({
              id: uid("risk"),
              user_id: userId,
              conversation_id: conversationId || null,
              message_id: messageId || null,
              category: cat.category,
              severity: cat.severity,
              evidence: cat.evidence,
              status: "open",
              reviewed_by: null,
              reviewed_at: null,
              professional_note: null,
              created_at: new Date().toISOString(),
            });
          }
          if (conversationId) {
            const conv = d.conversations.find((c) => c.id === conversationId);
            if (conv) conv.risk_level = result.level;
          }
        });
      }
      return result;
    },
    [mutate]
  );

  const addProfessionalNote: StoreValue["addProfessionalNote"] = useCallback(
    (input) => {
      mutate((d) => {
        d.professional_notes.unshift({
          ...input,
          id: uid("note"),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });
      logAudit("add_professional_note", "user", input.user_id, { professional_id: input.professional_id });
    },
    [mutate, logAudit]
  );

  const updateRiskFlag: StoreValue["updateRiskFlag"] = useCallback(
    (id, patch) => {
      mutate((d) => {
        const f = d.risk_flags.find((x) => x.id === id);
        if (f) Object.assign(f, patch);
      });
    },
    [mutate]
  );

  const createStrategy: StoreValue["createStrategy"] = useCallback(
    (input) => {
      const strat: Strategy = {
        id: uid("strat"),
        title: input.title,
        description: input.description,
        category: input.category || "planejamento",
        instructions: input.instructions || "",
        source_type: input.source_type || "professional",
        professional_id: input.professional_id ?? null,
        global: input.global ?? false,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mutate((d) => {
        d.strategies.push(strat);
      });
      return strat;
    },
    [mutate]
  );

  const linkUserToProfessional: StoreValue["linkUserToProfessional"] = useCallback(
    (userId, professionalId) => {
      mutate((d) => {
        d.professional_user_links.forEach((l) => {
          if (l.user_id === userId && l.active) {
            l.active = false;
            l.ended_at = new Date().toISOString();
          }
        });
        const link: ProfessionalUserLink = {
          id: uid("link"),
          professional_id: professionalId,
          user_id: userId,
          started_at: new Date().toISOString(),
          ended_at: null,
          active: true,
        };
        d.professional_user_links.push(link);
        const p = d.profiles.find((x) => x.id === userId);
        if (p) p.professional_id = professionalId;
      });
      logAudit("link_user", "user", userId, { professional_id: professionalId });
    },
    [mutate, logAudit]
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
    login,
    logout,
    completeOnboarding,
    addCheckin,
    recordDifficulty,
    saveCopingCard,
    createConversation,
    addMessage,
    closeConversation,
    addStrategyTrial,
    updateStrategyTrial,
    runSafety,
    addProfessionalNote,
    updateRiskFlag,
    createStrategy,
    linkUserToProfessional,
    logAudit,
    patternsFor,
    consistencyFor,
    weeklyReportFor,
    usersOfProfessional,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// O profissional loga com o id do Professional (PRO_ID), mas o profile é PRO_PROFILE_ID.
// Mapeamos para o profile do profissional para a sessão.
function PRO_ID_PROFILE() {
  return "demo-pro-laura-profile";
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore deve ser usado dentro de StoreProvider");
  return ctx;
}
