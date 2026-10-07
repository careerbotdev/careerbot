"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Field";
import { Select, type SelectOption } from "@/components/Select";
import { monthLabel, readMonth, type Role } from "./words";

// A role's details as a form: edited in place in the Details column, or filled in to add a role. Dates are months
// ("May 2021"); an empty End means it's current. ↵ saves from any field, Esc cancels.

export type Placement = "own" | "previous" | "next" | "out";
export type RoleChange = { employer: string; title: string; alternateTitles: string[]; start: string; end: string; location: string; change: "none" | "promotion" | "transition" };
type Texts = { employer: string; title: string; also: string; start: string; end: string; location: string; change: RoleChange["change"] };

const STARTED: SelectOption<RoleChange["change"]>[] = [
  { value: "none", label: "First role here" },
  { value: "promotion", label: "Promotion" },
  { value: "transition", label: "Role change" },
];

const textsOf = (r?: Role): Texts => ({
  employer: r?.data.employer ?? "",
  title: r?.data.title ?? "",
  also: (r?.data.alternateTitles ?? []).join(", "),
  start: r?.data.start ? monthLabel(r.data.start) : "",
  end: r?.data.end ? monthLabel(r.data.end) : "",
  location: r?.data.location ?? "",
  change: r?.data.change === "promotion" || r?.data.change === "transition" ? r.data.change : "none",
});

export function RoleForm({
  role,
  placement,
  onSave,
  onCancel,
  saveLabel = "Save",
  className = "",
}: {
  role?: Role;
  // On resumes: the choices and the one in effect, for a role in the record.
  placement?: { value: Placement; options: SelectOption<Placement>[]; reason?: string };
  onSave: (change: RoleChange, placement?: Placement) => void;
  onCancel: () => void;
  saveLabel?: string;
  className?: string;
}) {
  const [t, setT] = useState<Texts>(() => textsOf(role));
  const [place, setPlace] = useState<Placement | undefined>(placement?.value);
  const [checked, setChecked] = useState(false);
  const start = readMonth(t.start);
  const end = readMonth(t.end);
  const problems = {
    employer: t.employer.trim() ? undefined : "Give the employer.",
    title: t.title.trim() ? undefined : "Give the official title.",
    start: "problem" in start ? start.problem : undefined,
    end: "problem" in end ? end.problem : undefined,
  };
  const set = (k: keyof Texts) => (e: { target: { value: string } }) => setT({ ...t, [k]: e.target.value });

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    setChecked(true);
    if (Object.values(problems).some(Boolean) || "problem" in start || "problem" in end) return;
    onSave(
      {
        employer: t.employer.trim(),
        title: t.title.trim(),
        alternateTitles: t.also.split(",").map((x) => x.trim()).filter(Boolean),
        start: start.value ?? "",
        end: end.value ?? "",
        location: t.location.trim(),
        change: t.change,
      },
      place,
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  const error = (k: keyof typeof problems) => (checked ? problems[k] : undefined);

  return (
    <form aria-label={role ? "Role details" : "New role"} onSubmit={save} onKeyDown={onKeyDown} className={`flex flex-col gap-3.5 ${className}`}>
      <Field label="Employer" error={error("employer")}>
        {(p) => <Input {...p} autoFocus value={t.employer} onChange={set("employer")} placeholder="Company" />}
      </Field>
      <Field label="Official title" error={error("title")}>
        {(p) => <Input {...p} value={t.title} onChange={set("title")} placeholder="As the employer gave it" />}
      </Field>
      <Field label="Also called">
        {(p) => <Input {...p} value={t.also} onChange={set("also")} placeholder="Other names, with commas" />}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start" error={error("start")}>
          {(p) => <Input {...p} value={t.start} onChange={set("start")} placeholder="May 2021" />}
        </Field>
        <Field label="End" error={error("end")}>
          {(p) => <Input {...p} value={t.end} onChange={set("end")} placeholder="Now" />}
        </Field>
      </div>
      <Field label="Location">
        {(p) => <Input {...p} value={t.location} onChange={set("location")} placeholder="City, state or remote" />}
      </Field>
      {role && <Field label="How this role started">{() => <Select label="How this role started" value={t.change} onChange={(change) => setT({ ...t, change })} options={STARTED} className="w-full" />}</Field>}
      {placement && (
        <Field label="On resumes">
          {() => <Select label="On resumes" value={place} onChange={setPlace} options={placement.options} reason={placement.reason} disabled={!!placement.reason} className="w-full" />}
        </Field>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" keys="↵" detail={role ? "Saves these details. Your corrections count as approved." : "Adds this role to your record, approved as you give it."} note="Free">
          {saveLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
