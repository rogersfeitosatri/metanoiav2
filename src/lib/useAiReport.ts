"use client";

import { useEffect, useState } from "react";
import { useStore } from "./store";
import type { WeeklyReportContent } from "./ai/schemas";

// Retorna o relatório semanal: renderiza imediatamente a versão determinística e,
// se a IA estiver configurada no servidor, substitui pela versão gerada por IA.
export function useAiReport(userId: string): { report: WeeklyReportContent; source: "local" | "ai" } {
  const store = useStore();
  const [report, setReport] = useState<WeeklyReportContent>(() => store.weeklyReportFor(userId));
  const [source, setSource] = useState<"local" | "ai">("local");

  useEffect(() => {
    let active = true;
    const patterns = store.patternsFor(userId);
    setReport(store.weeklyReportFor(userId));
    fetch("/api/ai/weekly-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patterns }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && data?.report) {
          setReport(data.report as WeeklyReportContent);
          setSource(data.source === "ai" ? "ai" : "local");
        }
      })
      .catch(() => {
        /* mantém a versão local */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { report, source };
}
