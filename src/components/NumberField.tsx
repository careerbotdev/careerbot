"use client";

import { useState, type KeyboardEvent } from "react";
import { Field, Input } from "./Field";

// A labelled number. No spinners: ↑ ↓ step it (Shift for ten steps), and what's typed is checked when you leave the field
// or press Enter. `unit` sits at the right ("credits"); `currency` shows dollars ("$180,000").
export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  currency,
  example,
  hint,
  placeholder,
  disabled,
  hideLabel,
  className = "",
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  currency?: boolean;
  // The number the error suggests ("Enter a number, like 25.").
  example?: number;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const format = (n: number) => n.toLocaleString("en-US", currency ? { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 6 });
  const [text, setText] = useState(value === null ? "" : format(value));
  const [seen, setSeen] = useState(value);
  const [problem, setProblem] = useState<string>();
  if (value !== seen) {
    setSeen(value);
    setText(value === null ? "" : format(value));
  }
  // What the text reads as: a number, null for empty, or what's wrong.
  const check = (t: string): { n: number | null } | { problem: string } => {
    if (!t.trim()) return { n: null };
    const clean = t.trim().replace(/^(-?)\s*\$\s*/, "$1").replace(/,/g, "");
    const n = /^-?(\d+\.?\d*|\.\d+)$/.test(clean) ? Number(clean) : NaN;
    if (Number.isNaN(n)) return { problem: `Enter a number, like ${(example ?? value ?? Math.max(min ?? 0, step)).toLocaleString("en-US")}.` };
    if (min !== undefined && n < min) return { problem: `Enter ${format(min)} or more.` };
    if (max !== undefined && n > max) return { problem: `Enter ${format(max)} or less.` };
    return { n };
  };
  const commit = (n: number | null) => {
    setProblem(undefined);
    setText(n === null ? "" : format(n));
    if (n !== value) onChange(n);
  };
  const save = () => {
    const read = check(text);
    if ("problem" in read) setProblem(read.problem);
    else commit(read.n);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") save();
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const read = check(text);
    const base = "n" in read && read.n !== null ? read.n : (value ?? min ?? 0);
    const next = base + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
    commit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(next.toFixed(6)))));
  };
  return (
    <Field label={label} hideLabel={hideLabel} className={className} error={problem} hint={hint}>
      {(props) => (
        <Input
          {...props}
          role="spinbutton"
          inputMode="decimal"
          autoComplete="off"
          aria-valuenow={value ?? undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={text ? `${text}${unit ? ` ${unit}` : ""}` : undefined}
          suffix={unit}
          className="tabular-nums"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            // Once it has said what's wrong, it says when it's right again.
            if (problem && !("problem" in check(e.target.value))) setProblem(undefined);
          }}
          onBlur={save}
          onKeyDown={onKeyDown}
        />
      )}
    </Field>
  );
}
