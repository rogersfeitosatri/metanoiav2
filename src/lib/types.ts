// Tipos de domínio do Metanóia. Espelham o modelo de dados (seção 26 da especificação).

export type Role = "user" | "professional" | "admin";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  preferred_name: string;
  avatar_url?: string | null;
  email: string;
  phone?: string | null;
  timezone: string;
  professional_id?: string | null;
  access_enabled?: boolean;
  access_starts_at?: string | null;
  access_ends_at?: string | null;
  onboarding_completed: boolean;
  terms_version?: string | null;
  terms_accepted_at?: string | null;
  privacy_version?: string | null;
  privacy_accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Professional {
  id: string;
  profile_id: string;
  profession: "nutricionista" | "psicologo";
  registration_number: string;
  organization_name?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalUserLink {
  id: string;
  professional_id: string;
  user_id: string;
  started_at: string;
  ended_at?: string | null;
  active: boolean;
}

export type GoalType =
  | "seguir_plano"
  | "diminuir_impulso"
  | "ansiedade_comida"
  | "reduzir_perda_controle"
  | "organizacao"
  | "parar_de_desistir"
  | "outro";

export interface BehavioralGoal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Impacto de seguir o plano alimentar, por dimensão de vida.
// Ex.: { saude: "...", emocional: "...", social: "..." }
export type LifeImpacts = Record<string, string>;

export interface CopingCard {
  id: string;
  user_id: string;
  desired_identity?: string;
  main_goal?: string;
  why_it_matters?: string;
  future_difference?: string;
  cost_of_no_change?: string;
  life_impacts?: LifeImpacts;
  sabotaging_thoughts?: string[];
  reminder_statement?: string;
  personal_commitment?: string;
  completed_percentage: number;
  created_at: string;
  updated_at: string;
}

export type MealType =
  | "cafe_manha"
  | "lanche_manha"
  | "almoco"
  | "lanche_tarde"
  | "jantar"
  | "ceia"
  | "outra";

export type CheckinStatus = "completed" | "partial" | "not_completed";

export interface MealCheckin {
  id: string;
  user_id: string;
  episode_id?: string | null;
  schedule_id?: string | null;
  meal_type?: MealType | null;
  custom_meal_name?: string | null;
  status: CheckinStatus;
  occurred_at: string;
  note?: string | null;
  created_at: string;
}

export interface MealSchedule {
  id: string;
  user_id: string;
  name: string;
  meal_type?: MealType | null;
  time_of_day: string;
  days_of_week: number[];
  reminder_enabled: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type MemoryKind =
  | "fact"
  | "hypothesis"
  | "anchor"
  | "identity"
  | "protective_factor"
  | "pattern";

export interface UserMemory {
  id: string;
  user_id: string;
  memory_kind: MemoryKind;
  topic: string;
  content: string;
  source: "user" | "ai" | "system";
  validation_status: "confirmed" | "proposed" | "rejected";
  confidence: number;
  source_conversation_id?: string | null;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DifficultyEvent {
  id: string;
  user_id: string;
  episode_id?: string | null;
  checkin_id?: string | null;
  conversation_id?: string | null;
  occurred_at: string;
  primary_reason?: string | null;
  reasons: string[];
  context?: string | null;
  hunger_intensity?: number | null;
  urge_intensity?: number | null;
  emotional_intensity?: number | null;
  created_at: string;
}

// Como a pessoa lidou com o que aconteceu — é isto que o Metanoia mede,
// não se ela "seguiu a dieta".
export type RecoveryOutcome =
  | "retomou"              // continuou normalmente na próxima refeição
  | "retomou_depois"       // levou um tempo, mas retomou
  | "abandonou_dia"        // deixou aquilo virar o restante do dia
  | "compensou"            // pulou refeição, restringiu, exercício punitivo
  | "indefinido";

export interface ThoughtRecord {
  id: string;
  user_id: string;
  difficulty_event_id: string;
  situation?: string;
  automatic_thought?: string;
  emotions: string[];
  behavior?: string;
  consequences?: string;
  decision_point?: string;
  alternative_thought?: string;
  // --- v2: habilidades e desfecho ---
  /** A pessoa nomeou o pensamento sozinha (true) ou precisou de exemplos (false). */
  thought_self_identified?: boolean;
  /** A pessoa nomeou a emoção sozinha. */
  emotion_self_identified?: boolean;
  /** Fome percebida de 0 a 10 no momento (sinal corporal). */
  hunger_level?: number | null;
  /** Percebeu a fome antes de chegar ao limite. */
  noticed_hunger_early?: boolean;
  /** Presença de pensamento tudo-ou-nada ("já estraguei tudo"). */
  all_or_nothing?: boolean;
  /** Intensidade da culpa relatada, 0 a 10. */
  guilt_level?: number | null;
  /** Como a pessoa lidou depois. */
  recovery_outcome?: RecoveryOutcome;
  created_at: string;
}

// Acompanhamento de um pensamento alternativo: ele mudou o comportamento
// quando a situação parecida voltou a acontecer?
export type AltThoughtResult =
  | "pending"              // ainda não houve situação parecida
  | "helped_changed"       // pensou diferente e agiu diferente
  | "thought_only"         // pensou diferente, mas agiu como antes
  | "did_not_use"          // não lembrou de usar
  | "did_not_help";        // usou e não mudou nada

export interface AlternativeThought {
  id: string;
  user_id: string;
  thought_record_id?: string | null;
  /** O pensamento automático original. */
  original_thought: string;
  /** A resposta alternativa construída pela própria pessoa. */
  alternative: string;
  /** Quanto a pessoa acredita nela, 0 a 10 (no momento em que construiu). */
  belief_level?: number | null;
  result: AltThoughtResult;
  /** Quantas vezes essa resposta foi retomada em situações parecidas. */
  times_used: number;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationType =
  | "checkin_followup"
  | "immediate_help"
  | "prevention"
  | "onboarding"
  | "coping_card"
  | "open_chat"
  | "strategy_review";

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface Conversation {
  id: string;
  user_id: string;
  professional_id?: string | null;
  type: ConversationType;
  status: "open" | "closed";
  title: string;
  started_at: string;
  ended_at?: string | null;
  risk_level: RiskLevel;
  summary?: string | null;
  created_at: string;
  updated_at: string;
}

export type SenderType = "user" | "assistant" | "system" | "professional";

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  episode_id?: string | null;
  sender_type: SenderType;
  content: string;
  structured_content?: Record<string, unknown> | null;
  model_name?: string | null;
  prompt_version?: string | null;
  quick_replies?: string[] | null;
  created_at: string;
}

export type StrategyCategory =
  | "pausa"
  | "cognitiva"
  | "retorno"
  | "preparacao"
  | "fome"
  | "ambiente"
  | "apoio"
  | "planejamento";

export interface Strategy {
  id: string;
  title: string;
  description: string;
  category: StrategyCategory;
  instructions: string;
  source_type: "global" | "professional" | "user" | "ai";
  professional_id?: string | null;
  global: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type TrialResult =
  | "helped"
  | "partially_helped"
  | "did_not_help"
  | "not_tested"
  | "situation_not_occurred";

export interface StrategyTrial {
  id: string;
  user_id: string;
  episode_id?: string | null;
  strategy_id: string;
  difficulty_event_id?: string | null;
  planned_for?: string | null;
  tested_at?: string | null;
  result: TrialResult;
  user_feedback?: string | null;
  title_snapshot: string;
  created_at: string;
  updated_at: string;
}

export type EpisodeIntent =
  | "default"
  | "help_now"
  | "register_event"
  | "prepare"
  | "review_strategy"
  | "meal_checkin";

export type BehavioralEpisodeType =
  | "open"
  | "event"
  | "help_now"
  | "preparation"
  | "strategy_review"
  | "meal_checkin";

export type BehavioralEpisodeStatus =
  | "active"
  | "resolved"
  | "waiting_followup"
  | "abandoned";

export type EventTimePrecision =
  | "exact"
  | "approximate"
  | "date_only"
  | "relative"
  | "unknown";

// Uma situação específica trabalhada dentro do histórico visual de conversa.
export interface BehavioralEpisode {
  id: string;
  user_id: string;
  conversation_id: string;
  episode_type: BehavioralEpisodeType;
  entry_intent: EpisodeIntent;
  current_intent: EpisodeIntent;
  status: BehavioralEpisodeStatus;
  started_at: string;
  ended_at?: string | null;
  situation?: string | null;
  event_occurred_at?: string | null;
  event_time_description?: string | null;
  event_time_precision?: EventTimePrecision | null;
  current_stage?: string | null;
  awaiting_field?: string | null;
  conversation_state: Record<string, unknown>;
  result_summary?: string | null;
  followup_required: boolean;
  followup_reason?: string | null;
  followup_at?: string | null;
  related_meal_checkin_id?: string | null;
  related_strategy_trial_id?: string | null;
  related_difficulty_event_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatternSnapshot {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  pattern_type: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
  generated_at: string;
}

export interface ConsistencyScore {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  internal_score: number;
  trend: "up" | "stable" | "down";
  components: Record<string, number>;
  generated_at: string;
}

export interface WeeklyReport {
  id: string;
  user_id: string;
  professional_id?: string | null;
  period_start: string;
  period_end: string;
  report_data: Record<string, unknown>;
  user_summary: string;
  professional_summary: string;
  generated_at: string;
}

export type RiskCategory =
  | "perda_controle"
  | "compensacao"
  | "restricao_severa"
  | "culpa_intensa"
  | "vomito"
  | "laxante"
  | "medicamento"
  | "exercicio_compensatorio"
  | "sofrimento_emocional"
  | "autolesao"
  | "piora";

export type RiskStatus = "open" | "viewed" | "in_followup" | "resolved" | "false_positive";

export interface RiskFlag {
  id: string;
  user_id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  category: RiskCategory;
  severity: "low" | "medium" | "high";
  evidence: string;
  status: RiskStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  professional_note?: string | null;
  created_at: string;
}

export interface ProfessionalNote {
  id: string;
  professional_id: string;
  user_id: string;
  conversation_id?: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  enabled: boolean;
  allowed_days: number[]; // 0=domingo .. 6=sabado
  allowed_start_time: string; // "08:00"
  allowed_end_time: string; // "21:00"
  maximum_daily_notifications: number;
  preventive_enabled: boolean;
  checkin_enabled: boolean;
  support_times: string[]; // horários informados no onboarding
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledIntervention {
  id: string;
  user_id: string;
  meal_schedule_id?: string | null;
  intervention_type: "preventive" | "strategy_followup" | "coping_card" | "weekly_report";
  scheduled_for: string;
  status: "scheduled" | "sent" | "responded" | "cancelled";
  rule_source: string;
  payload: Record<string, unknown>;
  sent_at?: string | null;
  responded_at?: string | null;
  created_at: string;
}

export interface LegalDocument {
  id: string;
  type: "terms" | "privacy";
  version: string;
  content: string;
  active_from: string;
  active: boolean;
}

export interface LegalAcceptance {
  id: string;
  user_id: string;
  document_id: string;
  accepted_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Estado global do banco de demonstração (equivalente ao schema do Postgres).
export interface Database {
  profiles: Profile[];
  professionals: Professional[];
  professional_user_links: ProfessionalUserLink[];
  behavioral_goals: BehavioralGoal[];
  coping_cards: CopingCard[];
  meal_schedules: MealSchedule[];
  user_memories: UserMemory[];
  meal_checkins: MealCheckin[];
  difficulty_events: DifficultyEvent[];
  thought_records: ThoughtRecord[];
  alternative_thoughts: AlternativeThought[];
  conversations: Conversation[];
  behavioral_episodes: BehavioralEpisode[];
  conversation_messages: ConversationMessage[];
  strategies: Strategy[];
  strategy_trials: StrategyTrial[];
  pattern_snapshots: PatternSnapshot[];
  consistency_scores: ConsistencyScore[];
  weekly_reports: WeeklyReport[];
  risk_flags: RiskFlag[];
  professional_notes: ProfessionalNote[];
  notification_preferences: NotificationPreferences[];
  scheduled_interventions: ScheduledIntervention[];
  legal_documents: LegalDocument[];
  legal_acceptances: LegalAcceptance[];
  audit_logs: AuditLog[];
}
