"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X, MessageCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { dueSupport, invitationHref } from "@/lib/support";
import type { ScheduledIntervention } from "@/lib/types";
import { ConversationHome } from "./ConversationHome";

export function ConversationEntry() {
  const store = useStore(),
    params = useSearchParams(),
    id = params.get("invitation");
  const [invites, setInvites] = useState<ScheduledIntervention[]>([]),
    [target, setTarget] = useState<ScheduledIntervention | null>(null);
  const [loaded, setLoaded] = useState(false),
    [episodeId, setEpisodeId] = useState<string | undefined>(),
    [error, setError] = useState(""),
    [opening, setOpening] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setEpisodeId(undefined);
    setTarget(null);
    setError("");
    if (store.mode === "demo") {
      store.syncSupportInvitations();
      setLoaded(true);
      return;
    }
    void fetch(
      `/api/support${id ? `?invitation=${encodeURIComponent(id)}` : ""}`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error("Não consegui carregar esse convite.");
        return r.json();
      })
      .then((data) => {
        if (active) {
          setInvites(data.invitations || []);
          setTarget(data.invitation);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
    // Entry changes only. Conversation writes must not repeatedly reschedule a render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, store.mode, store.currentUserId]);
  const invitation =
    store.mode === "demo"
      ? store.db.scheduled_interventions.find(
          (i) => i.id === id && i.user_id === store.currentUserId,
        )
      : target;
  const list =
    store.mode === "demo"
      ? dueSupport(store.db, store.currentUserId!)
      : invites;
  async function open() {
    if (!invitation || opening) return;
    setOpening(true);
    setError("");
    try {
      const result = await store.manageSupport({
        action: "open",
        id: invitation.id,
      });
      setEpisodeId(result.episodeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui abrir.");
    } finally {
      setOpening(false);
    }
  }
  const selected = episodeId || invitation?.episode_id || undefined;
  const episode = store.db.behavioral_episodes.find(
    (e) => e.id === selected && e.user_id === store.currentUserId,
  );
  if (id) {
    if (
      loaded &&
      invitation &&
      (["cancelled", "expired"].includes(invitation.status) ||
        (invitation.status === "responded" && episode?.status !== "active") ||
        (!episode &&
          invitation.expires_at &&
          Date.parse(invitation.expires_at) <= Date.now()))
    )
      return (
        <section className="space-y-4 py-6">
          <h1 className="text-xl font-semibold text-sage-800">
            Esse convite já encerrou
          </h1>
          <p>Não precisa responder de novo.</p>
          <Link className="text-sage-700 underline" href="/app/hoje">
            Continuar na Conversa
          </Link>
        </section>
      );
    if (episode)
      return (
        <ConversationHome key={episode.id} initialEpisodeId={episode.id} />
      );
    if (!loaded || opening)
      return (
        <p role="status" className="py-8 text-warmgray-500">
          Retomando a conversa...
        </p>
      );
    const current = store.db.behavioral_episodes.some(
      (e) => e.user_id === store.currentUserId && e.status === "active",
    );
    return (
      <section className="space-y-4 py-6">
        <h1 className="text-xl font-semibold text-sage-800">Conversa</h1>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        {invitation ? (
          <>
            <p>
              {current
                ? "Tem uma conversa em andamento. Quer continuar nela ou abrir este convite?"
                : "Quer abrir o convite de apoio que tu combinou?"}
            </p>
            <button
              disabled={opening}
              className="btn-primary"
              onClick={() => void open()}
            >
              Abrir convite
            </button>
          </>
        ) : (
          <p>Esse convite não está mais disponível.</p>
        )}
        <Link className="block text-sage-700 underline" href="/app/hoje">
          {current ? "Continuar conversa" : "Ir para Conversa"}
        </Link>
        <Link
          className="block text-sage-700 underline"
          href="/app/hoje?intent=help_now"
        >
          Preciso de ajuda agora
        </Link>
      </section>
    );
  }
  return (
    <ConversationHome
      supportInvitations={
        params.get("intent") === "help_now" ? undefined : list.length ? (
          <div className="space-y-2 border-b border-warmgray-100 py-3">
            {list.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={invitationHref(i)}
                  className="flex min-w-0 items-center gap-2 text-sage-700"
                >
                  <MessageCircle size={16} className="shrink-0" />
                  <span className="break-words">
                    {i.intervention_type === "strategy_followup"
                      ? "Retomar um experimento"
                      : `${i.intervention_type === "preventive" ? "Preparar" : "Conversar sobre"} ${i.payload.meal_name || "essa refeição"}`}
                  </span>
                </Link>
                <button
                  title="Dispensar convite"
                  aria-label="Dispensar convite"
                  className="p-2 text-warmgray-500"
                  onClick={() =>
                    void store
                      .manageSupport({ action: "dismiss", id: i.id })
                      .then(() =>
                        setInvites((v) => v.filter((x) => x.id !== i.id)),
                      )
                      .catch(() =>
                        setError("Não consegui dispensar esse convite."),
                      )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {error && <p role="alert">{error}</p>}
          </div>
        ) : undefined
      }
    />
  );
}
