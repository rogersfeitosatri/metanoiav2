"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function ConfiguracoesPage() {
  const store = useStore();
  const router = useRouter();
  const userId = store.currentUserId!;
  const schedules = store.db.meal_schedules.filter((item) => item.user_id === userId && item.active).sort((a, b) => a.time_of_day.localeCompare(b.time_of_day));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [time, setTime] = useState("12:00");
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);

  function add() {
    if (!name.trim() || !days.length) return;
    store.addMealSchedule({ name: name.trim(), time_of_day: time, days_of_week: days, reminder_enabled: true });
    setName(""); setTime("12:00"); setAdding(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <header><h1 className="text-2xl font-semibold text-sage-800">Configurações</h1><p className="mt-1 text-warmgray-600">Tua rotina pode mudar. O Metanóia se ajusta junto.</p></header>
      <section className="border-t border-warmgray-200 pt-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold text-warmgray-800">Refeições e lembretes</h2><p className="text-sm text-warmgray-500">Escolhe quando vale a pena o app estar por perto.</p></div><button className="btn-secondary" onClick={() => setAdding(!adding)}>{adding ? "Cancelar" : "Adicionar"}</button></div>
        {adding && <div className="mt-4 space-y-3 rounded-lg border border-warmgray-200 bg-white p-4"><label className="label">Nome da refeição<input className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: almoço" /></label><label className="label">Horário<input type="time" className="input mt-1" value={time} onChange={(event) => setTime(event.target.value)} /></label><div><p className="label">Dias</p><div className="grid grid-cols-7 gap-2">{DAYS.map((label, value) => <button key={value} className={`h-10 rounded-lg border text-sm ${days.includes(value) ? "border-sage-500 bg-sage-100 text-sage-800" : "border-warmgray-200"}`} onClick={() => setDays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())}>{label}</button>)}</div></div><button className="btn-primary w-full" onClick={add}>Salvar refeição</button></div>}
        <div className="mt-4 divide-y divide-warmgray-100 border-y border-warmgray-200">{schedules.map((schedule) => <div key={schedule.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-medium text-warmgray-800">{schedule.name}</p><p className="text-sm text-warmgray-500">{schedule.time_of_day.slice(0, 5)} · {schedule.days_of_week.length === 7 ? "todos os dias" : `${schedule.days_of_week.length} dias`}</p></div><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm text-warmgray-600"><input type="checkbox" checked={schedule.reminder_enabled} onChange={(event) => store.updateMealSchedule(schedule.id, { reminder_enabled: event.target.checked })} />Lembrete</label><button className="text-sm text-warmgray-500 underline" onClick={() => store.updateMealSchedule(schedule.id, { active: false })}>Remover</button></div></div>)}</div>
      </section>
      <section className="space-y-2 border-t border-warmgray-200 pt-5"><Link href="/app/privacidade" className="block py-2 font-medium text-sage-700">Privacidade e uso dos dados</Link><button className="py-2 text-left font-medium text-warmgray-600" onClick={async () => { await store.logout(); router.replace("/"); router.refresh(); }}>Sair da conta</button></section>
    </div>
  );
}
