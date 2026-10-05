import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase/server";
import {
  buildInsights,
  insightFeedbackMemory,
  insightTopic,
  type InsightsDatabase,
  type InsightFeedback,
} from "./insights";

export async function insightsAuth() {
  const client = await createServerSupabase();
  const user = client && (await client.auth.getUser()).data.user;
  if (!client || !user) throw new Error("Unauthenticated");
  const { data: profile, error } = await client
    .from("profiles")
    .select(
      "role,timezone,onboarding_completed,access_enabled,access_starts_at,access_ends_at",
    )
    .eq("id", user.id)
    .single();
  if (
    error ||
    !profile ||
    profile.role !== "user" ||
    !profile.access_enabled ||
    !profile.onboarding_completed ||
    (profile.access_starts_at &&
      Date.parse(profile.access_starts_at) > Date.now()) ||
    (profile.access_ends_at && Date.parse(profile.access_ends_at) <= Date.now())
  )
    throw new Error("Forbidden");
  return { client, userId: user.id, timezone: profile.timezone };
}

export async function loadInsightsDatabase(
  client: SupabaseClient,
  userId: string,
): Promise<InsightsDatabase> {
  const tables = [
    "behavioral_episodes",
    "difficulty_events",
    "thought_records",
    "strategy_trials",
    "alternative_thoughts",
    "user_memories",
    "coping_cards",
  ] as const;
  const db = {} as InsightsDatabase;
  for (const table of tables) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(1000);
    if (error) throw new Error("Load failed");
    Object.assign(db, { [table]: data || [] });
    if (table === "user_memories" && data?.length === 1000) {
      // Never silently forget old rejections because the recent-data page is full.
      let full = true;
      for (let offset = 1000; full && offset < 10000; offset += 1000) {
        const next = await client
          .from(table)
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 999);
        if (next.error) throw new Error("Load failed");
        db.user_memories.push(...(next.data || []));
        full = next.data?.length === 1000;
      }
      if (full) throw new Error("Memory window exceeded");
    }
  }
  return db;
}

export async function saveInsightFeedback(
  client: SupabaseClient,
  userId: string,
  timezone: string,
  key: string,
  choice: InsightFeedback,
) {
  const db = await loadInsightsDatabase(client, userId);
  const previous = db.user_memories
    .filter(
      (m) =>
        m.user_id === userId &&
        m.topic === insightTopic(key) &&
        !m.superseded_at,
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  // Retrying a rejected decision remains idempotent, even though its card is hidden.
  if (previous?.validation_status === "rejected" && choice === "rejected")
    return previous;
  const block = buildInsights({ userId, db, timezone }).blocks.find(
    (b) => b.key === key && b.kind !== "resource",
  );
  if (!block) throw new Error("Insight unavailable");
  // Stable owner-scoped UUID avoids duplicate memory rows across tabs/retries.
  const hex = createHash("sha256")
    .update(`${userId}:${insightTopic(key)}`)
    .digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const row = insightFeedbackMemory(
    userId,
    block,
    choice,
    id,
    new Date(),
    previous,
  );
  const { data, error } = await client
    .from("user_memories")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error || !data) throw new Error("Save failed");
  return data;
}
