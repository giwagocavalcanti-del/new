"use client";

import { MAX_QTY } from "@/lib/pricing";

type Props = {
  value: number;
  onChange: (next: number) => void;
  label: string;
  compact?: boolean;
};

export function QuantityStepper({ value, onChange, label, compact = false }: Props) {
  const size = compact ? "size-8" : "size-11";
  const clamp = (next: number) => Math.max(1, Math.min(MAX_QTY, next));

  return (
    <div role="group" aria-label={label} className="border-line bg-surface inline-flex items-center rounded-full border">
      <button
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        aria-label="Menge verringern"
        className={`${size} cursor-pointer rounded-full text-lg disabled:cursor-not-allowed disabled:opacity-30`}
      >
        −
      </button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value.replace(/\D/g, ""), 10);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
        aria-label={label}
        className={`${compact ? "w-8 text-sm" : "w-10"} rounded bg-transparent text-center font-medium tabular-nums`}
      />
      <button
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= MAX_QTY}
        aria-label="Menge erhöhen"
        className={`${size} cursor-pointer rounded-full text-lg disabled:cursor-not-allowed disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}
