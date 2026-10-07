"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Field, Input } from "@/components/Field";
import { Select } from "@/components/Select";
import { useBar } from "../../shell/ShellContext";
import { type Choice, OnResumes, type Side } from "./OnResumes";
import { MONTH_NAMES } from "./words";

// A break's months (Start, then End or Still on this break), its reason if they want one, and how it shows on resumes,
// with the resume excerpt as it would read. ↵ saves, Esc cancels. On a phone Save and Cancel sit in the bottom bar.

export type BreakValues = { start: string; end?: string; reason: string; choice: Choice; into: Side | null };
type Month = { month: string; year: string };

const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: String(i + 1).padStart(2, "0"), label }));
const split = (d?: string): Month => ({ year: d?.slice(0, 4) ?? "", month: d?.slice(5, 7) ?? "" });
const joined = ({ month, year }: Month) => (month && /^\d{4}$/.test(year.trim()) ? `${year.trim()}-${month}` : null);

export function BreakForm({
  roleKey,
  initial,
  small,
  choosable,
  onSave,
  onCancel,
}: {
  // The break's roleKey (a new one has none yet), for the excerpt.
  roleKey: string;
  initial: Partial<BreakValues>;
  small: boolean;
  // Why the resume choice can't be made now, when it can't (a break not approved).
  choosable?: string;
  // Resolves with what went wrong, or null once saved.
  onSave: (values: BreakValues) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(split(initial.start));
  const [end, setEnd] = useState(split(initial.end));
  const [still, setStill] = useState(!!initial.start && !initial.end);
  const [reason, setReason] = useState(initial.reason ?? "");
  const [choice, setChoice] = useState<Choice>(initial.choice ?? "show");
  const [into, setInto] = useState<Side | null>(initial.into ?? null);
  const [problems, setProblems] = useState<{ start?: string; end?: string; save?: string }>({});
  const [saving, setSaving] = useState(false);

  const s = joined(start);
  const e = still ? null : joined(end);
  const save = () => {
    const wrong = {
      start: s ? undefined : "Pick a month and type the year.",
      end: still || e ? (s && e && e < s ? "The end comes before the start." : undefined) : "Pick a month and type the year, or tick Still on this break.",
    };
    setProblems(wrong);
    if (wrong.start || wrong.end || !s || saving) return;
    setSaving(true);
    void onSave({ start: s, ...(e ? { end: e } : {}), reason: reason.trim(), choice, into }).then((problem) => {
      setSaving(false);
      if (problem) setProblems({ save: problem });
    });
  };
  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    save();
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || ev.defaultPrevented || (ev.target instanceof Element && ev.target.closest("[role=listbox], [role=dialog]"))) return;
    ev.preventDefault();
    onCancel();
  };

  useBar(
    small
      ? {
          kind: "actions",
          actions: (
            <>
              <Button size="lg" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="lg" variant="primary" className="flex-1" loading={saving} loadingLabel="Saving" detail="Saves the break to your record, approved as you gave it." note="Free" onClick={save}>
                Save
              </Button>
            </>
          ),
        }
      : null,
  );

  return (
    <form noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-5 px-4 py-5 md:px-8">
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <MonthYear label="Start" value={start} onChange={setStart} error={problems.start} autoFocus />
        <MonthYear label="End" value={end} onChange={setEnd} error={problems.end} disabled={still} />
      </div>
      <Checkbox label="Still on this break" checked={still} onChange={setStill} />
      <Field label="Reason (optional)" hint="Shows on resumes only when you choose Show with reason.">
        {(p) => <Input {...p} className="max-w-[480px]" placeholder="Moving, family, study, time off…" value={reason} onChange={(ev) => setReason(ev.target.value)} />}
      </Field>
      <div className="max-w-[480px]">
        <OnResumes
          draft={{ roleKey, start: s ?? undefined, end: e ?? undefined, reason: reason.trim() || undefined }}
          choice={choice}
          into={into}
          disabled={choosable}
          onChange={(c, side) => {
            setChoice(c);
            if (side) setInto(side);
          }}
        />
      </div>
      {problems.save && <ErrorLine>{problems.save}</ErrorLine>}
      {!small && (
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" keys="↵" loading={saving} loadingLabel="Saving" detail="Saves the break to your record, approved as you gave it." note="Free">
            Save
          </Button>
          <Button variant="ghost" keys="Esc" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}

// A month and year under one label: the month picked, the year typed.
function MonthYear({ label, value, onChange, error, disabled = false, autoFocus = false }: { label: string; value: Month; onChange: (m: Month) => void; error?: string; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-label leading-label font-medium text-text">{label}</legend>
      <div className="flex gap-2">
        <Select label={`${label} month`} placeholder="Month" value={value.month || undefined} options={MONTH_OPTIONS} disabled={disabled} onChange={(month) => onChange({ ...value, month })} />
        <div className="w-22 shrink-0">
          <Input
            aria-label={`${label} year`}
            aria-invalid={error ? true : undefined}
            placeholder="Year"
            inputMode="numeric"
            maxLength={4}
            autoFocus={autoFocus}
            disabled={disabled}
            value={value.year}
            onChange={(ev) => onChange({ ...value, year: ev.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>
      {error && !disabled && <ErrorLine>{error}</ErrorLine>}
    </fieldset>
  );
}
