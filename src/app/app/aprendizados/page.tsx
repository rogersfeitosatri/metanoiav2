"use client";

import { useStore } from "@/lib/store";

export default function AprendizadosPage() {
  const store = useStore();
  const userId = store.currentUserId!;
  const patterns = store.patternsFor(userId);
  const memories = store.db.user_memories.filter((item) => item.user_id === userId && item.validation_status === "confirmed");
  const protective = memories.filter((item) => item.memory_kind === "protective_factor");
  const pending = store.db.strategy_trials.filter((item) => item.user_id === userId && item.result === "not_tested");
  const tested = store.db.strategy_trials.filter((item) => item.user_id === userId && (item.result === "helped" || item.result === "partially_helped"));
  const hasData = patterns.hardestTimeWindow || patterns.frequentTriggers.length || protective.length || tested.length;

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <header><h1 className="text-2xl font-semibold text-sage-800">Aprendizados</h1><p className="mt-1 text-warmgray-600">Relações que apareceram na tua experiência, sem transformar isso em rótulo.</p></header>
      {!hasData && <p className="border-y border-warmgray-200 py-8 text-warmgray-500">Ainda estamos conhecendo tua rotina. Quando houver experiências suficientes, os aprendizados vão aparecer aqui.</p>}
      {patterns.hardestTimeWindow && <Insight title="Quando tende a ficar mais difícil">O {patterns.hardestTimeWindow.label.toLowerCase()} tem pedido mais atenção. Isso não significa falta de vontade; é um contexto em que vale chegar com mais apoio.</Insight>}
      {patterns.frequentTriggers.length > 0 && <Insight title="O que costuma acontecer antes">Quando {joinNatural(patterns.frequentTriggers.slice(0, 3).map((item) => item.label.toLowerCase()))}, tuas escolhas parecem exigir mais esforço.</Insight>}
      {patterns.recurringThoughts.length > 0 && <Insight title="Pensamentos que estreitam a escolha">A frase “{patterns.recurringThoughts[0].label}” costuma aparecer perto dos momentos difíceis. Estamos tratando isso como um padrão observado, não como uma verdade sobre ti.</Insight>}
      {protective.length > 0 && <Insight title="O que te protege">{joinNatural(protective.slice(0, 3).map((item) => item.content))}. Esses pontos vieram do que tu disse que ajudou.</Insight>}
      {tested.length > 0 && <Insight title="Estratégias com experiência real">{joinNatural([...new Set(tested.map((item) => item.title_snapshot))])} {tested.length === 1 ? "foi útil em uma situação concreta" : "foram úteis em situações concretas"}. Ainda vamos observar em quais contextos funcionam melhor.</Insight>}
      {pending.length > 0 && <Insight title="Em teste">“{pending[0].title_snapshot}” continua sendo um experimento. Só vai entrar entre o que ajuda depois da tua avaliação.</Insight>}
    </div>
  );
}

function Insight({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t border-warmgray-200 pt-5"><h2 className="font-semibold text-warmgray-800">{title}</h2><p className="mt-2 leading-relaxed text-warmgray-600">{children}</p></section>; }
function joinNatural(items: string[]) { if (items.length < 2) return items[0] || ""; return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`; }
