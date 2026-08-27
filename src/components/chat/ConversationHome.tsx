"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TypingDots } from "@/components/ui";
import {
  CONVERSATION_INTENT_CONFIG,
  isExplicitConversationIntent,
  parseConversationIntent,
  type ConversationIntent,
} from "@/lib/conversation-intent";
import {
  abandonEpisodePatch,
  inferIntentFromNewDemand,
  initialEpisodeFields,
  isExplicitNewDemand,
  patchEpisodeEventMoment,
  patchEpisodeFromTurn,
  resumeEpisodePrompt,
  resumeLastQuestion,
  resolveFollowupEpisodePatch,
  selectEpisodeForEntry,
  type EpisodeRelations,
} from "@/lib/behavioral-episodes";
import {
  ConversationEngineResponseSchema,
  ConversationEngineStateSchema,
  type ConversationAction,
  type ConversationContext,
  type ConversationEngineState,
} from "@/lib/ai/schemas";
import { useStore } from "@/lib/store";
import type {
  BehavioralEpisode,
  Conversation,
  ConversationMessage,
  MealSchedule,
} from "@/lib/types";

type Bubble = {
  id: string;
  from: "assistant" | "user" | "safety";
  text: string;
  episodeId?: string | null;
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
  const episodeRef = useRef<BehavioralEpisode | null>(null);
  const activeIntentRef = useRef<ConversationIntent>(intent);
  const awaitingResumeChoiceRef = useRef(false);
  const engineStateRef = useRef<ConversationEngineState | null>(null);
  const activeCheckinRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const entryKey = `${userId}:${intent}`;
    if (initializedEntryRef.current === entryKey) return;
    initializedEntryRef.current = entryKey;

    conversationRef.current = null;
    episodeRef.current = null;
    activeIntentRef.current = intent;
    awaitingResumeChoiceRef.current = false;
    engineStateRef.current = null;
    activeCheckinRef.current = null;
    setBubbles([]);
    setQuickReplies([]);
    setDraft("");
    setTyping(false);
    setError(null);

    const config = CONVERSATION_INTENT_CONFIG[intent];
    const selection = selectEpisodeForEntry(store.db.behavioral_episodes, {
      userId,
      intent,
      isReload: isPageReload(),
    });
    let episode = selection.kind === "create" ? null : selection.episode;
    const explicitIntent = isExplicitConversationIntent(intent);
    let conversation = episode
      ? store.db.conversations.find((item) => item.id === episode?.conversation_id)
      : undefined;
    if (!conversation) {
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
      conversation =
        existing ||
        store.createConversation(userId, config.conversationType, config.title);
      episode = null;
    }
    conversationRef.current = conversation;

    const episodeWasCreated = !episode;
    if (!episode) {
      episode = store.createEpisode({
        user_id: userId,
        conversation_id: conversation.id,
        ...initialEpisodeFields(intent),
      });
    }
    episodeRef.current = episode;
    activeIntentRef.current = episode.current_intent;

    const existingMessages = store.db.conversation_messages
      .filter((item) => item.conversation_id === conversation.id)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    const episodeMessages = existingMessages.filter(
      (message) => message.episode_id === episode?.id
    );
    if (existingMessages.length) {
      setBubbles(existingMessages.map(toBubble));
    }

    let parsedState = ConversationEngineStateSchema.safeParse(
      episode.conversation_state
    );
    if (!parsedState.success) {
      const compatibleMessages = episodeWasCreated
        ? existingMessages.filter((message) => !message.episode_id)
        : episodeMessages;
      const stateMessage = compatibleMessages
        .slice()
        .reverse()
        .find((message) => message.structured_content?.engine_state);
      parsedState = ConversationEngineStateSchema.safeParse(
        stateMessage?.structured_content?.engine_state
      );
      if (parsedState.success) {
        const patch = {
          conversation_state: parsedState.data as unknown as Record<string, unknown>,
          current_stage: parsedState.data.stage,
          awaiting_field: parsedState.data.stage === "done" ? null : parsedState.data.stage,
          situation: parsedState.data.situation || episode.situation || null,
          current_intent: parsedState.data.intent,
        };
        Object.assign(episode, patch);
        store.updateEpisode(episode.id, patch);
      }
    }

    if (parsedState.success) {
      engineStateRef.current = parsedState.data;
      activeIntentRef.current = parsedState.data.intent;
      activeCheckinRef.current =
        parsedState.data.active_checkin_id || episode.related_meal_checkin_id || null;
    }

    const lastEpisodeMessage = (episodeMessages.length
      ? episodeMessages
      : episodeWasCreated
        ? existingMessages.filter((message) => !message.episode_id)
        : []
    ).at(-1);
    setQuickReplies(
      lastEpisodeMessage?.sender_type === "assistant"
        ? lastEpisodeMessage.quick_replies || []
        : []
    );

    if (selection.kind === "offer_resume" && !episodeWasCreated) {
      awaitingResumeChoiceRef.current = true;
      setBubbles((current) => [
        ...current,
        {
          id: `resume-${episode.id}`,
          from: "assistant",
          text: resumeEpisodePrompt(episode),
          episodeId: episode.id,
        },
      ]);
      setQuickReplies(["Continuar aquilo", "Falar de outra coisa"]);
      return;
    }

    if (parsedState.success) return;

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
    const episodeId = episodeRef.current?.id || null;
    setBubbles((current) => [
      ...current,
      { id, from: displayFrom, text, episodeId },
    ]);
    if (conversationRef.current) {
      store.addMessage({
        conversation_id: conversationRef.current.id,
        episode_id: episodeId,
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
    setDraft("");
    setQuickReplies([]);
    setError(null);

    if (awaitingResumeChoiceRef.current) {
      await handleResumeChoice(text);
      return;
    }

    if (episodeRef.current?.status !== "active") {
      beginNewEpisode(inferIntentFromNewDemand(text), false);
    } else if (isExplicitNewDemand(text)) {
      beginNewEpisode(inferIntentFromNewDemand(text), true);
    }

    updateEventMoment(text);
    const history = [
      ...bubbles,
      {
        id: "pending",
        from: "user" as const,
        text,
        episodeId: episodeRef.current?.id || null,
      },
    ];
    persist("user", text);
    const boundaryOnly = /^\s*(?:agora\s+)?aconteceu\s+outra\s+coisa[.!]?\s*$/i.test(text);
    if (boundaryOnly) {
      await requestEngine("start", undefined, history);
      return;
    }
    await requestEngine("message", text, history);
  }

  async function handleResumeChoice(text: string) {
    awaitingResumeChoiceRef.current = false;
    if (/continuar/i.test(text)) {
      persist("user", text);
      const episode = episodeRef.current;
      if (!episode || !engineStateRef.current) {
        await requestEngine("start");
        return;
      }
      const replies = lastRepliesForEpisode(episode.id);
      persist(
        "assistant",
        resumeLastQuestion(episode),
        replies,
        {
          engine_state: engineStateRef.current,
          source: "episode_resume",
        }
      );
      setQuickReplies(replies);
      return;
    }

    if (/falar de outra coisa|outro assunto/i.test(text)) {
      persist("user", text);
      beginNewEpisode("default", true);
      await requestEngine("start");
      return;
    }

    beginNewEpisode(inferIntentFromNewDemand(text), true);
    updateEventMoment(text);
    const history = [
      ...bubbles,
      {
        id: "pending",
        from: "user" as const,
        text,
        episodeId: episodeRef.current?.id || null,
      },
    ];
    persist("user", text);
    await requestEngine("message", text, history);
  }

  function beginNewEpisode(nextIntent: ConversationIntent, abandonCurrent: boolean) {
    const conversation = conversationRef.current;
    if (!conversation) return null;
    const previous = episodeRef.current;
    if (abandonCurrent && previous?.status === "active") {
      const patch = abandonEpisodePatch();
      Object.assign(previous, patch);
      store.updateEpisode(previous.id, patch);
    }
    const next = store.createEpisode({
      user_id: userId,
      conversation_id: conversation.id,
      ...initialEpisodeFields(nextIntent),
    });
    episodeRef.current = next;
    activeIntentRef.current = nextIntent;
    engineStateRef.current = null;
    activeCheckinRef.current = null;
    awaitingResumeChoiceRef.current = false;
    return next;
  }

  function updateEventMoment(text: string) {
    const episode = episodeRef.current;
    if (!episode) return;
    const patch = patchEpisodeEventMoment(episode, text);
    if (!Object.keys(patch).length) return;
    Object.assign(episode, patch);
    store.updateEpisode(episode.id, patch);
  }

  function lastRepliesForEpisode(episodeId: string): string[] {
    return (
      store.db.conversation_messages
        .filter(
          (message) =>
            message.episode_id === episodeId && message.sender_type === "assistant"
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]?.quick_replies || []
    );
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
          intent: activeIntentRef.current,
          state: engineStateRef.current || undefined,
          history: history
            .filter((item) => item.episodeId === episodeRef.current?.id)
            .slice(-20)
            .map((item) => ({
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
      activeIntentRef.current = data.state.intent;
      const relations = applyActions(data.actions);
      const episode = episodeRef.current;
      if (episode) {
        const patch = patchEpisodeFromTurn(episode, data, relations);
        Object.assign(episode, patch);
        store.updateEpisode(episode.id, patch);
      }
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

  function applyActions(actions: ConversationAction[]): EpisodeRelations {
    const relations: EpisodeRelations = {};
    const episodeId = episodeRef.current?.id || null;
    for (const action of actions) {
      if (action.type === "create_meal_checkin") {
        const checkin = store.addCheckin({
          user_id: userId,
          episode_id: episodeId,
          schedule_id: action.schedule_id,
          custom_meal_name: action.meal_name,
          status: action.status,
        });
        activeCheckinRef.current = checkin.id;
        relations.mealCheckinId = checkin.id;
        if (engineStateRef.current) {
          engineStateRef.current.active_checkin_id = checkin.id;
        }
      } else if (action.type === "record_difficulty") {
        const recorded = store.recordDifficulty(
          userId,
          action.data,
          conversationRef.current?.id,
          activeCheckinRef.current ||
            engineStateRef.current?.active_checkin_id ||
            undefined,
          episodeId || undefined
        );
        relations.difficultyEventId = recorded.event.id;
      } else if (action.type === "save_memory") {
        store.saveMemory({
          ...action.memory,
          source_conversation_id: conversationRef.current?.id || null,
        });
      } else if (action.type === "create_strategy_trial") {
        const plannedFor = new Date(Date.now() + 86400000).toISOString();
        const trial = store.addStrategyTrial({
          user_id: userId,
          episode_id: episodeId,
          title_snapshot: action.title,
          result: "not_tested",
          planned_for: plannedFor,
        });
        relations.strategyTrialId = trial.id;
        relations.strategyPlannedFor = plannedFor;
      } else if (action.type === "update_strategy_trial") {
        store.updateStrategyTrial(action.strategy_trial_id, {
          result: action.result,
          tested_at: new Date().toISOString(),
          user_feedback: action.feedback,
        });
        relations.strategyTrialId = action.strategy_trial_id;
        const originalEpisode = store.db.behavioral_episodes.find(
          (episode) =>
            episode.id !== episodeId &&
            episode.status === "waiting_followup" &&
            episode.related_strategy_trial_id === action.strategy_trial_id
        );
        if (originalEpisode) {
          store.updateEpisode(
            originalEpisode.id,
            resolveFollowupEpisodePatch(
              `Acompanhamento concluído: ${action.feedback}`
            )
          );
        }
      }
    }
    if (relations.strategyTrialId && relations.difficultyEventId) {
      store.updateStrategyTrial(relations.strategyTrialId, {
        difficulty_event_id: relations.difficultyEventId,
      });
    }
    return relations;
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
    episodeId: message.episode_id ?? null,
  };
}

function isPageReload(): boolean {
  if (typeof performance === "undefined") return false;
  const navigation = performance.getEntriesByType(
    "navigation"
  ) as PerformanceNavigationTiming[];
  return navigation.at(-1)?.type === "reload";
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
