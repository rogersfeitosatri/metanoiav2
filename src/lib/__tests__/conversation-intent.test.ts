import { describe, expect, it } from "vitest";
import {
  CONVERSATION_INTENT_CONFIG,
  LEGACY_CONVERSATION_ENTRIES,
  conversationHref,
  isExplicitConversationIntent,
  parseConversationIntent,
} from "../conversation-intent";

describe("intenções de entrada da conversa", () => {
  it("aceita somente intenções conhecidas", () => {
    expect(parseConversationIntent("help_now")).toBe("help_now");
    expect(parseConversationIntent("meal_checkin")).toBe("meal_checkin");
    expect(parseConversationIntent("desconhecida")).toBe("default");
    expect(parseConversationIntent(null)).toBe("default");
  });

  it("mantém uma única rota canônica", () => {
    expect(conversationHref("default")).toBe("/app/hoje");
    expect(conversationHref("register_event")).toBe("/app/hoje?intent=register_event");
    expect(Object.values(LEGACY_CONVERSATION_ENTRIES)).toEqual([
      "help_now",
      "register_event",
      "default",
    ]);
  });

  it("abre intenções explícitas como demandas próprias", () => {
    expect(isExplicitConversationIntent("default")).toBe(false);
    expect(isExplicitConversationIntent("prepare")).toBe(true);
    expect(CONVERSATION_INTENT_CONFIG.review_strategy.conversationType).toBe("strategy_review");
    expect(CONVERSATION_INTENT_CONFIG.meal_checkin.conversationType).toBe("checkin_followup");
  });
});
