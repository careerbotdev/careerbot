"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CONDITION_LABELS, CONDITIONS, LIMIT_BUCKETS, type LimitBucket, RULE_FIELDS, type RuleField, cap, cleanRule, countryName, countryNameList } from "../../../../convex/limitBuckets";
import { Button } from "@/components/Button";
import { ErrorLine, Field, Input, Textarea } from "@/components/Field";
import { MultiSelect } from "@/components/MultiSelect";
import { NumberField } from "@/components/NumberField";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { useBar } from "../../shell/ShellContext";
import { Notice } from "../ui";
import { clashWith, conditionsOf, effectLong, type Effects, type Limit } from "./words";

// One form for a limit, to change it (Save and approve) or to add one (its kind first): the sentence, how firm, the
// directions it applies to, its rule's fields, when it holds, and what it would do with these values, counted as you
// go. ⌘↵ saves, Esc cancels. `focus` puts the cursor in one rule field (a value clicked in the Rule section).

type Firmness = "firm" | "preference";
const FIRMNESS = [
  { value: "firm" as const, label: "Firm" },
  { value: "preference" as const, label: "Preference" },
];
const KINDS = Object.entries(LIMIT_BUCKETS).map(([value, label]) => ({ value: value as LimitBucket, label }));
// Every country once, by its English name.
const COUNTRIES = [...new Map(countryNameList().map(([, code]) => [code, { value: code, label: countryName(code) }])).values()].sort((a, b) => a.label.localeCompare(b.label));

type FormProps = {
  target: { limit: Limit } | { kind: LimitBucket };
  limits: Limit[];
  directions: string[];
  effects: Effects | undefined;
  focus: string | null;
  small: boolean;
  onSaved: (id: Id<"items">) => void;
  onCancel: () => void;
};

export function LimitForm({ target, limits, directions, effects, focus, small, onSaved, onCancel }: FormProps) {
  const limit = "limit" in target ? target.limit : null;
  const kind = "limit" in target ? target.limit.data.kind : target.kind;
  const updateLimit = useMutation(api.goals.updateLimit);
  const addLimit = useMutation(api.goals.addLimit);
  const rule = useRuleDraft(kind, (limit?.data.rule ?? {}) as Record<string, unknown>);
  const [value, setValue] = useState(limit?.data.value ?? "");
  const [firm, setFirm] = useState<Firmness>(limit?.data.firm === false ? "preference" : "firm");
  const [scope, setScope] = useState<string[]>(limit?.data.appliesTo ?? []);
  const [when, setWhen] = useState<string[]>(limit ? conditionsOf(limit.data) : []);
  const [error, setError] = useState<{ on: "value" | "form"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // What these values would do, asked again a moment after they stop changing.
  const built = rule.build();
  const draft = { ...(limit ? { id: limit.id } : {}), kind, firm: firm === "firm", rule: cleanRule(kind, built), appliesTo: scope, when };
  const key = JSON.stringify(draft);
  const [asked, setAsked] = useState(key);
  useEffect(() => {
    const t = window.setTimeout(() => setAsked(key), 400);
    return () => window.clearTimeout(t);
  }, [key]);
  const probe = useQuery(api.goals.effects, { draft: JSON.parse(asked) as typeof draft });
  const now = limit ? effects?.limits.find((l) => l.id === limit.id)?.fails : undefined;
  const clash = clashWith(limits, { id: limit?.id, kind, appliesTo: scope, when });

  const save = () => {
    if (saving) return;
    const given = Object.keys(built).length > 0;
    if (!value.trim() && (limit || !given)) {
      setError({ on: "value", text: "Say what the limit is." });
      return;
    }
    setError(null);
    setSaving(true);
    const done = limit
      ? updateLimit({ id: limit.id, value, firm: firm === "firm", rule: built, appliesTo: scope, when }).then(() => limit.id)
      : addLimit({ kind, value, firm: firm === "firm", ...(given ? { rule: built } : {}), appliesTo: scope, when });
    void done.then((id) => {
      toast({ message: limit ? "Saved and approved" : "Added and approved", icon: "approve" });
      onSaved(id);
    }, (e: unknown) => {
      setSaving(false);
      setError({ on: "form", text: e instanceof ConvexError ? String(e.data) : "Couldn’t save that. Check the rule’s values." });
    });
  };

  // ⌘↵ saves from anywhere in the form, caught before a list inside it would take Enter as a pick. Esc cancels unless a
  // list or menu inside the form took it first to close itself.
  const latest = useRef({ save, onCancel });
  useEffect(() => {
    latest.current = { save, onCancel };
  });
  useEffect(() => {
    const onSave = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current.save();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target instanceof Element && e.target.closest("[role=dialog], [role=alertdialog], [role=menu], [role=listbox]"))) return;
      e.preventDefault();
      latest.current.onCancel();
    };
    window.addEventListener("keydown", onSave, true);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onSave, true);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    const box = root.current;
    const at = focus ? box?.querySelector(`[data-field="${focus}"]`) : null;
    const target = (at ?? box)?.querySelector<HTMLElement>("textarea, input, button");
    target?.focus();
    at?.scrollIntoView({ block: "center" });
    // Only as the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = limit ? "Save and approve" : "Add and approve";
  const detail = limit ? "Saves your changes and approves the limit as it reads now." : "Adds the limit, approved, and filters roles by it from now on.";
  const note = limit ? "Free" : "Free · Undo by deleting it";
  useBar(
    small
      ? {
          kind: "actions",
          actions: (
            <>
              <Button size="lg" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="lg" variant="primary" className="flex-1" loading={saving} loadingLabel="Saving" detail={detail} note={note} onClick={save}>
                {label}
              </Button>
            </>
          ),
        }
      : null,
  );

  const draftEffect = probe?.draft;
  return (
    <div ref={root} className="flex flex-col gap-5">
      <Field label="Limit" error={error?.on === "value" ? error.text : undefined} hint={limit ? undefined : "In your words. Leave it empty to word it from the rule’s values."}>
        {(p) => <Textarea rows={2} value={value} onChange={(e) => setValue(e.target.value)} {...p} />}
      </Field>
      <SegmentedControl label="How firm" value={firm} onChange={setFirm} options={FIRMNESS} />
      <MultiSelect label="Applies to" value={scope} onChange={setScope} options={[...new Set([...directions, ...scope])].map((d) => ({ value: d, label: d }))} empty="Every direction" />
      {clash && (
        <Notice tone="caution" title={`Clashes with ${clash.limit.data.label}`}>
          {`Both apply to ${clash.shared.length ? clash.shared.join(", ") : "every direction"}${conditionsOf(clash.limit.data).length ? " under the same condition" : ""}. Keep one of them for ${clash.shared.length === 1 ? "that direction" : "those directions"}, or set Only when on one.`}
        </Notice>
      )}
      <RuleInputs r={rule} />
      <div className="max-w-sm">
        <MultiSelect label="Only when" value={when} onChange={setWhen} options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))} empty="Always" />
      </div>
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 border-t pt-4 text-body-sm leading-body-sm">
        <span className="font-medium text-text">With these values</span>
        <span className="text-muted tabular-nums">
          {draftEffect ? effectLong(firm === "firm", draftEffect.fails) : "Counting…"}
          {now !== undefined && ` · now ${now.toLocaleString("en-US")}`}
        </span>
      </p>
      {error?.on === "form" && <ErrorLine>{error.text}</ErrorLine>}
      {!small && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" keys="⌘↵" loading={saving} loadingLabel="Saving" detail={detail} note={note} onClick={save}>
            {label}
          </Button>
          <Button keys="Esc" detail="Leaves the limit as it was." onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// Add a limit: its kind first, then the same form as Edit.
export function AddLimit(props: Omit<FormProps, "target" | "focus">) {
  const [kind, setKind] = useState<LimitBucket | undefined>();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex max-w-sm flex-col gap-1.5">
        <span className="text-label leading-label font-medium text-text">Kind</span>
        <Select label="Kind" placeholder="Choose a kind…" value={kind} onChange={setKind} options={KINDS} />
      </div>
      {kind ? <LimitForm key={kind} {...props} target={{ kind }} focus={null} /> : <KindOnly small={props.small} onCancel={props.onCancel} />}
    </div>
  );
}

// Before a kind is chosen: only the way out.
function KindOnly({ small, onCancel }: { small: boolean; onCancel: () => void }) {
  useBar(small ? { kind: "actions", actions: <Button size="lg" className="flex-1" onClick={onCancel}>Cancel</Button> } : null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  if (small) return null;
  return (
    <Button className="self-start" keys="Esc" onClick={onCancel}>
      Cancel
    </Button>
  );
}

// A rule's fields as they're edited, one typed value per field, starting from the rule saved; build() gives the rule
// (fields left empty are left out; a place keeps the coordinates it had).
type Draft = Record<string, string | number | null | string[]>;

type RuleDraft = { kind: string; fields: RuleField[]; draft: Draft; set: (key: string, x: Draft[string]) => void; build: () => Record<string, unknown> };

function useRuleDraft(kind: string, start: Record<string, unknown>): RuleDraft {
  const fields = useMemo(() => RULE_FIELDS[kind as LimitBucket] ?? [], [kind]);
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      fields.map((f) => {
        const x = start[f.key];
        if (f.type === "set" || f.type === "names" || f.type === "countries") return [f.key, Array.isArray(x) ? (x as string[]) : []];
        if (f.type === "number") return [f.key, typeof x === "number" ? x : null];
        if (f.type === "bool") return [f.key, typeof x === "boolean" ? String(x) : ""];
        if (f.type === "places") return [f.key, Array.isArray(x) ? (x as { place: string; miles?: number }[]).map((p) => (p.miles ? `${p.place} @ ${p.miles}` : p.place)).join("; ") : ""];
        return [f.key, typeof x === "string" ? x : ""];
      }),
    ),
  );
  const set = (k: string, x: Draft[string]) => setDraft((d) => ({ ...d, [k]: x }));
  const build = (): Record<string, unknown> =>
    Object.fromEntries(
      fields.flatMap((f): [string, unknown][] => {
        const x = draft[f.key];
        if (Array.isArray(x)) return x.length ? [[f.key, x]] : [];
        if (x === null || x === "") return [];
        if (f.type === "bool") return [[f.key, x === "true"]];
        if (f.type === "places") {
          const old: { place: string }[] = Array.isArray(start.places) ? start.places : [];
          const places = String(x)
            .split(";")
            .map((p) => {
              const [place, miles] = p.split("@").map((i) => i.trim());
              return { ...old.find((q) => q.place === place), place, ...(miles ? { miles: Number(miles) } : {}) };
            })
            .filter((p) => p.place);
          return places.length ? [[f.key, places]] : [];
        }
        return [[f.key, x]];
      }),
    );
  return { kind, fields, draft, set, build };
}

function RuleInputs({ r: { kind, fields, draft, set } }: { r: RuleDraft }) {
  const opt = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x === "individual" ? "Individual contributor" : cap(x) }));
  const input = (f: RuleField) => {
    const x = draft[f.key];
    switch (f.type) {
      case "set":
        return <MultiSelect label={f.label} value={x as string[]} onChange={(v) => set(f.key, v)} options={opt(f.options)} empty="Any" />;
      case "names":
        return <MultiSelect custom label={f.label} value={x as string[]} onChange={(v) => set(f.key, v)} options={(x as string[]).map((n) => ({ value: n, label: n }))} empty="None" />;
      case "countries":
        return <MultiSelect custom label={f.label} value={x as string[]} onChange={(v) => set(f.key, v)} options={COUNTRIES} empty="Any" />;
      case "enum":
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-label leading-label font-medium text-text">{f.label}</span>
            <Select label={f.label} value={(x as string) || "unset"} onChange={(v) => set(f.key, v === "unset" ? "" : v)} options={[{ value: "unset", label: "Not set" }, ...opt(f.options)]} />
          </div>
        );
      case "bool":
        return <SegmentedControl label={f.label} value={(x as string) || "unset"} onChange={(v) => set(f.key, v === "unset" ? "" : v)} options={[{ value: "unset", label: "Not set" }, { value: "true", label: "Yes" }, { value: "false", label: "No" }]} />;
      case "number": {
        const money = kind === "pay" && (f.key === "min" || f.key === "max");
        return <NumberField label={f.label} value={x as number | null} onChange={(v) => set(f.key, v)} min={f.min} max={f.max} step={money ? 5000 : 1} currency={money} unit={f.key.toLowerCase().includes("percent") ? "%" : undefined} hint={f.hint} />;
      }
      case "places":
        return (
          <Field label={f.label} hint={f.hint ? `Austin, TX @ 25; … (${f.hint})` : "Austin, TX @ 25; …"}>
            {(p) => <Input value={x as string} onChange={(e) => set(f.key, e.target.value)} {...p} />}
          </Field>
        );
    }
  };
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} data-field={f.key} className={f.type === "set" || f.type === "names" || f.type === "countries" ? "" : "max-w-sm"}>
          {input(f)}
        </div>
      ))}
    </>
  );
}
