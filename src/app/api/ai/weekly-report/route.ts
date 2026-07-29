import { NextRequest, NextResponse } from "next/server";
import { getProvider, isLlmConfigured } from "@/lib/ai/provider";
import { WeeklyReportSchema } from "@/lib/ai/schemas";
import { buildWeeklyReport } from "@/lib/reports";
import { weeklyReportPrompt } from "@/prompts";
import type { PatternSummary } from "@/lib/patterns";

export const runtime = "nodejs";

// Gera o relatório semanal. Usa a IA (OpenAI/Anthropic) quando configurada,
// com fallback determinístico. Sempre valida a saída com Zod.
export async function POST(req: NextRequest) {
  let patterns: PatternSummary;
  try {
    patterns = (await req.json()).patterns as PatternSummary;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const fallback = buildWeeklyReport(patterns);
  if (!isLlmConfigured()) {
    return NextResponse.json({ report: fallback, source: "local" });
  }

  try {
    const provider = getProvider();
    const report = await provider.generateStructuredResponse(
      {
        system:
          "Tu és o módulo de relatórios do Metanóia. Linguagem simples, humana e acolhedora, tratando o usuário por 'tu'. NUNCA use linguagem de fracasso (falhou, adesão ruim, regrediu). Enquadra dificuldades como pontos de atenção. Uma escolha isolada não define a semana.",
        prompt: weeklyReportPrompt(JSON.stringify(patterns)),
        temperature: 0.4,
      },
      WeeklyReportSchema
    );
    return NextResponse.json({ report, source: "ai" });
  } catch (e) {
    console.warn("weekly-report AI falhou, usando fallback:", (e as Error).message);
    return NextResponse.json({ report: fallback, source: "local" });
  }
}
