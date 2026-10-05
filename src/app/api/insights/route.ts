import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildInsights } from "@/lib/insights";
import {
  insightsAuth,
  loadInsightsDatabase,
  saveInsightFeedback,
} from "@/lib/insights-server";

const feedback = z
  .object({
    key: z.string().min(1).max(160),
    choice: z.enum(["confirmed", "qualified", "rejected"]),
  })
  .strict();
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const failed = (error: unknown) =>
  json(
    {
      error:
        "Não consegui carregar ou salvar teus aprendizados. Tenta novamente.",
    },
    error instanceof Error && error.message === "Unauthenticated"
      ? 401
      : error instanceof Error && error.message === "Forbidden"
        ? 403
        : 400,
  );
export async function GET() {
  try {
    const { client, userId, timezone } = await insightsAuth();
    const db = await loadInsightsDatabase(client, userId);
    return json(buildInsights({ userId, timezone, db }));
  } catch (error) {
    return failed(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { client, userId, timezone } = await insightsAuth();
    const { key, choice } = feedback.parse(await req.json());
    const memory = await saveInsightFeedback(
      client,
      userId,
      timezone,
      key,
      choice,
    );
    return json({ memory });
  } catch (error) {
    return failed(error);
  }
}
