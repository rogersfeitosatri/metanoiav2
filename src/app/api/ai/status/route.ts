import { NextResponse } from "next/server";
import { isLlmConfigured } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico simples: a IA está ativa nesta implantação?
// Não expõe a chave — só se ela existe, para não precisar abrir o DevTools.
export async function GET() {
  const provider = process.env.AI_PROVIDER || "local";
  const configured = isLlmConfigured();

  return NextResponse.json({
    provider,
    model: process.env.AI_MODEL || "(padrão do provedor)",
    configured,
    chave_presente: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    diagnostico: configured
      ? `IA ativa via ${provider}. As conversas devem soar naturais.`
      : provider === "local"
        ? "AI_PROVIDER não foi definido (ou está como 'local'). Defina AI_PROVIDER=gemini e faça um novo deploy."
        : `AI_PROVIDER=${provider}, mas a chave correspondente não chegou ao servidor. Confira a variável de ambiente e faça um novo deploy.`,
  });
}
