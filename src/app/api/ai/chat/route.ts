import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProvider, isLlmConfigured } from "@/lib/ai/provider";
import { ChatReplySchema } from "@/lib/ai/schemas";
import { analyzeSafetyLocal } from "@/lib/ai/safety";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/config";
import { orchestratorPrompt, motivationalPrompt, tccPrompt } from "@/prompts";

export const runtime = "nodejs";

interface ChatBody {
  message: string;
  conversation_id?: string;
  history?: { from: "user" | "assistant"; text: string }[];
  context?: {
    preferred_name?: string;
    north?: string[];
    confirmed_memories?: string[];
    proposed_hypotheses?: string[];
    effective_strategies?: string[];
    pending_strategies?: string[];
    meals?: string[];
    recent_learnings?: string[];
  };
}

export async function POST(req: NextRequest) {
  const authClient = await createServerSupabase();
  const { data: authData } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  if (isSupabaseConfigured && !authData.user) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });

  let body: ChatBody;
  try { body = (await req.json()) as ChatBody; }
  catch { return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 }); }
  const message = (body.message || "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "Escreve uma mensagem para continuar." }, { status: 400 });

  const safety = analyzeSafetyLocal(message);
  let alertRecorded = false;
  if (safety.risk && authData.user) alertRecorded = await recordRisk(authData.user.id, body.conversation_id, safety);
  if (safety.safe_message) {
    return NextResponse.json({
      reply: `${safety.safe_message}${alertRecorded ? " Este sinal ficou registrado com segurança no teu acompanhamento." : ""}`,
      quick_replies: ["Quero ajuda para ficar seguro agora", "Vou contatar alguém"],
      safety: { risk: true, level: safety.level, categories: safety.categories, alert_recorded: alertRecorded },
      source: "safety",
    });
  }

  if (!isLlmConfigured()) return NextResponse.json({ ...localReply(message), source: "local", safety: { risk: safety.risk, level: safety.level, categories: safety.categories } });

  try {
    const context = body.context || {};
    const ctx = [
      context.preferred_name ? `Nome preferido: ${context.preferred_name}` : "",
      context.north?.length ? `Meu Norte confirmado: ${context.north.join("; ")}` : "",
      context.confirmed_memories?.length ? `Fatos confirmados pelo usuário: ${context.confirmed_memories.join("; ")}` : "",
      context.proposed_hypotheses?.length ? `Hipóteses ainda não confirmadas: ${context.proposed_hypotheses.join("; ")}` : "",
      context.effective_strategies?.length ? `Estratégias que o usuário testou e disse que ajudaram: ${context.effective_strategies.join("; ")}` : "",
      context.pending_strategies?.length ? `Experimentos ainda não avaliados: ${context.pending_strategies.join("; ")}` : "",
      context.meals?.length ? `Rotina de refeições: ${context.meals.join("; ")}` : "",
      context.recent_learnings?.length ? `Aprendizados relacionais recentes: ${context.recent_learnings.join("; ")}` : "",
      body.history?.length ? "Conversa recente:\n" + body.history.slice(-10).map((item) => `${item.from}: ${item.text}`).join("\n") : "",
    ].filter(Boolean).join("\n");
    const reply = await getProvider().generateStructuredResponse(
      {
        system: `${orchestratorPrompt(ctx)}\n\n${motivationalPrompt}\n\n${tccPrompt}\n\nRetorna reply com no máximo 3 frases curtas. Faz no máximo uma pergunta. quick_replies são opcionais e devem soar naturais. memory_updates geradas pela IA devem usar source=ai e validation_status=proposed, exceto quando repetirem literalmente uma informação direta do usuário. difficulty_capture.ready só pode ser true quando situação, principal influência e contexto já estiverem claros. strategy_plan.accepted_by_user só pode ser true após aceitação explícita.`,
        prompt: `Mensagem atual do usuário: ${JSON.stringify(message)}`,
        temperature: 0.55,
      },
      ChatReplySchema
    );
    return NextResponse.json({ ...reply, source: "ai", safety: { risk: safety.risk, level: safety.level, categories: safety.categories } });
  } catch (error) {
    console.warn("chat AI falhou:", (error as Error).message);
    return NextResponse.json({ ...localReply(message), source: "local", safety: { risk: safety.risk, level: safety.level, categories: safety.categories } });
  }
}

function localReply(message: string) {
  if (/fome|famint|sem comer/i.test(message)) return { reply: "A fome parece ter tido um peso real aqui. Antes de procurar outro motivo, quão intensa ela estava de 0 a 10?", quick_replies: ["Até 3", "Entre 4 e 6", "7 ou mais"] };
  if (/ansios|estress|cansad|triste|raiva/i.test(message)) return { reply: "Parece que esse estado deixou a escolha mais difícil. O que estava acontecendo logo antes?", quick_replies: ["Trabalho", "Em casa", "Discussão", "Não sei ainda"] };
  if (/consegui|deu certo|foi bem|ajudou/i.test(message)) return { reply: "Quero entender o que protegeu esse momento para podermos repetir. O que tu fez ou encontrou de diferente?" };
  if (/estraguei|fracass|desisti/i.test(message)) return { reply: "Uma escolha difícil parece ter virado uma conclusão sobre o dia inteiro. O que seria uma retomada possível, sem compensar?" };
  return { reply: "Entendi. O que mais influenciou esse momento: fome, o que estava acontecendo ao redor ou algo que tu sentiu?", quick_replies: ["Fome", "Situação ao redor", "Emoção", "Ainda não sei"] };
}

async function recordRisk(userId: string, conversationId: string | undefined, safety: ReturnType<typeof analyzeSafetyLocal>) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return false;
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = safety.categories.map((category) => ({
    user_id: userId, conversation_id: conversationId || null, message_id: null,
    category: category.category, severity: category.severity, evidence: category.evidence, status: "open",
  }));
  const { error } = await admin.from("risk_flags").insert(rows);
  if (!error && conversationId) await admin.from("conversations").update({ risk_level: safety.level }).eq("id", conversationId).eq("user_id", userId);
  return !error;
}
