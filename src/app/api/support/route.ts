import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supportAuth, syncSupport, pushReady } from "@/lib/support-server";
import { PreferencesSchema, RoutineSchema } from "@/lib/support";

export const runtime = "nodejs";
const ok = (data: unknown) =>
  NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(req: NextRequest) {
  try {
    const { admin, userId } = await supportAuth();
    const data = await syncSupport(admin, userId);
    const id = req.nextUrl.searchParams.get("invitation");
    let invitation = null;
    if (id && z.string().uuid().safeParse(id).success) {
      const result = await admin
        .from("scheduled_interventions")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      invitation = result.data;
    }
    return ok({
      invitations: data.invitations,
      invitation,
      publicKey: pushReady() ? process.env.VAPID_PUBLIC_KEY : null,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não consegui carregar os apoios. Entra novamente se tua sessão expirou.",
      },
      { status: 400 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    const { admin, userId } = await supportAuth();
    const body = await req.json();
    if (body.action === "meal") {
      const { id, ...row } = RoutineSchema.parse(body.value);
      if (id) z.string().uuid().parse(id);
      const query = id
        ? admin
            .from("meal_schedules")
            .update({ ...row, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("user_id", userId)
        : admin.from("meal_schedules").insert({ ...row, user_id: userId });
      const { error } = await query;
      if (error) throw error;
    } else if (body.action === "delete_meal") {
      const id = z.string().uuid().parse(body.id);
      const { error } = await admin
        .from("meal_schedules")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    } else if (body.action === "preferences") {
      const p = PreferencesSchema.parse(body.value);
      const { error } = await admin
        .from("notification_preferences")
        .upsert(
          { ...p, user_id: userId, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    } else if (body.action === "open") {
      const id = z.string().uuid().parse(body.id);
      const { data, error } = await admin.rpc("open_support", {
        p_id: id,
        p_user: userId,
      });
      if (error) throw error;
      return ok({ episodeId: data });
    } else if (["dismiss", "responded", "snooze"].includes(body.action)) {
      const id = z.string().uuid().parse(body.id);
      if (body.action === "snooze") {
        // One explicit postponement, in-app only; never a new duplicate push attempt.
        const { error } = await admin
          .from("scheduled_interventions")
          .update({
            scheduled_for: new Date(Date.now() + 30 * 60000).toISOString(),
            expires_at: new Date(Date.now() + 90 * 60000).toISOString(),
            status: "sent",
          })
          .eq("id", id)
          .eq("user_id", userId)
          .not("status", "in", "(responded,cancelled,expired)");
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("scheduled_interventions")
          .update({
            status: body.action === "dismiss" ? "cancelled" : "responded",
            responded_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", userId);
        if (error) throw error;
      }
    } else throw new Error("Invalid action");
    return ok({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não consegui salvar. Confere os dados e tenta novamente." },
      { status: 400 },
    );
  }
}
