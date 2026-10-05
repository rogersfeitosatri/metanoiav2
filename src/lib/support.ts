import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import type {
  Database,
  NotificationPreferences,
  ScheduledIntervention,
} from "./types";

export type SupportCommand =
  | { action: "meal" | "preferences"; value: unknown }
  | {
      action: "delete_meal" | "open" | "dismiss" | "responded" | "snooze";
      id: string;
    };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const days = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .transform((d) => [...new Set(d)].sort());
export const RoutineSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(80),
  time_of_day: time,
  days_of_week: days,
  active: z.boolean().default(true),
  reminder_enabled: z.boolean().default(false),
  support_mode: z.enum(["none", "before", "after"]).default("none"),
  support_offset_minutes: z.number().int().min(5).max(180).default(30),
});
export const PreferencesSchema = z.object({
  enabled: z.boolean(),
  push_enabled: z.boolean(),
  followup_enabled: z.boolean(),
  preventive_enabled: z.boolean(),
  checkin_enabled: z.boolean(),
  allowed_days: days,
  allowed_start_time: time,
  allowed_end_time: time,
  maximum_daily_notifications: z.number().int().min(1).max(4),
  timezone: z
    .string()
    .max(80)
    .refine((zone) => {
      try {
        Temporal.Now.zonedDateTimeISO(zone);
        return true;
      } catch {
        return false;
      }
    }, "Fuso inválido"),
});
export function defaultPreferences(
  userId: string,
  timezone = "America/Sao_Paulo",
): NotificationPreferences {
  return {
    id: userId,
    user_id: userId,
    enabled: true,
    push_enabled: false,
    followup_enabled: true,
    preventive_enabled: true,
    checkin_enabled: true,
    allowed_days: [0, 1, 2, 3, 4, 5, 6],
    allowed_start_time: "08:00",
    allowed_end_time: "21:00",
    maximum_daily_notifications: 2,
    support_times: [],
    timezone,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
export function localTime(date: Date, timezone: string) {
  return Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO(timezone);
}
export function allowedAt(p: NotificationPreferences, now: Date): boolean {
  const local = localTime(now, p.timezone),
    minute = local.hour * 60 + local.minute;
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const from = minutes(p.allowed_start_time),
    to = minutes(p.allowed_end_time);
  return (
    p.enabled &&
    p.allowed_days.includes(local.dayOfWeek % 7) &&
    (from === to ||
      (from < to
        ? minute >= from && minute < to
        : minute >= from || minute < to))
  );
}
const pending = (result: string) =>
  ["not_tested", "situation_not_occurred"].includes(result);
export function interventionIntent(i: ScheduledIntervention) {
  return i.intervention_type === "preventive"
    ? "prepare"
    : i.intervention_type === "strategy_followup"
      ? "review_strategy"
      : "meal_checkin";
}
export function invitationHref(i: ScheduledIntervention) {
  return `/app/hoje?invitation=${encodeURIComponent(i.id)}`;
}
export const PUSH_COPY = {
  title: "Metanóia",
  body: "Tem um convite de apoio no horário que tu escolheu. Abrir quando fizer sentido.",
};
export type SupportDatabase = Pick<
  Database,
  | "meal_schedules"
  | "notification_preferences"
  | "profiles"
  | "behavioral_episodes"
  | "strategy_trials"
  | "meal_checkins"
  | "scheduled_interventions"
>;

export function planSupport(
  db: SupportDatabase,
  userId: string,
  now = new Date(),
): ScheduledIntervention[] {
  const p = db.notification_preferences.find((p) => p.user_id === userId);
  if (!p?.enabled) return [];
  const date = localTime(now, p.timezone).toPlainDate();
  const candidates: ScheduledIntervention[] = [];
  const add = (
    key: string,
    at: string,
    type: ScheduledIntervention["intervention_type"],
    payload: Record<string, unknown>,
    mealId?: string,
  ) => {
    // Schedule edits must not repeat a delivery or a choice already made for this occurrence.
    const handled = db.scheduled_interventions.some(
      (previous) =>
        previous.user_id === userId &&
        previous.intervention_type === type &&
        Boolean(
          previous.responded_at || previous.attempted_at || previous.opened_at,
        ) &&
        (mealId
          ? previous.meal_schedule_id === mealId &&
            previous.payload.local_date === payload.local_date
          : previous.payload.strategy_trial_id === payload.strategy_trial_id &&
            previous.scheduled_for === at),
    );
    if (handled) return;
    const ttl = type === "strategy_followup" ? 24 * 60 : 90;
    const expires = new Date(Date.parse(at) + ttl * 60000).toISOString();
    if (Date.parse(expires) <= now.getTime()) return;
    candidates.push({
      id: key,
      user_id: userId,
      meal_schedule_id: mealId || null,
      occurrence_key: key,
      intervention_type: type,
      scheduled_for: at,
      expires_at: expires,
      status: "scheduled",
      rule_source: "support_v1",
      payload,
      created_at: now.toISOString(),
    });
  };
  for (const meal of db.meal_schedules.filter(
    (m) =>
      m.user_id === userId &&
      m.active &&
      m.reminder_enabled &&
      m.support_mode &&
      m.support_mode !== "none",
  )) {
    if (
      (meal.support_mode === "before" && !p.preventive_enabled) ||
      (meal.support_mode === "after" && !p.checkin_enabled)
    )
      continue;
    for (let offset = -1; offset <= 2; offset++) {
      const d = date.add({ days: offset });
      if (!meal.days_of_week.includes(d.dayOfWeek % 7)) continue;
      // Reject nonexistent/ambiguous local times instead of inventing an occurrence across DST.
      let occurrence: Temporal.ZonedDateTime;
      try {
        occurrence = Temporal.ZonedDateTime.from(
          `${d}T${meal.time_of_day.slice(0, 5)}[${p.timezone}]`,
          { disambiguation: "reject" },
        );
      } catch {
        continue;
      }
      const at = occurrence
        .add({
          minutes:
            (meal.support_mode === "before" ? -1 : 1) *
            (meal.support_offset_minutes ?? 30),
        })
        .toInstant()
        .toString();
      const key = `meal:${meal.id}:${d}:${meal.support_mode}:${meal.updated_at}:${p.updated_at}`;
      add(
        key,
        at,
        meal.support_mode === "before" ? "preventive" : "meal_checkin",
        {
          meal_name: meal.name,
          occurrence_at: occurrence.toInstant().toString(),
          local_date: d.toString(),
          revision: meal.updated_at,
          preferences_revision: p.updated_at,
          priority: meal.support_mode === "before" ? 1 : 4,
        },
        meal.id,
      );
    }
  }
  if (p.followup_enabled)
    for (const ep of db.behavioral_episodes.filter(
      (e) =>
        e.user_id === userId &&
        e.status === "waiting_followup" &&
        e.followup_required &&
        e.followup_at &&
        e.related_strategy_trial_id,
    )) {
      const trial = db.strategy_trials.find(
        (t) => t.id === ep.related_strategy_trial_id && t.user_id === userId,
      );
      if (!trial || !pending(trial.result)) continue;
      add(
        `trial:${trial.id}:${ep.followup_at}:${p.updated_at}`,
        ep.followup_at!,
        "strategy_followup",
        {
          strategy_trial_id: trial.id,
          origin_episode_id: ep.id,
          preferences_revision: p.updated_at,
          priority: 2,
        },
      );
    }
  return candidates.filter((i) => isRelevantInvitation(i, db, p, now));
}

export function isRelevantInvitation(
  i: ScheduledIntervention,
  db: SupportDatabase,
  p: NotificationPreferences,
  now = new Date(),
): boolean {
  if (
    i.user_id !== p.user_id ||
    !p.enabled ||
    ["responded", "cancelled", "expired"].includes(i.status) ||
    !i.expires_at ||
    Date.parse(i.expires_at) <= now.getTime()
  )
    return false;
  if (i.payload.preferences_revision !== p.updated_at) return false;
  if (i.intervention_type === "strategy_followup") {
    if (!p.followup_enabled) return false;
    const t = db.strategy_trials.find(
      (t) => t.id === i.payload.strategy_trial_id && t.user_id === p.user_id,
    );
    return Boolean(t && pending(t.result));
  }
  const m = db.meal_schedules.find(
    (m) => m.id === i.meal_schedule_id && m.user_id === p.user_id,
  );
  if (
    !m?.active ||
    !m.reminder_enabled ||
    m.updated_at !== i.payload.revision ||
    m.support_mode === "none"
  )
    return false;
  if (
    (i.intervention_type === "preventive" && !p.preventive_enabled) ||
    (i.intervention_type === "meal_checkin" && !p.checkin_enabled)
  )
    return false;
  return !db.meal_checkins.some(
    (c) =>
      c.user_id === p.user_id &&
      c.schedule_id === m.id &&
      localTime(new Date(c.occurred_at), p.timezone)
        .toPlainDate()
        .toString() === i.payload.local_date,
  );
}

export function dueSupport(
  db: SupportDatabase,
  userId: string,
  now = new Date(),
): ScheduledIntervention[] {
  const p = db.notification_preferences.find((p) => p.user_id === userId);
  if (!p || !allowedAt(p, now)) return [];
  return db.scheduled_interventions
    .filter(
      (i) =>
        i.rule_source === "support_v1" &&
        Date.parse(i.scheduled_for) <= now.getTime() &&
        isRelevantInvitation(i, db, p, now),
    )
    .sort(
      (a, b) =>
        Number(a.payload.priority || 4) - Number(b.payload.priority || 4) ||
        Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for),
    )
    .slice(0, 2);
}
export function reconcileSupport(
  db: SupportDatabase,
  userId: string,
  now = new Date(),
): ScheduledIntervention[] {
  const planned = planSupport(db, userId, now),
    p = db.notification_preferences.find((p) => p.user_id === userId);
  const existing = db.scheduled_interventions.map((i) => {
    if (
      i.user_id !== userId ||
      i.rule_source !== "support_v1" ||
      ["responded", "cancelled", "expired"].includes(i.status)
    )
      return i;
    if (i.expires_at && Date.parse(i.expires_at) <= now.getTime())
      return { ...i, status: "expired" as const };
    if (!p || !isRelevantInvitation(i, db, p, now))
      return { ...i, status: "cancelled" as const };
    return i;
  });
  const keys = new Set(existing.map((i) => i.occurrence_key));
  return [...existing, ...planned.filter((i) => !keys.has(i.occurrence_key))];
}
export function canSendSupport(
  i: ScheduledIntervention,
  db: SupportDatabase,
  p: NotificationPreferences,
  now = new Date(),
) {
  if (
    !p.push_enabled ||
    i.status !== "scheduled" ||
    i.attempted_at ||
    i.opened_at ||
    !allowedAt(p, now) ||
    !isRelevantInvitation(i, db, p, now) ||
    Date.parse(i.scheduled_for) > now.getTime()
  )
    return false;
  if (
    db.behavioral_episodes.some(
      (e) =>
        e.user_id === p.user_id &&
        e.status === "active" &&
        Date.parse(e.updated_at) > now.getTime() - 15 * 60000,
    )
  )
    return false;
  const today = localTime(now, p.timezone).toPlainDate().toString();
  const attempts = db.scheduled_interventions.filter(
    (x) => x.user_id === p.user_id && x.attempted_at,
  );
  return (
    attempts.filter(
      (x) =>
        localTime(new Date(x.attempted_at!), p.timezone)
          .toPlainDate()
          .toString() === today,
    ).length < p.maximum_daily_notifications &&
    !attempts.some(
      (x) => Date.parse(x.attempted_at!) > now.getTime() - 90 * 60000,
    )
  );
}
