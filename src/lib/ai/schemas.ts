import { z } from "zod";
import { CONVERSATION_INTENTS } from "../conversation-intent";

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

// Turno do onboarding conduzido por IA: a próxima pergunta nasce do que a pessoa
// acabou de dizer. advance=false quando ela respondeu "não sei" / "não entendi" e
// precisamos reformular a MESMA pergunta por outro caminho.
export const OnboardingTurnSchema = z.object({
  message: z.string().min(1).max(400),
  advance: z.boolean(),
  quick_replies: z.array(z.string()).max(4).optional(),
});
export type OnboardingTurn = z.infer<typeof OnboardingTurnSchema>;

export const ConversationIntentSchema = z.enum(CONVERSATION_INTENTS);

export const ConversationStageSchema = z.enum([
  "situation",
  "context",
  "hunger",
  "physical_context",
  "thought",
  "emotion",
  "behavior",
  "consequence",
  "immediate_consequence",
  "later_consequence",
  "recovery",
  "decision_point",
  "cognitive_effect",
  "cognitive_examine",
  "cognitive_perspective",
  "alternative",
  "alternative_personalize",
  "alternative_belief",
  "alternative_refine",
  "strategy",
  "prepare_situation",
  "prepare_obstacle",
  "prepare_action",
  "strategy_review",
  "meal_selection",
  "meal_status",
  "meal_success",
  "meal_difficulty_consent",
  "done",
]);
export type ConversationStage = z.infer<typeof ConversationStageSchema>;

export const RecoveryOutcomeSchema = z.enum([
  "retomou",
  "retomou_depois",
  "abandonou_dia",
  "compensou",
  "indefinido",
]);

export const BehavioralFactorSchema = z.enum([
  "physical",
  "practical",
  "emotional",
  "cognitive",
  "social",
  "mixed",
  "unknown",
]);

export const CognitiveStageSchema = z.enum([
  "identifying",
  "examining_effect",
  "examining_evidence",
  "seeking_perspective",
  "building_alternative",
  "checking_belief",
  "refining_alternative",
  "completed",
]);

export const BehavioralEvidenceSchema = z.object({
  field: z.enum([
    "situation",
    "context",
    "physical_state",
    "hunger",
    "satiety",
    "automatic_thought",
    "emotion",
    "urge",
    "behavior",
    "immediate_consequence",
    "later_consequence",
    "recovery",
    "compensation",
    "decision_point",
    "main_factor",
  ]),
  value: z.string().min(1).max(1200),
  evidence: z.string().min(1).max(1200),
  source: z.enum(["user", "ai", "system"]),
  status: z.enum(["reported", "proposed", "confirmed"]),
  confidence: z.number().min(0).max(1),
});
export type BehavioralEvidence = z.infer<typeof BehavioralEvidenceSchema>;

export const ConversationEngineStateSchema = z.object({
  intent: ConversationIntentSchema,
  stage: ConversationStageSchema,
  asked: z.array(ConversationStageSchema).max(40).default([]),
  situation: z.string().max(2000).optional(),
  context_tags: z.array(z.string().max(120)).max(16).default([]),
  hunger_level: z.number().min(0).max(10).nullable().optional(),
  satiety_level: z.number().min(0).max(10).nullable().optional(),
  noticed_hunger_early: z.boolean().optional(),
  physical_context: z.string().max(1000).optional(),
  physical_state: z.array(z.string().max(160)).max(16).default([]),
  urge: z.string().max(1000).optional(),
  urge_intensity: z.number().min(0).max(10).nullable().optional(),
  automatic_thought: z.string().max(1000).optional(),
  thought_self_identified: z.boolean().optional(),
  emotion: z.string().max(500).optional(),
  emotions: z.array(z.string().max(160)).max(12).default([]),
  emotion_intensity: z.number().min(0).max(10).nullable().optional(),
  emotion_self_identified: z.boolean().optional(),
  behavior: z.string().max(1000).optional(),
  consequence: z.string().max(1000).optional(),
  immediate_consequence: z.string().max(1000).optional(),
  later_consequence: z.string().max(1000).optional(),
  recovery_outcome: RecoveryOutcomeSchema.optional(),
  compensatory_behavior: z.string().max(1000).optional(),
  decision_point: z.string().max(1000).optional(),
  main_influencing_factor: BehavioralFactorSchema.optional(),
  context_recurrence: z.enum(["recurring", "exception", "unknown"]).optional(),
  captured_evidence: z.array(BehavioralEvidenceSchema).max(60).default([]),
  all_or_nothing: z.boolean().optional(),
  guilt_level: z.number().min(0).max(10).nullable().optional(),
  cognitive_stage: CognitiveStageSchema.optional(),
  thought_effect: z.string().max(1000).optional(),
  cognitive_examination: z.string().max(1000).optional(),
  cognitive_perspective: z.string().max(1000).optional(),
  alternative: z.string().max(1000).optional(),
  alternative_from_suggestion: z.boolean().optional(),
  alternative_doubt: z.string().max(1000).optional(),
  alternative_recorded: z.boolean().default(false),
  belief_level: z.number().min(0).max(10).nullable().optional(),
  strategy: z.string().max(1000).optional(),
  preparation_obstacle: z.string().max(1000).optional(),
  meal_schedule_id: z.string().max(200).nullable().optional(),
  meal_name: z.string().max(200).optional(),
  meal_status: z.enum(["completed", "partial", "not_completed"]).optional(),
  pending_strategy_id: z.string().max(200).optional(),
  pending_strategy_title: z.string().max(500).optional(),
  strategy_review_result: z.enum([
    "helped",
    "partially_helped",
    "did_not_help",
    "not_tested",
  ]).optional(),
  clarification_count: z.number().int().min(0).max(10).default(0),
  unknown_count: z.number().int().min(0).max(10).default(0),
  difficulty_recorded: z.boolean().default(false),
  strategy_recorded: z.boolean().default(false),
  checkin_recorded: z.boolean().default(false),
  active_checkin_id: z.string().max(200).optional(),
  last_question: z.string().max(600).optional(),
});
export type ConversationEngineState = z.infer<typeof ConversationEngineStateSchema>;

export const ConversationCapturedDataSchema = z.object({
  reasons: z.array(z.string().max(300)).max(4).optional(),
  situation: z.string().max(2000).optional(),
  context: z.array(z.string().max(120)).max(16).optional(),
  physical_context: z.string().max(1000).optional(),
  physical_state: z.array(z.string().max(160)).max(16).optional(),
  automatic_thought: z.string().max(1000).optional(),
  emotion: z.string().max(500).optional(),
  emotions: z.array(z.string().max(160)).max(12).optional(),
  behavior: z.string().max(1000).optional(),
  consequences: z.string().max(1000).optional(),
  immediate_consequence: z.string().max(1000).optional(),
  later_consequence: z.string().max(1000).optional(),
  decision_point: z.string().max(1000).optional(),
  compensatory_behavior: z.string().max(1000).optional(),
  urge: z.string().max(1000).optional(),
  hunger_intensity: z.number().min(0).max(10).optional(),
  satiety_intensity: z.number().min(0).max(10).optional(),
  urge_intensity: z.number().min(0).max(10).optional(),
  emotional_intensity: z.number().min(0).max(10).optional(),
  recovery_outcome: RecoveryOutcomeSchema.optional(),
  main_influencing_factor: BehavioralFactorSchema.optional(),
  all_or_nothing: z.boolean().optional(),
  thought_self_identified: z.boolean().optional(),
  emotion_self_identified: z.boolean().optional(),
  thought_effect: z.string().max(1000).optional(),
  cognitive_stage: CognitiveStageSchema.optional(),
  alternative_thought: z.string().max(1000).optional(),
  belief_level: z.number().min(0).max(10).optional(),
  evidence: z.array(BehavioralEvidenceSchema).max(20).optional(),
});
export type ConversationCapturedData = z.infer<typeof ConversationCapturedDataSchema>;

export const ConversationMemoryUpdateSchema = z.object({
  memory_kind: z.enum(["fact", "hypothesis", "anchor", "identity", "protective_factor", "pattern"]),
  topic: z.string().min(1).max(200),
  content: z.string().min(1).max(800),
  source: z.enum(["user", "ai", "system"]),
  validation_status: z.enum(["confirmed", "proposed", "rejected"]),
  confidence: z.number().min(0).max(1),
});

export const ConversationStrategyProposalSchema = z.object({
  title: z.string().min(1).max(300),
  accepted_by_user: z.boolean().default(false),
});

// Este é o único contrato produzido tanto pelos provedores quanto pelo fallback.
// Nenhum campo desta estrutura grava dados diretamente.
export const ConversationDecisionSchema = z.object({
  reply: z.string().min(1).max(600),
  quick_replies: z.array(z.string().min(1).max(160)).max(6).default([]),
  next_stage: ConversationStageSchema,
  response_kind: z.enum(["question", "reflection", "guidance", "closing"]).default("question"),
  needs_clarification: z.boolean().default(false),
  captured_data: ConversationCapturedDataSchema.optional(),
  memory_updates: z.array(ConversationMemoryUpdateSchema).max(3).default([]),
  strategy_proposal: ConversationStrategyProposalSchema.optional(),
  suggest_close: z.boolean().default(false),
});
export type ConversationDecision = z.infer<typeof ConversationDecisionSchema>;

export const ConversationHistoryItemSchema = z.object({
  from: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

export const ConversationContextSchema = z.object({
  preferred_name: z.string().max(120).optional(),
  north: z.array(z.string().max(800)).max(8).default([]),
  confirmed_memories: z.array(z.string().max(800)).max(20).default([]),
  proposed_hypotheses: z.array(z.string().max(800)).max(12).default([]),
  effective_strategies: z.array(z.string().max(500)).max(12).default([]),
  pending_strategies: z.array(z.object({
    id: z.string().max(200),
    title: z.string().max(500),
  })).max(12).default([]),
  meals: z.array(z.object({
    id: z.string().max(200),
    name: z.string().max(200),
    time: z.string().max(20),
    due: z.boolean().default(false),
  })).max(20).default([]),
  recent_learnings: z.array(z.string().max(800)).max(12).default([]),
}).default({});
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const ConversationRequestSchema = z.object({
  operation: z.enum(["start", "message"]).default("message"),
  message: z.string().max(2000).optional(),
  conversation_id: z.string().max(200).optional(),
  intent: ConversationIntentSchema.default("default"),
  state: ConversationEngineStateSchema.optional(),
  history: z.array(ConversationHistoryItemSchema).max(20).default([]),
  context: ConversationContextSchema,
});
export type ConversationRequest = z.infer<typeof ConversationRequestSchema>;

export const ConversationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("record_difficulty"),
    data: ConversationCapturedDataSchema,
  }),
  z.object({
    type: z.literal("create_meal_checkin"),
    schedule_id: z.string().max(200).nullable(),
    meal_name: z.string().max(200).nullable(),
    status: z.enum(["completed", "partial", "not_completed"]),
  }),
  z.object({
    type: z.literal("save_memory"),
    memory: ConversationMemoryUpdateSchema,
  }),
  z.object({
    type: z.literal("create_strategy_trial"),
    title: z.string().min(1).max(300),
  }),
  z.object({
    type: z.literal("upsert_alternative_thought"),
    original_thought: z.string().min(1).max(1000),
    alternative: z.string().min(1).max(1000),
    belief_level: z.number().min(0).max(10),
  }),
  z.object({
    type: z.literal("update_strategy_trial"),
    strategy_trial_id: z.string().max(200),
    result: z.enum(["helped", "partially_helped", "did_not_help"]),
    feedback: z.string().max(1000),
    title: z.string().max(500),
  }),
]);
export type ConversationAction = z.infer<typeof ConversationActionSchema>;

export const ConversationSafetyMetaSchema = z.object({
  risk: z.boolean(),
  level: z.enum(["none", "low", "medium", "high"]),
  categories: z.array(z.object({
    category: RiskCategoryEnum,
    severity: z.enum(["low", "medium", "high"]),
    evidence: z.string(),
  })),
  alert_recorded: z.boolean().default(false),
  interrupted: z.boolean().default(false),
});

export const ConversationEngineResponseSchema = ConversationDecisionSchema.extend({
  state: ConversationEngineStateSchema,
  actions: z.array(ConversationActionSchema).max(6).default([]),
  source: z.enum(["ai", "local", "safety"]),
  provider: z.string().max(80).nullable().default(null),
  safety: ConversationSafetyMetaSchema,
});
export type ConversationEngineResponse = z.infer<typeof ConversationEngineResponseSchema>;
