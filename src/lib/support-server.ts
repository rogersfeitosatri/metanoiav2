import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase/server";
import { SUPABASE_URL } from "./supabase/config";
import {
  defaultPreferences,
  dueSupport,
  reconcileSupport,
  type SupportDatabase,
} from "./support";
import type { Profile } from "./types";

export function supportAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Apoio indisponível no servidor.");
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function supportAuth() {
  const client = await createServerSupabase();
  const user = client && (await client.auth.getUser()).data.user;
  if (!client || !user) throw new Error("Sessão não encontrada.");
  const { data: p, error } = await client
    .from("profiles")
    .select(
      "id,role,timezone,onboarding_completed,access_enabled,access_starts_at,access_ends_at",
    )
    .eq("id", user.id)
    .single();
  if (
    error ||
    !p ||
    p.role !== "user" ||
    !p.access_enabled ||
    !p.onboarding_completed ||
    (p.access_starts_at && Date.parse(p.access_starts_at) > Date.now()) ||
    (p.access_ends_at && Date.parse(p.access_ends_at) <= Date.now())
  )
    throw new Error("Acesso indisponível.");
  return {
    client,
    admin: supportAdmin(),
    userId: user.id,
    profile: p as Profile,
  };
}
const TABLES = [
  "meal_schedules",
  "notification_preferences",
  "behavioral_episodes",
  "strategy_trials",
  "meal_checkins",
  "scheduled_interventions",
] as const;
export async function loadSupport(
  client: SupabaseClient,
  userId: string,
): Promise<SupportDatabase> {
  const db = { profiles: [] } as unknown as SupportDatabase;
  await Promise.all(
    TABLES.map(async (table) => {
      let q = client.from(table).select("*").eq("user_id", userId);
      if (table === "meal_checkins")
        q = q.gte(
          "occurred_at",
          new Date(Date.now() - 4 * 86400000).toISOString(),
        );
      if (table === "scheduled_interventions")
        q = q.gte(
          "created_at",
          new Date(Date.now() - 5 * 86400000).toISOString(),
        );
      if (table === "behavioral_episodes")
        q = q.in("status", ["active", "waiting_followup"]);
      if (table === "strategy_trials")
        q = q.in("result", ["not_tested", "situation_not_occurred"]);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw new Error("Não consegui carregar os apoios.");
      Object.assign(db, { [table]: data || [] });
    }),
  );
  return db;
}
export async function syncSupport(admin: SupabaseClient, userId: string) {
  let db = await loadSupport(admin, userId);
  if (!db.notification_preferences.length) {
    const { data: profile } = await admin
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .single();
    const { id, created_at, updated_at, ...p } = defaultPreferences(
      userId,
      profile?.timezone,
    );
    void id;
    void created_at;
    void updated_at;
    const { error } = await admin
      .from("notification_preferences")
      .upsert(p, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) throw new Error("Não consegui preparar as preferências.");
    db = await loadSupport(admin, userId);
  }
  const revised = reconcileSupport(db, userId);
  const old = new Map(db.scheduled_interventions.map((i) => [i.id, i]));
  const fresh = revised
    .filter((i) => !old.has(i.id))
    .map(({ id, ...row }) => {
      void id;
      return row;
    });
  if (fresh.length) {
    const { error } = await admin
      .from("scheduled_interventions")
      .upsert(fresh, {
        onConflict: "user_id,occurrence_key",
        ignoreDuplicates: true,
      });
    if (error) throw new Error("Não consegui preparar os convites.");
  }
  for (const i of revised.filter(
    (i) => old.has(i.id) && old.get(i.id)!.status !== i.status,
  )) {
    const { error } = await admin
      .from("scheduled_interventions")
      .update({ status: i.status })
      .eq("id", i.id)
      .eq("user_id", userId)
      .in("status", ["scheduled", "sent", "failed"]);
    if (error) throw new Error("Não consegui atualizar os convites.");
  }
  db = await loadSupport(admin, userId);
  return { db, invitations: dueSupport(db, userId) };
}
export const pushReady = () =>
  Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT &&
      process.env.CRON_SECRET,
  );
