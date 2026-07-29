import { NextRequest, NextResponse } from "next/server";
import { getProvider, isLlmConfigured } from "@/lib/ai/provider";
import { ChatReplySchema } from "@/lib/ai/schemas";
import { analyzeSafetyLocal } from "@/lib/ai/safety";
import { orchestratorPrompt, motivationalPrompt, tccPrompt } from "@/prompts";

export const runtime = "nodejs";

interface ChatBody {
  message: string;
  history?: { from: "user" | "assistant"; text: string }[];
  context?: { preferred_name?: string; coping_reminder?: string; effective_strategies?: string[] };
}

// Conversa livre e acolhedora. A camada de segurança roda ANTES da resposta.
export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const message = (body.message || "").slice(0, 2000);

  // 1) Segurança sempre primeiro.
  const safety = analyzeSafetyLocal(message);
  if (safety.safe_message) {
    return NextResponse.json({
      reply: safety.safe_message,
      safety: { risk: true, level: safety.level, categories: safety.categories },
      source: "safety",
    });
  }

  // 2) Sem LLM: resposta determinística acolhedora (mantém o produto funcional).
  if (!isLlmConfigured()) {
    return NextResponse.json({
      reply:
        "Entendi. Me conta um pouco mais do que está acontecendo — o que tu sentiu logo antes disso?",
      quick_replies: ["Estava com fome", "Estava ansioso", "Foi impulso", "Quero só desabafar"],
      source: "local",
      safety: { risk: safety.risk, level: safety.level, categories: safety.categories },
    });
  }

  // 3) Com LLM: orquestrador + Entrevista Motivacional + TCC.
  try {
    const provider = getProvider();
    const ctx = [
      body.context?.preferred_name ? `Nome: ${body.context.preferred_name}` : "",
      body.context?.coping_reminder ? `Frase de enfrentamento do usuário: "${body.context.coping_reminder}"` : "",
      body.context?.effective_strategies?.length
        ? `Estratégias que já ajudaram: ${body.context.effective_strategies.join("; ")}`
        : "",
      body.history?.length
        ? "Histórico recente:\n" + body.history.slice(-8).map((h) => `${h.from}: ${h.text}`).join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const reply = await provider.generateStructuredResponse(
      {
        system: `${orchestratorPrompt(ctx)}\n\n${motivationalPrompt}\n\n${tccPrompt}\n\nResponda com no máximo 2 frases curtas e, quando fizer sentido, até 4 respostas rápidas.`,
        prompt: `Mensagem do usuário: "${message}"`,
        temperature: 0.6,
      },
      ChatReplySchema
    );
    return NextResponse.json({
      ...reply,
      source: "ai",
      safety: { risk: safety.risk, level: safety.level, categories: safety.categories },
    });
  } catch (e) {
    console.warn("chat AI falhou, usando fallback:", (e as Error).message);
    return NextResponse.json({
      reply: "Estou aqui contigo. Me conta com tuas palavras o que está pesando agora.",
      source: "local",
      safety: { risk: safety.risk, level: safety.level, categories: safety.categories },
    });
  }
}
