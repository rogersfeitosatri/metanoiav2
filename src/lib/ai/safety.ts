import { SafetyResult, SafetyResultSchema } from "./schemas";
import type { RiskCategory } from "../types";

// Camada de segurança (seção 23.2). Analisa toda mensagem antes da resposta principal.
// Implementação determinística baseada em sinais léxicos, validada por Zod.
// Em produção, o AI_SAFETY_MODEL pode substituir esta função pela mesma interface.

interface Signal {
  category: RiskCategory;
  severity: "low" | "medium" | "high";
  patterns: RegExp[];
  message: string;
}

const SIGNALS: Signal[] = [
  {
    category: "autolesao",
    severity: "high",
    patterns: [
      /me matar|suic[ií]dio|n[ãa]o quero (mais )?viver|acabar com tudo|me cortar|me machucar|tirar minha vida/i,
    ],
    message:
      "O que tu está sentindo é sério e importa. Se houver risco à tua segurança agora, procura o CVV pelo 188 (ligação gratuita, 24h) ou o serviço de emergência 192. Também é importante contatar agora uma pessoa de confiança ou o profissional que te acompanha.",
  },
  {
    category: "vomito",
    severity: "high",
    patterns: [/vomit|coloquei (tudo )?para fora|botei para fora|provoquei v[ôo]mito/i],
    message:
      "Obrigado por confiar isso aqui. Provocar vômito pode trazer riscos à saúde. É importante procurar o profissional que te acompanha e, se houver mal-estar intenso ou risco imediato, um serviço de urgência.",
  },
  {
    category: "laxante",
    severity: "high",
    patterns: [/laxante|lax[ea]/i],
    message:
      "O uso de laxantes para compensar traz riscos importantes. Vale conversar com o profissional que te acompanha para pensar em um caminho mais seguro.",
  },
  {
    category: "medicamento",
    severity: "medium",
    patterns: [/rem[ée]dio para (n[ãa]o comer|emagrecer)|tomei (v[áa]rios )?comprimidos|abusei do rem[ée]dio/i],
    message:
      "Tu mencionou o uso de medicamentos de um jeito que merece atenção. Isso é importante conversar com o profissional que te acompanha.",
  },
  {
    category: "restricao_severa",
    severity: "medium",
    patterns: [
      /fiquei (o dia|dois dias|24h|48h) sem comer|jejum (punitivo|de castigo)|passei fome de prop[óo]sito|n[ãa]o comi nada (o dia|hoje)|n[ãa]o vou (?:comer|jantar|almo[cç]ar) (?:para|pra) compensar|amanh[ãa] n[ãa]o (?:como|janto|almo[cç]o)/i,
    ],
    message:
      "Entendi. Ficar longos períodos sem comer como forma de compensar costuma tornar os momentos difíceis ainda mais intensos depois. Isso é algo para olhar junto com o profissional que te acompanha.",
  },
  {
    category: "exercicio_compensatorio",
    severity: "medium",
    patterns: [/treinar para compensar|malhar para queimar o que comi|exerc[íi]cio para compensar/i],
    message:
      "Percebi que o exercício apareceu como forma de compensar o que comeu. Isso vale conversar com o profissional que te acompanha, para que ele fique mais leve e não vire punição.",
  },
  {
    category: "perda_controle",
    severity: "low",
    patterns: [/perdi o controle|n[ãa]o consegui parar de comer|comi sem parar|descontrole/i],
    message: null as unknown as string,
  },
  {
    category: "culpa_intensa",
    severity: "low",
    patterns: [/me odeio|sou um fracasso|nojo de mim|culpa horr[íi]vel|me sinto p[ée]ssimo comigo/i],
    message: null as unknown as string,
  },
];

const LEVEL_ORDER: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

export function analyzeSafetyLocal(text: string): SafetyResult {
  const categories: SafetyResult["categories"] = [];
  let maxLevel: SafetyResult["level"] = "none";
  let safeMessage: string | null = null;

  for (const signal of SIGNALS) {
    if (signal.patterns.some((p) => p.test(text))) {
      categories.push({
        category: signal.category,
        severity: signal.severity,
        evidence: text.slice(0, 280),
      });
      if (LEVEL_ORDER[signal.severity] > LEVEL_ORDER[maxLevel]) {
        maxLevel = signal.severity;
      }
      // A mensagem de segurança de maior gravidade prevalece.
      if (signal.message && LEVEL_ORDER[signal.severity] >= LEVEL_ORDER[maxLevel]) {
        safeMessage = signal.message;
      }
    }
  }

  const result: SafetyResult = {
    risk: categories.length > 0,
    level: maxLevel,
    categories,
    safe_message: maxLevel === "medium" || maxLevel === "high" ? safeMessage : null,
  };

  // Valida antes de retornar — jamais confiar em estrutura não validada.
  return SafetyResultSchema.parse(result);
}
