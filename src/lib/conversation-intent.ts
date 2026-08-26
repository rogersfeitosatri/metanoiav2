import type { ConversationType } from "./types";

export const CONVERSATION_INTENTS = [
  "default",
  "help_now",
  "register_event",
  "prepare",
  "review_strategy",
  "meal_checkin",
] as const;

export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];

export interface ConversationIntentConfig {
  conversationType: ConversationType;
  title: string;
}

export const CONVERSATION_INTENT_CONFIG: Record<ConversationIntent, ConversationIntentConfig> = {
  default: { conversationType: "open_chat", title: "Conversa com o Metanóia" },
  help_now: { conversationType: "immediate_help", title: "Ajuda imediata" },
  register_event: { conversationType: "checkin_followup", title: "Entender o que aconteceu" },
  prepare: { conversationType: "prevention", title: "Preparar uma situação" },
  review_strategy: { conversationType: "strategy_review", title: "Avaliar uma estratégia" },
  meal_checkin: { conversationType: "checkin_followup", title: "Check-in de refeição" },
};

export const LEGACY_CONVERSATION_ENTRIES = {
  "/app/ajuda": "help_now",
  "/app/registrar": "register_event",
  "/app/conversa": "default",
} as const satisfies Record<string, ConversationIntent>;

export function parseConversationIntent(value: string | null | undefined): ConversationIntent {
  return CONVERSATION_INTENTS.includes(value as ConversationIntent)
    ? (value as ConversationIntent)
    : "default";
}

export function conversationHref(intent: ConversationIntent): string {
  return intent === "default" ? "/app/hoje" : `/app/hoje?intent=${intent}`;
}

export function isExplicitConversationIntent(intent: ConversationIntent): boolean {
  return intent !== "default";
}
