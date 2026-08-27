"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TypingDots } from "@/components/ui";
import {
  CONVERSATION_INTENT_CONFIG,
  isExplicitConversationIntent,
  parseConversationIntent,
} from "@/lib/conversation-intent";
import {
  ConversationEngineResponseSchema,
  ConversationEngineStateSchema,
  type ConversationAction,
  type ConversationContext,
  type ConversationEngineState,
} from "@/lib/ai/schemas";
import { useStore } from "@/lib/store";
import type { Conversation, ConversationMessage, MealSchedule } from "@/lib/types";

type Bubble = {
  id: string;
  from: "assistant" | "user" | "safety";
  text: string;
};

export function ConversationHome() {
  const store = useStore();
  const searchParams = useSearchParams();
  const intent = parseConversationIntent(searchParams.get("intent"));
  const userId = store.currentUserId!;
  const profile = store.currentProfile!;
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedEntryRef = useRef<string | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const engineStateRef = useRef<ConversationEngineState | null>(null);
  const activeCheckinRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const entryKey = `${userId}:${intent}`;
    if (initializedEntryRef.current === entryKey) return;
    initializedEntryRef.current = entryKey;

    conversationRef.current = null;
    engineStateRef.current = null;
    activeCheckinRef.current = null;
    setBubbles([]);
    setQuickReplies([]);
    setDraft("");
    setTyping(false);
    setError(null);

    const config = CONVERSATION_INTENT_CONFIG[intent];
    const explicitIntent = isExplicitConversationIntent(intent);
    const existing = explicitIntent
      ? undefined
      : store.db.conversations
          .filter(
            (item) =>
              item.user_id === userId &&
              item.type === "open_chat" &&
              item.status === "open"
          )
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )[0];
    const conversation =
      existing ||
      store.createConversation(userId, config.conversationType, config.title);
    conversationRef.current = conversation;

    const existingMessages = store.db.conversation_messages.filter(
      (item) => item.conversation_id === conversation.id
    );
    if (existingMessages.length) {
      setBubbles(existingMessages.map(toBubble));
      const stateMessage = existingMessages
        .slice()
        .reverse()
        .find((message) => message.structured_content?.engine_state);
      const parsedState = ConversationEngineStateSchema.safeParse(
        stateMessage?.structured_content?.engine_state
      );
      if (parsedState.success) {
        engineStateRef.current = parsedState.data;
        activeCheckinRef.current = parsedState.data.active_checkin_id || null;
      }
      const last = existingMessages.at(-1);
      setQuickReplies(
        last?.sender_type === "assistant" ? last.quick_replies || [] : []
      );
      if (parsedState.success) return;
    }

    void requestEngine("start", undefined, existingMessages.map(toBubble));
    // O motor recebe toda dependência variável no contexto do request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, typing]);

  function persist(
    sender: "assistant" | "user",
    text: string,
    replies: string[] = [],
    structured: Record<string, unknown> | null = null,
    displayFrom: Bubble["from"] = sender
  ) {
    const id = crypto.randomUUID();
    setBubbles((current) => [...current, { id, from: displayFrom, text }]);
    if (conversationRef.current) {
      store.addMessage({
        conversation_id: conversationRef.current.id,
        sender_type: sender,
        content: text,
        structured_content: structured,
        quick_replies: replies.length ? replies : null,
      });
    }
  }

  async function send(value = draft) {
    const text = value.trim();
    if (!text || typing) return;
    const history = [...bubbles, { id: "pending", from: "user" as const, text }];
    persist("user", text);
    setDraft("");
    setQuickReplies([]);
    setError(null);
    await requestEngine("message", text, history);
  }

  async function requestEngine(
    operation: "start" | "message",
    message?: string,
    history: Bubble[] = bubbles
  ) {
    setTyping(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation,
          message,
          conversation_id: conversationRef.current?.id,
          intent,
          state: engineStateRef.current || undefined,
          history: history.slice(-20).map((item) => ({
            from: item.from === "user" ? "user" : "assistant",
            text: item.text,
          })),
          context: buildContext(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof json?.error === "string"
            ? json.error
            : "Não consegui continuar a conversa agora."
        );
      }
      const parsed = ConversationEngineResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("A resposta chegou incompleta. Tenta novamente.");
      }
      const data = parsed.data;
      engineStateRef.current = data.state;
      applyActions(data.actions);
      persist(
        "assistant",
        data.reply,
        data.quick_replies,
        {
          engine_state: data.state,
          source: data.source,
          provider: data.provider,
          safety: data.safety,
          action_types: data.actions.map((action) => action.type),
        },
        data.source === "safety" ? "safety" : "assistant"
      );
      setQuickReplies(data.quick_replies);
    } catch (caught) {
      const technical =
        caught instanceof Error &&
        /fetch|network|json|unexpected token|load failed/i.test(caught.message);
      const messageText =
        caught instanceof Error && !technical
          ? caught.message
          : "Não consegui falar com o servidor agora. Tenta de novo em alguns instantes.";
      setError(messageText);
    } finally {
      setTyping(false);
    }
  }

  function applyActions(actions: ConversationAction[]) {
    for (const action of actions) {
      if (action.type === "create_meal_checkin") {
        const checkin = store.addCheckin({
          user_id: userId,
          schedule_id: action.schedule_id,
          custom_meal_name: action.meal_name,
          status: action.status,
        });
        activeCheckinRef.current = checkin.id;
        if (engineStateRef.current) {
          engineStateRef.current.active_checkin_id = checkin.id;
        }
      } else if (action.type === "record_difficulty") {
        store.recordDifficulty(
          userId,
          action.data,
          conversationRef.current?.id,
          activeCheckinRef.current ||
            engineStateRef.current?.active_checkin_id ||
            undefined
        );
      } else if (action.type === "save_memory") {
        store.saveMemory({
          ...action.memory,
          source_conversation_id: conversationRef.current?.id || null,
        });
      } else if (action.type === "create_strategy_trial") {
        store.addStrategyTrial({
          user_id: userId,
          title_snapshot: action.title,
          result: "not_tested",
          planned_for: new Date(Date.now() + 86400000).toISOString(),
        });
      } else if (action.type === "update_strategy_trial") {
        store.updateStrategyTrial(action.strategy_trial_id, {
          result: action.result,
          tested_at: new Date().toISOString(),
          user_feedback: action.feedback,
        });
      }
    }
  }

  function buildContext(): ConversationContext {
    const card = store.db.coping_cards.find((item) => item.user_id === userId);
    const memories = store.db.user_memories.filter(
      (item) => item.user_id === userId
    );
    const trials = store.db.strategy_trials.filter(
      (item) => item.user_id === userId
    );
    const schedules = store.db.meal_schedules.filter(
      (item) => item.user_id === userId && item.active
    );
    const dueMeal = findRelevantMeal(schedules);
    return {
      preferred_name: profile.preferred_name,
      north: [
        card?.main_goal,
        card?.why_it_matters,
        card?.desired_identity,
        card?.reminder_statement,
      ].filter((value): value is string => Boolean(value)),
      confirmed_memories: memories
        .filter((item) => item.validation_status === "confirmed")
        .slice(0, 20)
        .map((item) => item.content),
      proposed_hypotheses: memories
        .filter((item) => item.validation_status === "proposed")
        .slice(0, 12)
        .map((item) => item.content),
      effective_strategies: trials
        .filter(
          (item) =>
            item.result === "helped" || item.result === "partially_helped"
        )
        .slice(0, 12)
        .map((item) => item.title_snapshot),
      pending_strategies: trials
        .filter((item) => item.result === "not_tested")
        .slice(0, 12)
        .map((item) => ({ id: item.id, title: item.title_snapshot })),
      meals: schedules.map((item) => ({
        id: item.id,
        name: item.name,
        time: item.time_of_day.slice(0, 5),
        due: item.id === dueMeal?.id,
      })),
      recent_learnings: [],
    };
  }

  return (
    <section className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] flex-col md:h-[calc(100dvh-4rem)]">
      <header className="border-b border-warmgray-100 pb-3">
        <h1 className="font-semibold text-sage-800">Metanóia</h1>
        <p className="text-xs text-warmgray-500">Uma pergunta de cada vez</p>
      </header>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-5">
        {bubbles.map((bubble) => (
          <div
            key={bubble.id}
            className={`flex ${bubble.from === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={
                bubble.from === "user"
                  ? "chat-bubble-user"
                  : bubble.from === "safety"
                    ? "max-w-[86%] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-warmgray-700"
                    : "chat-bubble-assistant"
              }
            >
              {bubble.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="chat-bubble-assistant w-fit">
            <TypingDots />
          </div>
        )}
      </div>
      <div className="border-t border-warmgray-100 bg-sand-50 pt-3">
        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {quickReplies.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {quickReplies.map((reply) => (
              <button key={reply} className="chip" onClick={() => void send(reply)}>
                {reply}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Mensagem"
            rows={1}
            className="input max-h-32 resize-none"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreve do teu jeito..."
          />
          <button
            className="btn-primary self-end"
            type="submit"
            disabled={!draft.trim() || typing}
          >
            Enviar
          </button>
        </form>
      </div>
    </section>
  );
}

function toBubble(message: ConversationMessage): Bubble {
  return {
    id: message.id,
    from:
      message.structured_content?.source === "safety"
        ? "safety"
        : message.sender_type === "user"
          ? "user"
          : "assistant",
    text: message.content,
  };
}

function findRelevantMeal(schedules: MealSchedule[]) {
  const now = new Date();
  const today = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const closest = schedules
    .filter((item) => item.days_of_week.includes(today))
    .sort(
      (a, b) =>
        distance(a.time_of_day, minutes) - distance(b.time_of_day, minutes)
    )[0];
  return closest && distance(closest.time_of_day, minutes) <= 90
    ? closest
    : null;
}

function distance(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  return Math.abs(hour * 60 + minute - minutes);
}
