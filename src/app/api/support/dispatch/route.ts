import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import webpush from "web-push";
import {
  supportAdmin,
  syncSupport,
  pushReady,
  loadSupport,
} from "@/lib/support-server";
import {
  canSendSupport,
  invitationHref,
  PUSH_COPY,
  isRelevantInvitation,
} from "@/lib/support";
import { validPushEndpoint } from "@/lib/push";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const actual = Buffer.from(req.headers.get("authorization") || ""),
    expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushReady())
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  const admin = supportAdmin();
  let sent = 0,
    failed = 0;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const { data: users, error } = await admin
    .from("notification_preferences")
    .select("user_id")
    .eq("enabled", true)
    .eq("push_enabled", true);
  if (error)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  for (const user of users || []) {
    try {
      const { db } = await syncSupport(admin, user.user_id),
        p = db.notification_preferences[0];
      const candidates = db.scheduled_interventions
        .filter((i) => canSendSupport(i, db, p))
        .sort(
          (a, b) =>
            Number(a.payload.priority || 4) - Number(b.payload.priority || 4),
        );
      for (const i of candidates) {
        const { data: claimed, error: claimError } = await admin.rpc(
          "claim_support",
          { p_id: i.id },
        );
        if (claimError || !claimed) continue;
        // Revalidate consent/context immediately before crossing the external push boundary.
        const latest = await loadSupport(admin, user.user_id),
          current = latest.scheduled_interventions.find((x) => x.id === i.id),
          pref = latest.notification_preferences[0];
        if (
          !current ||
          current.status !== "sending" ||
          !pref?.push_enabled ||
          !isRelevantInvitation(current, latest, pref)
        ) {
          await admin
            .from("scheduled_interventions")
            .update({ status: "cancelled" })
            .eq("id", i.id);
          continue;
        }
        const { data: sub } = await admin
          .from("push_subscriptions")
          .select("id,endpoint,keys")
          .eq("user_id", user.user_id)
          .eq("enabled", true)
          .order("last_used_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!sub || !validPushEndpoint(sub.endpoint)) {
          await admin
            .from("scheduled_interventions")
            .update({ status: "failed", last_error: "device_unavailable" })
            .eq("id", i.id);
          failed++;
          continue;
        }
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({ ...PUSH_COPY, url: invitationHref(i), tag: i.id }),
            {
              TTL: Math.max(
                1,
                Math.min(
                  5400,
                  Math.floor((Date.parse(i.expires_at!) - Date.now()) / 1000),
                ),
              ),
              urgency: "normal",
              topic: createHash("sha256")
                .update(i.id)
                .digest("base64url")
                .slice(0, 32),
              timeout: 8000,
            },
          );
          await admin
            .from("scheduled_interventions")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", i.id)
            .eq("status", "sending");
          sent++;
        } catch (e) {
          const code = Number((e as { statusCode?: number }).statusCode || 0);
          if (code === 404 || code === 410)
            await admin
              .from("push_subscriptions")
              .update({ enabled: false })
              .eq("id", sub.id);
          await admin
            .from("scheduled_interventions")
            .update({
              status: "failed",
              last_error:
                code === 404 || code === 410
                  ? "device_expired"
                  : "delivery_failed",
            })
            .eq("id", i.id)
            .eq("status", "sending");
          failed++;
        }
        break;
      }
    } catch {
      failed++;
      console.warn("Support dispatch could not complete for a recipient.");
    }
  }
  return NextResponse.json(
    { sent, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
