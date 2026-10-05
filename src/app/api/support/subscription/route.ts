import { NextRequest, NextResponse } from "next/server";
import { supportAuth, pushReady } from "@/lib/support-server";
import { SubscriptionSchema } from "@/lib/push";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const { admin, userId } = await supportAuth();
    if (!pushReady()) throw new Error("Not configured");
    const sub = SubscriptionSchema.parse(await req.json());
    const { data: existing, error: readError } = await admin
      .from("push_subscriptions")
      .select("id,user_id")
      .eq("endpoint", sub.endpoint)
      .maybeSingle();
    if (readError || (existing && existing.user_id !== userId))
      throw new Error("Endpoint unavailable");
    const { error } = existing
      ? await admin
          .from("push_subscriptions")
          .update({
            ...sub,
            enabled: true,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("user_id", userId)
      : await admin
          .from("push_subscriptions")
          .insert({ ...sub, user_id: userId });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não consegui ativar neste aparelho. Tenta novamente." },
      { status: 400 },
    );
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const { admin, userId } = await supportAuth();
    const { endpoint } = await req.json();
    if (typeof endpoint !== "string") throw new Error("Endpoint required");
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não consegui desativar neste aparelho." },
      { status: 400 },
    );
  }
}
