import { z } from "zod";

// Todas as respostas estruturadas da IA são validadas por Zod antes de virar dado.
// Nunca salvar texto não validado diretamente como dado estruturado (seção 23.8).

export const RiskCategoryEnum = z.enum([
  "perda_controle",
  "compensacao",
  "restricao_severa",
  "culpa_intensa",
  "vomito",
  "laxante",
  "medicamento",
  "exercicio_compensatorio",
  "sofrimento_emocional",
  "autolesao",
  "piora",
]);

export const SafetyResultSchema = z.object({
  risk: z.boolean(),
  level: z.enum(["none", "low", "medium", "high"]),
  categories: z.array(
    z.object({
      category: RiskCategoryEnum,
      severity: z.enum(["low", "medium", "high"]),
      evidence: z.string(),
    })
  ),
  safe_message: z.string().nullable(),
});
export type SafetyResult = z.infer<typeof SafetyResultSchema>;

export const StrategySuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string(),
        category: z.enum([
          "pausa",
          "cognitiva",
          "retorno",
          "preparacao",
          "fome",
          "ambiente",
          "apoio",
          "planejamento",
        ]),
        description: z.string(),
      })
    )
    .min(1)
    .max(3),
});
export type StrategySuggestion = z.infer<typeof StrategySuggestionSchema>;

export const WeeklyReportSchema = z.object({
  user_summary: z.string(),
  professional_summary: z.string(),
  hardest_moments: z.array(z.string()),
  frequent_triggers: z.array(z.string()),
  recurring_thoughts: z.array(z.string()),
  predominant_emotions: z.array(z.string()),
  helpful_strategies: z.array(z.string()),
  next_experiment: z.string(),
});
export type WeeklyReportContent = z.infer<typeof WeeklyReportSchema>;

export const ConversationSummarySchema = z.object({
  title: z.string(),
  summary: z.string(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// Turno da conversa adaptativa: a IA escolhe a próxima pergunta útil,
// mas preenche exatamente os mesmos campos do motor determinístico.
export const AdaptiveTurnSchema = z.object({
  message: z.string().min(1).max(500),
  slot: z.enum([
    "situation",
    "hunger",
    "thought",
    "emotion",
    "behavior",
    "consequence",
    "recovery",
    "alternative",
    "belief",
    "strategy",
    "done",
  ]),
  quick_replies: z.array(z.string()).max(6).optional(),
  scale: z.boolean().optional(),
  closing: z.boolean().optional(),
});
export type AdaptiveTurn = z.infer<typeof AdaptiveTurnSchema>;

// Resposta conversacional livre (aberta), acolhedora e curta.
export const ChatReplySchema = z.object({
  reply: z.string(),
  quick_replies: z.array(z.string()).max(4).optional(),
  suggest_close: z.boolean().optional(),
  memory_updates: z.array(z.object({
    memory_kind: z.enum(["fact", "hypothesis", "anchor", "identity", "protective_factor", "pattern"]),
    topic: z.string(),
    content: z.string(),
    source: z.enum(["user", "ai", "system"]),
    validation_status: z.enum(["confirmed", "proposed", "rejected"]),
    confidence: z.number().min(0).max(1),
  })).max(3).optional(),
  difficulty_capture: z.object({
    ready: z.boolean(),
    reasons: z.array(z.string()).max(4),
    situation: z.string().optional(),
    automatic_thought: z.string().optional(),
    emotion: z.string().optional(),
    hunger_intensity: z.number().min(0).max(10).optional(),
    urge_intensity: z.number().min(0).max(10).optional(),
    emotional_intensity: z.number().min(0).max(10).optional(),
  }).optional(),
  strategy_plan: z.object({
    title: z.string(),
    accepted_by_user: z.boolean(),
  }).optional(),
});
export type ChatReply = z.infer<typeof ChatReplySchema>;
