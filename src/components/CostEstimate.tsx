"use client";

import { Avatar } from "./Avatar";
import { Button, type ButtonProps } from "./Button";
import { ProgressBar } from "./Progress";
import { Tooltip } from "./Tooltip";

// About how much an action spends, in muted words beside it: "About $0.04", "About 1 Apollo credit", "Free". Hovering
// it names the budget it counts against (`budget`: "From your AI budget: $18.40 of $25 used in September.").
export function CostEstimate({ amount, budget, className = "" }: { amount: string; budget?: string; className?: string }) {
  const words = <span className={`shrink-0 text-body-sm leading-body-sm whitespace-nowrap text-muted tabular-nums ${className}`}>{amount}</span>;
  if (!budget) return words;
  return (
    <Tooltip content={amount} detail={budget}>
      {words}
    </Tooltip>
  );
}

// An action that spends, with its estimate beside it. The button's own tooltip carries the same cost, so it reads the
// same from the keyboard. When the budget it needs is spent (`reached`), the button is disabled with the reason and
// the estimate gives way to what happened and where to raise it.
export function CostAction({
  amount,
  budget,
  reached,
  note,
  reason,
  ...button
}: ButtonProps & {
  amount: string;
  budget?: string;
  reached?: { label: string; reason: string; onRaise: () => void };
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Button {...button} reason={reached?.reason ?? reason} note={note ?? (budget ? `${amount}. ${budget}` : amount)} />
      {reached ? (
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-body-sm leading-body-sm text-muted">{reached.label}</span>
          <Button variant="ghost" size="sm" detail="Opens your budgets in Settings, to raise this one." note="Free" onClick={reached.onRaise}>
            Raise budget
          </Button>
        </span>
      ) : (
        <CostEstimate amount={amount} budget={budget} />
      )}
    </div>
  );
}

// A person's email, revealed only when you choose to, one person at a time: the cost and what's left, and Reveal
// email; once revealed, the address. `reason` disables it (credits spent).
export function RevealEmail({
  person,
  email,
  cost,
  note,
  onReveal,
  loading,
  reason,
}: {
  person: string;
  email?: string;
  cost: string;
  note?: string;
  onReveal: () => void;
  loading?: boolean;
  reason?: string;
}) {
  if (email) return <span className="min-w-0 truncate text-body-sm leading-body-sm text-text select-all">{email}</span>;
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5 md:flex-row md:items-center md:gap-3">
      <span className="text-label leading-label whitespace-nowrap text-muted tabular-nums max-md:order-last md:text-body-sm md:leading-body-sm">{cost}</span>
      <Button
        size="sm"
        icon="email"
        onClick={onReveal}
        loading={loading}
        loadingLabel="Revealing"
        reason={reason}
        aria-label={`Reveal email for ${person}`}
        detail={`Shows ${person.split(" ")[0]}’s work email.`}
        note={note ?? cost}
      >
        Reveal email
      </Button>
    </span>
  );
}

// A person row with RevealEmail at its end, 56px: initials, name and title. On a phone the cost sits under the button.
export function PersonReveal({ name, title, ...reveal }: Omit<Parameters<typeof RevealEmail>[0], "person"> & { name: string; title: string }) {
  return (
    <div className="flex h-14 items-center gap-3 px-3">
      <Avatar name={name} size={28} />
      <div className="flex min-w-[40%] flex-1 flex-col">
        <span className="truncate text-body-sm leading-body-sm font-medium text-text">{name}</span>
        <span className="truncate text-body-sm leading-body-sm text-muted">{title}</span>
      </div>
      <RevealEmail person={name} {...reveal} />
    </div>
  );
}

// When a budget runs out, work pauses and says so: a caution rule, what stopped and when it picks up, and Raise budget.
export function BudgetNotice({ title, detail, onRaise }: { title: string; detail: string; onRaise: () => void }) {
  return (
    <div role="status" className="flex items-start gap-4 border-l-2 border-caution py-0.5 pl-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body-sm leading-body-sm font-semibold text-text">{title}</span>
        <span className="text-body-sm leading-body-sm text-muted">{detail}</span>
      </div>
      <Button detail="Opens your budgets in Settings, to raise this one." note="Free" onClick={onRaise}>
        Raise budget
      </Button>
    </div>
  );
}

// How much of a budget is spent: its name, the amount in muted tabular figures, and a steel bar.
export function BudgetMeter({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-body-sm leading-body-sm">
        <span className="font-medium text-text">{label}</span>
        <span className="text-muted tabular-nums">{detail}</span>
      </div>
      <ProgressBar label={`${label} budget`} value={value} max={max} valueText={detail} />
    </div>
  );
}
