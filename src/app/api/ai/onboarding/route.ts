import { NextRequest, NextResponse } from "next/server";
import { getProvider, isLlmConfigured } from "@/lib/ai/provider";
import { OnboardingTurnSchema } from "@/lib/ai/schemas";
import { analyzeSafetyLocal } from "@/lib/ai/safety";
import { onboardingSystemPrompt } from "@/prompts";

export const runtime = "nodejs";

/** Campos que a conversa de onboarding tenta preencher, nesta ordem. */
export type OnboardingField = "difference" | "pain" | "meaning" | "identity" | "anchor";

// Roteiro de segurança: é exatamente o que o app usava antes da IA.
// Se não houver chave, ou se a chamada falhar, o cadastro segue por aqui.
const FALLBACK: Record<OnboardingField, string> = {
  difference: "O que tu espera que mude na tua vida ao avançar nesse objetivo?",
  pain: "E hoje, o que mais pesa ou te cansa nessa relação com a alimentação?",
  meaning: "Se isso começasse a melhorar, o que ficaria diferente na tua vida, além do peso?",
  identity: "Quando o peso não estiver decidindo teu valor, quem tu quer ser no cuidado contigo?",
  anchor: "Quando vier um momento difícil, que frase tua poderia te lembrar desse Norte?",
};

// Quando a pessoa trava, reformulamos por outro caminho em vez de repetir igual.
const REPHRASE: Record<OnboardingField, string> = {
  difference: "Deixa eu tentar de outro jeito: imagina que já deu certo. O que estaria diferente num dia comum teu?",
  pain: "Pensa num dia recente em que isso te incomodou. O que aconteceu?",
  meaning: "Sem pensar em peso: o que tu ganharia com isso, no dia a dia?",
  identity: "Se um amigo teu descrevesse como tu cuida de ti daqui a um ano, o que tu queria que ele dissesse?",
  anchor: "Não precisa ser bonito. Que frase tu diria pra ti mesmo num momento difícil?",
};

interface Body {
  field: OnboardingField;
  lastMessage: string;
  answers: Record<string, string>;
  preferredName?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const field = body.field;
  const lastMessage = (body.lastMessage || "").slice(0, 1000);

  // Segurança antes de qualquer coisa, inclusive no cadastro.
  const safety = analyzeSafetyLocal(lastMessage);
  if (safety.safe_message) {
    return NextResponse.json({
      message: safety.safe_message,
      advance: true,
      source: "safety",
      safety: { risk: true, level: safety.level, categories: safety.categories },
    });
  }

  // "não sei" / "não entendi" tratados mesmo sem IA.
  const travou = /^\s*(n[ãa]o sei|sei l[áa]|n[ãa]o entendi|n[ãa]o faço ideia|sla)\b/i.test(lastMessage);

  if (!isLlmConfigured()) {
    return NextResponse.json({
      message: travou ? REPHRASE[field] : FALLBACK[field],
      advance: !travou,
      source: "local",
    });
  }

  try {
    const conhecido = Object.entries(body.answers || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const turn = await getProvider().generateStructuredResponse(
      {
        system: `${onboardingSystemPrompt({ step: 0, goal: body.answers?.goal })}

Tu está tentando entender este ponto agora: "${field}".
- difference: o que a pessoa espera que mude na vida dela
- pain: o que hoje pesa ou cansa nessa relação com a comida
- meaning: o que isso significa de verdade pra ela, além do peso
- identity: quem ela quer ser no cuidado consigo
- anchor: uma frase dela para os momentos difíceis

REGRAS DESTE TURNO
- Aproveita as PALAVRAS que a pessoa acabou de usar. Se ela falou "autoestima",
  pergunta sobre autoestima — não faça uma pergunta genérica.
- Se ela respondeu "não sei", "não entendi" ou algo vago, devolve advance=false e
  reformula por outro caminho (exemplo concreto, situação do dia a dia). Não repete a
  mesma pergunta.
- Se ela respondeu de forma útil, devolve advance=true e faz a pergunta do PRÓXIMO ponto.
- Uma pergunta só, no máximo 2 frases curtas.`,
        prompt: [
          conhecido ? `O que já sabemos:\n${conhecido}` : "",
          `A pessoa acabou de responder: "${lastMessage}"`,
          `Ponto que estamos explorando agora: ${field}`,
          `Pergunta padrão deste ponto (podes reescrever melhor, aproveitando as palavras dela): "${FALLBACK[field]}"`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        temperature: 0.7,
      },
      OnboardingTurnSchema
    );

    return NextResponse.json({ ...turn, source: "ai" });
  } catch (e) {
    console.warn("onboarding AI falhou, usando roteiro:", (e as Error).message);
    return NextResponse.json({
      message: travou ? REPHRASE[field] : FALLBACK[field],
      advance: !travou,
      source: "local",
    });
  }
}
