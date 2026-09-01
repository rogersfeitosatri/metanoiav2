import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orchestrateConversation } from "@/lib/ai/conversation-orchestrator";
import { ConversationRequestSchema } from "@/lib/ai/schemas";
import { analyzeSafetyLocal } from "@/lib/ai/safety";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/config";
import { buildServerUserBehaviorContext } from "@/lib/ai/user-behavior-context";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authClient = await createServerSupabase();
  const { data: authData } = authClient
    ? await authClient.auth.getUser()
    : { data: { user: null } };
  if (isSupabaseConfigured && !authData.user) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  const parsed = ConversationRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Não consegui entender os dados desta conversa." },
      { status: 400 }
    );
  }
  let body = parsed.data;
  const message = (body.message || "").trim();
  if (body.operation === "message" && !message) {
    return NextResponse.json(
      { error: "Escreve uma mensagem para continuar." },
      { status: 400 }
    );
  }

  // Segurança decide antes da recuperação longitudinal e de qualquer provedor.
  const safety = analyzeSafetyLocal(message);
  const alertRecorded =
    safety.risk && authData.user
      ? await recordRisk(authData.user.id, body.conversation_id, safety)
      : false;

  if (safety.safe_message) {
    body = ConversationRequestSchema.parse({ ...body, context: {} });
  } else if (authClient && authData.user) {
    const ownsContext = await validateOwnedContext(
      authClient,
      authData.user.id,
      body.conversation_id,
      body.episode_id
    );
    if (!ownsContext) {
      return NextResponse.json({ error: "Conversa não encontrada." }, { status: 403 });
    }
    try {
      const context = await buildServerUserBehaviorContext(authClient, authData.user.id, {
        message,
        intent: body.intent,
        episodeId: body.episode_id,
      });
      body = ConversationRequestSchema.parse({ ...body, context });
    } catch {
      console.warn("Contexto comportamental indisponível; conversa continuou sem memória longitudinal.");
      body = ConversationRequestSchema.parse({ ...body, context: {} });
    }
  }

  const response = await orchestrateConversation(body, {
    safety,
    alertRecorded,
    onProviderError(provider) {
      console.warn(`Provedor ${provider} indisponível; fallback local aplicado.`);
    },
  });
  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function validateOwnedContext(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  userId: string,
  conversationId?: string,
  episodeId?: string
) {
  const checks = [];
  if (conversationId) {
    checks.push(
      supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle()
    );
  }
  if (episodeId) {
    checks.push(
      supabase
        .from("behavioral_episodes")
        .select("id")
        .eq("id", episodeId)
        .eq("user_id", userId)
        .maybeSingle()
    );
  }
  const results = await Promise.all(checks);
  return results.every((result) => !result.error && Boolean(result.data?.id));
}

async function recordRisk(
  userId: string,
  conversationId: string | undefined,
  safety: ReturnType<typeof analyzeSafetyLocal>
) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return false;
  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let ownedConversationId: string | null = null;
  if (conversationId) {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    ownedConversationId = data?.id || null;
  }

  const rows = safety.categories.map((category) => ({
    user_id: userId,
    conversation_id: ownedConversationId,
    message_id: null,
    category: category.category,
    severity: category.severity,
    evidence: category.evidence,
    status: "open",
  }));
  const { error } = await admin.from("risk_flags").insert(rows);
  if (!error && ownedConversationId) {
    await admin
      .from("conversations")
      .update({ risk_level: safety.level })
      .eq("id", ownedConversationId)
      .eq("user_id", userId);
  }
  return !error;
}
