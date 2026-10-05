import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { defaultPreferences, type SupportDatabase } from "../support";

const fixture = vi.hoisted(() => ({
  db: null as unknown,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  claimed: false,
  ready: true,
  send: vi.fn(),
  admin: null as unknown,
}));
vi.mock("../support-server", () => ({
  supportAdmin: () => fixture.admin,
  pushReady: () => fixture.ready,
  syncSupport: async () => ({ db: fixture.db, invitations: [] }),
  loadSupport: async () => fixture.db,
}));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: fixture.send },
}));
import { GET } from "../../app/api/support/dispatch/route";

describe("Entrega externa simulada (não comprova recebimento em aparelho)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    fixture.ready = true;
    fixture.claimed = false;
    fixture.updates = [];
    fixture.send.mockReset();
    const now = new Date(),
      p = defaultPreferences("u");
    p.push_enabled = true;
    p.allowed_start_time = p.allowed_end_time = "00:00";
    const db: SupportDatabase = {
      profiles: [],
      notification_preferences: [p],
      meal_schedules: [],
      behavioral_episodes: [],
      meal_checkins: [],
      strategy_trials: [
        { id: "trial", user_id: "u", result: "not_tested" } as never,
      ],
      scheduled_interventions: [
        {
          id: "i",
          user_id: "u",
          intervention_type: "strategy_followup",
          status: "scheduled",
          rule_source: "support_v1",
          scheduled_for: new Date(now.getTime() - 60000).toISOString(),
          expires_at: new Date(now.getTime() + 60000).toISOString(),
          created_at: now.toISOString(),
          payload: {
            strategy_trial_id: "trial",
            preferences_revision: p.updated_at,
          },
        },
      ],
    };
    fixture.db = db;
    fixture.admin = {
      rpc: async () => {
        if (fixture.claimed) return { data: false };
        fixture.claimed = true;
        db.scheduled_interventions[0].status = "sending";
        db.scheduled_interventions[0].attempted_at = now.toISOString();
        return { data: true };
      },
      from: (table: string) => {
        let patch: Record<string, unknown> | undefined;
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data: {
              id: "sub",
              endpoint: "https://fcm.googleapis.com/fcm/send/test",
              keys: { p256dh: "test", auth: "test" },
            },
          }),
          update: (value: Record<string, unknown>) => {
            patch = value;
            fixture.updates.push({ table, patch: value });
            return q;
          },
          then: (resolve: (r: unknown) => void) => {
            if (patch && table === "scheduled_interventions")
              Object.assign(db.scheduled_interventions[0], patch);
            resolve({
              data:
                table === "notification_preferences" ? [{ user_id: "u" }] : [],
              error: null,
            });
          },
        };
        return q;
      },
    };
  });
  const request = (secret = "test-secret") =>
    new NextRequest("https://app.test/api/support/dispatch", {
      headers: { authorization: `Bearer ${secret}` },
    });
  it("sem autorização não chama provedor nem banco", async () => {
    const r = await GET(request("wrong"));
    expect(r.status).toBe(401);
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it("sem configuração não mostra sucesso", async () => {
    fixture.ready = false;
    const r = await GET(request());
    expect(r.status).toBe(503);
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it("falha não grava sent_at, abertura ou resposta fictícia", async () => {
    fixture.send.mockRejectedValue({ statusCode: 503 });
    const r = await GET(request());
    expect(await r.json()).toEqual({ sent: 0, failed: 1 });
    expect(fixture.updates.some((x) => x.patch.status === "failed")).toBe(true);
    expect(
      fixture.updates.some(
        (x) =>
          "sent_at" in x.patch ||
          "opened_at" in x.patch ||
          "responded_at" in x.patch,
      ),
    ).toBe(false);
    await GET(request());
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
  it("inscrição expirada é desativada", async () => {
    fixture.send.mockRejectedValue({ statusCode: 410 });
    await GET(request());
    expect(fixture.updates).toContainEqual({
      table: "push_subscriptions",
      patch: { enabled: false },
    });
  });
  it("aceite do serviço não é leitura; nova execução não duplica envio", async () => {
    fixture.send.mockResolvedValue({ statusCode: 201 });
    const r = await GET(request());
    expect(await r.json()).toEqual({ sent: 1, failed: 0 });
    await GET(request());
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(
      fixture.updates.some(
        (x) => "opened_at" in x.patch || "responded_at" in x.patch,
      ),
    ).toBe(false);
    const payload = JSON.parse(fixture.send.mock.calls[0][1]);
    expect(payload.url).toBe("/app/hoje?invitation=i");
    expect(payload.body).not.toContain("trial");
  });
});
