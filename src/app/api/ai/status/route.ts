import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProvider, isLlmConfigured } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PingSchema = z.object({ ok: z.string() });

// Diagnóstico: a IA está ativa nesta implantação?
//   /api/ai/status         -> só confere a configuração (não gasta cota)
//   /api/ai/status?test=1  -> faz uma chamada real e mínima, e mostra o erro exato
// Nunca expõe a chave, apenas se ela chegou ao servidor.
export async function GET(req: NextRequest) {
  const provider = process.env.AI_PROVIDER || "local";
  const configured = isLlmConfigured();
  const base = {
    provider,
    model: process.env.AI_MODEL || "(padrão do provedor)",
    configured,
    chave_presente: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  };

  if (!configured) {
    return NextResponse.json({
      ...base,
      diagnostico:
        provider === "local"
          ? "AI_PROVIDER não foi definido (ou está como 'local'). Defina AI_PROVIDER=gemini e faça um novo deploy."
          : `AI_PROVIDER=${provider}, mas a chave correspondente não chegou ao servidor. Confira a variável e faça um novo deploy.`,
    });
  }

  if (req.nextUrl.searchParams.get("test") !== "1") {
    return NextResponse.json({
      ...base,
      diagnostico: `Configuração OK para ${provider}. Para testar a chamada de verdade, acesse este mesmo endereço com ?test=1`,
    });
  }

  // Chamada real e mínima, só para saber se a chave funciona de fato.
  const inicio = Date.now();
  try {
    await getProvider().generateStructuredResponse(
      {
        system: 'Responda exatamente {"ok":"sim"}.',
        prompt: "ping",
        temperature: 0,
      },
      PingSchema
    );
    return NextResponse.json({
      ...base,
      teste: "sucesso",
      latencia_ms: Date.now() - inicio,
      diagnostico: `A IA respondeu. As conversas devem soar naturais via ${provider}.`,
    });
  } catch (e) {
    const erro = (e as Error).message;
    return NextResponse.json({
      ...base,
      teste: "falhou",
      latencia_ms: Date.now() - inicio,
      erro,
      diagnostico: explicar(erro),
    });
  }
}

function explicar(erro: string): string {
  if (/\b404\b|not found|is not found for API version/i.test(erro))
    return "O modelo em AI_MODEL não existe para esta chave. Tente AI_MODEL=gemini-2.5-flash.";
  if (/\b400\b|API key not valid|API_KEY_INVALID/i.test(erro))
    return "A chave foi rejeitada. Gere outra em aistudio.google.com/apikey e atualize GEMINI_API_KEY.";
  if (/\b403\b|PERMISSION_DENIED|SERVICE_DISABLED/i.test(erro))
    return "Acesso negado: ative a Generative Language API no projeto do Google, ou remova restrições de referrer/IP da chave.";
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(erro))
    return "Cota esgotada. Aguarde alguns minutos ou ative faturamento no Google AI Studio.";
  if (/timeout|ETIMEDOUT|fetch failed/i.test(erro))
    return "A chamada não completou a tempo. Pode ser instabilidade momentânea — tente de novo.";
  return "A chamada falhou. O campo 'erro' acima traz a mensagem original do provedor.";
}
