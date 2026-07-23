"use client";

import React from "react";
import type { CheckinStatus } from "@/lib/types";
import { CHECKIN_STATUS_LABELS } from "@/lib/labels";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-warmgray-800 mb-1">{children}</h2>;
}

export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`chip ${selected ? "chip-selected" : ""}`}
    >
      {label}
    </button>
  );
}

export function ChipGroup({
  options,
  value,
  multi,
  onChange,
}: {
  options: string[];
  value: string[];
  multi?: boolean;
  onChange: (next: string[]) => void;
}) {
  function toggle(opt: string) {
    if (multi) {
      onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
    } else {
      onChange([opt]);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Chip key={opt} label={opt} selected={value.includes(opt)} onClick={() => toggle(opt)} />
      ))}
    </div>
  );
}

export function ScaleInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Intensidade de 0 a 10">
      {Array.from({ length: 11 }, (_, i) => i).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`h-11 w-11 rounded-xl border text-sm font-medium transition-colors ${
            value === n
              ? "border-teal-500 bg-teal-100 text-teal-800"
              : "border-warmgray-200 bg-white text-warmgray-600 hover:border-teal-300"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: CheckinStatus }) {
  const styles: Record<CheckinStatus, string> = {
    completed: "bg-sage-100 text-sage-800 border-sage-200",
    partial: "bg-amber-100 text-amber-800 border-amber-200",
    not_completed: "bg-warmgray-100 text-warmgray-600 border-warmgray-200",
  };
  const emoji: Record<CheckinStatus, string> = {
    completed: "✅",
    partial: "🟡",
    not_completed: "○",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      <span aria-hidden>{emoji[status]}</span>
      {CHECKIN_STATUS_LABELS[status]}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-8 text-center text-warmgray-500">
      <p className="mx-auto max-w-sm leading-relaxed">{children}</p>
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-2 w-full rounded-full bg-warmgray-100"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-2 rounded-full bg-sage-400 transition-all"
        style={{ width: `${Math.max(4, value)}%` }}
      />
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-2 py-1" aria-label="digitando">
      <span className="typing-dot h-2 w-2 rounded-full bg-warmgray-400" />
      <span className="typing-dot h-2 w-2 rounded-full bg-warmgray-400" />
      <span className="typing-dot h-2 w-2 rounded-full bg-warmgray-400" />
    </div>
  );
}
