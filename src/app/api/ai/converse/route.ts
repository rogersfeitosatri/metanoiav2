import { NextRequest, NextResponse } from "next/server";
import { getProvider, isLlmConfigured } from "@/lib/ai/provider";
import { AdaptiveTurnSchema } from "@/lib/ai/schemas";
import { analyzeSafetyLocal } from "@/lib/ai/safety";
import { nextTurn, type ConversationState, type Turn } from "@/lib/ai/conversation";
import { conversationSystemPrompt } from "@/prompts";

export const runtime = "nodejs";

interface Body {
  state: ConversationState;
  lastMessage: string;
  history?: { from: "user" | "assistant"; text: string }[];
  context?: { preferredName?: string; northReminder?: string; effectiveStrategies?: string[] };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const lastMessage = (body.lastMessage || "").slice(0, 2000);
  const state = body.state || { asked: [] };

  // 1) Segurança sempre antes de qualquer orientação comportamental.
  const safety = analyzeSafetyLocal(lastMessage);
  if (safety.safe_message) {
    return NextResponse.json({
      turn: { message: safety.safe_message, slot: "done", closing: true } satisfies Turn,
      safety: { risk: true, level: safety.level, categories: safety.categories },
      source: "safety",
    });
  }

  // 2) Caminho determinístico (sempre disponível) — também é o fallback.
  const local = nextTurn(state, lastMessage);

  if (!isLlmConfigured()) {
    return NextResponse.json({
      turn: local,
      safety: { risk: safety.risk, level: safety.level, categories: safety.categories },
      source: "local",
    });
  }

  // 3) Com LLM: mesma decisão de campo, redação mais natural e adaptada ao relato.
  try {
    const provider = getProvider();
    const known = Object.entries(state)
      .filter(([k, v]) => k !== "asked" && v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");

    const historico = (body.history || [])
      .slice(-10)
      .map((h) => `${h.from === "user" ? "Pessoa" : "Tu"}: ${h.text}`)
      .join("\n");

    const turn = await provider.generateStructuredResponse(
      {
        system: conversationSystemPrompt({
          preferredName: body.context?.preferredName,
          northReminder: body.context?.northReminder,
          effectiveStrategies: body.context?.effectiveStrategies,
        }),
        prompt: [
          `O que já sabemos desta situação:\n${known || "(nada ainda)"}`,
          `Campos já perguntados: ${(state.asked || []).join(", ") || "(nenhum)"}`,
          historico ? `Conversa até aqui:\n${historico}` : "",
          `Última mensagem da pessoa: "${lastMessage}"`,
          `Sugestão do motor interno (podes discordar se houver uma pergunta mais útil): slot="${local.slot}", mensagem="${local.message}"`,
          `Responda com o próximo turno: qual campo (slot) tu quer preencher agora e a pergunta em no máximo 2 frases curtas.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        temperature: 0.7,
      },
      AdaptiveTurnSchema
    );

    return NextResponse.json({
      turn: {
        message: turn.message,
        slot: turn.slot,
        quickReplies: turn.quick_replies,
        scale: turn.scale ?? local.scale,
        closing: turn.closing,
      } satisfies Turn,
      safety: { risk: safety.risk, level: safety.level, categories: safety.categories },
      source: "ai",
    });
  } catch (e) {
    console.warn("converse: IA falhou, usando motor local:", (e as Error).message);
    return NextResponse.json({
      turn: local,
      safety: { risk: safety.risk, level: safety.level, categories: safety.categories },
      source: "local",
    });
  }
}
