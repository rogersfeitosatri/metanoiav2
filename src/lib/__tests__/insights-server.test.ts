import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withDatabaseDefaults } from "../supabase/data";
import { initialEpisodeFields } from "../behavioral-episodes";
import type { Database } from "../types";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({
  createServerSupabase: async () => session.client,
}));
import { loadInsightsDatabase, saveInsightFeedback } from "../insights-server";
import { GET, POST } from "../../app/api/insights/route";

type Row = Record<string, unknown>;
let db: Database;
let failWrite: boolean;
let failRead: boolean;
let role: string;
let queries: Array<{ table: string; filters: Array<[string, unknown]> }>;
function client(): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      queries.push({ table, filters });
      let row: Row | undefined;
      let start = 0,
        end = 1000;
      const result = () => {
        if (table === "profiles")
          return {
            data: {
              role,
              access_enabled: true,
              onboarding_completed: true,
              timezone: "America/Sao_Paulo",
            },
            error: null,
          };
        if (row) {
          if (failWrite)
            return {
              data: null,
              error: { message: "sensitive internal error" },
            };
          const list = db.user_memories as unknown as Row[];
          const old = list.findIndex((r) => r.id === row!.id);
          if (old >= 0) list[old] = row;
          else list.push(row);
          return { data: row, error: null };
        }
        return {
          data: (db[table as keyof Database] as unknown as Row[])
            .filter((r) => filters.every(([k, v]) => r[k] === v))
            .slice(start, end),
          error: failRead ? { message: "error" } : null,
        };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          end = n;
          return q;
        },
        range: (from: number, to: number) => {
          start = from;
          end = to + 1;
          return q;
        },
        upsert: (r: Row) => {
          row = r;
          return q;
        },
        single: async () => result(),
        then: (resolve: (r: unknown) => void) => resolve(result()),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}
beforeEach(() => {
  const at = new Date().toISOString();
  db = withDatabaseDefaults({
    behavioral_episodes: [0, 1, 2].map((id) => ({
      ...initialEpisodeFields("register_event"),
      id: String(id),
      user_id: "u",
      conversation_id: `c${id}`,
      started_at: at,
      created_at: at,
      updated_at: at,
      situation: "O almoço atrasou",
      hunger_level: 10,
    })) as Database["behavioral_episodes"],
  });
  queries = [];
  failWrite = false;
  failRead = false;
  role = "user";
  session.client = client();
});
describe("Aprendizados no servidor", () => {
  it("rejeições além da primeira página continuam sendo recuperadas", async () => {
    const c = session.client as SupabaseClient;
    const rejected = await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "rejected",
    );
    db.user_memories = [
      ...Array.from({ length: 1000 }, (_, i) => ({
        ...rejected,
        id: `other-${i}`,
        content: "Informação não relacionada",
        topic: `outro-${i}`,
      })),
      rejected,
    ];
    expect((await loadInsightsDatabase(c, "u")).user_memories).toHaveLength(
      1001,
    );
    expect((await (await GET()).json()).blocks).toEqual([]);
  });
  it("escopa todas as tabelas e nunca busca notas profissionais", async () => {
    await loadInsightsDatabase(session.client as SupabaseClient, "u");
    expect(queries).toHaveLength(7);
    expect(
      queries.every((q) =>
        q.filters.some(([k, v]) => k === "user_id" && v === "u"),
      ),
    ).toBe(true);
    expect(
      queries.some((q) => /professional|admin|risk_flag/.test(q.table)),
    ).toBe(false);
  });
  it("erro de leitura não vira tela inventada sem dados", async () => {
    failRead = true;
    const response = await GET();
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });
  it("duas confirmações geram só uma memória, sem inflar contagem", async () => {
    const c = session.client as SupabaseClient;
    await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "confirmed",
    );
    await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "confirmed",
    );
    expect(db.user_memories).toHaveLength(1);
    expect(db.user_memories[0].evidence_count).toBe(3);
    expect((await (await GET()).json()).blocks[0].status).toBe("confirmed");
  });
  it("duas abas com snapshot inicial vazio utilizam o mesmo id", async () => {
    const c = session.client as SupabaseClient;
    const first = await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "confirmed",
    );
    db.user_memories = [];
    const second = await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "qualified",
    );
    expect(first.id).toBe(second.id);
  });
  it("rejeição some após novo GET e retry não duplica", async () => {
    const c = session.client as SupabaseClient;
    await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "rejected",
    );
    await saveInsightFeedback(
      c,
      "u",
      "America/Sao_Paulo",
      "delayed-meal-hunger",
      "rejected",
    );
    expect(db.user_memories).toHaveLength(1);
    expect((await (await GET()).json()).blocks).toEqual([]);
  });
  it("erro de gravação não retorna sucesso nem detalhes internos", async () => {
    failWrite = true;
    const r = await POST(
      new NextRequest("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({
          key: "delayed-meal-hunger",
          choice: "confirmed",
        }),
      }),
    );
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toContain("sensitive");
  });
  it("cliente não pode fornecer texto nem outro proprietário", async () => {
    const r = await POST(
      new NextRequest("http://localhost/api/insights", {
        method: "POST",
        body: JSON.stringify({
          key: "delayed-meal-hunger",
          choice: "confirmed",
          userId: "b",
          content: "inventado",
        }),
      }),
    );
    expect(r.status).toBe(400);
    expect(db.user_memories).toHaveLength(0);
  });
  it("não permite validar padrão inexistente", async () => {
    await expect(
      saveInsightFeedback(
        session.client as SupabaseClient,
        "u",
        "America/Sao_Paulo",
        "fake",
        "confirmed",
      ),
    ).rejects.toThrow();
  });
  it("nega anônimo e não usa papel profissional para ler dados do paciente", async () => {
    role = "professional";
    expect((await GET()).status).toBe(403);
    session.client = null;
    expect((await GET()).status).toBe(401);
  });
});
