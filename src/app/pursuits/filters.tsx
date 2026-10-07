"use client";

import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type Clearance,
  CLEARANCES,
  clearanceLabel,
  EMPLOYMENT_LABELS,
  EMPLOYMENT_TYPES,
  type EmploymentType,
  LEVELS,
  type Seniority,
  seniorityLabel,
  type Setup,
  SETUP_LABELS,
  SETUPS,
} from "../../../convex/roleDetails";
import type { RoleFilters } from "../../../convex/roles";
import { Checkbox } from "@/components/Checkbox";
import { Combobox } from "@/components/Combobox";
import { type Filter, FilterOptions } from "@/components/FilterBar";
import { MultiSelect } from "@/components/MultiSelect";
import { NumberField } from "@/components/NumberField";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ToggleGroup } from "@/components/ToggleGroup";

// The role filters of All roles and Interested, as the chips of the filter bar. Each filter a role may not state keeps
// the roles that don't say unless they untick it. The clearance and visa filters start from their firm eligibility
// limits, and again whenever those change.

export type Overview = FunctionReturnType<typeof api.roles.overview>;

export type Form = {
  minScore: number | null;
  scoreUnknown: boolean;
  minPay: number | null;
  payUnknown: boolean;
  location: string;
  locationUnknown: boolean;
  setups: Setup[];
  setupUnknown: boolean;
  days: number | null;
  daysUnknown: boolean;
  companies: "all" | "targets" | "maybes" | "pick";
  companyIds: Id<"companies">[];
  seniority: Seniority[];
  seniorityUnknown: boolean;
  maxYears: number | null;
  yearsUnknown: boolean;
  types: EmploymentType[];
  typesUnknown: boolean;
  rating: "default" | "interested" | "unrated" | "no";
  maxTravel: number | null;
  travelUnknown: boolean;
  clearance: Clearance | "any";
  clearanceUnknown: boolean;
  visa: boolean;
  visaUnknown: boolean;
};

export const EMPTY: Form = {
  minScore: null, scoreUnknown: true, minPay: null, payUnknown: true, location: "", locationUnknown: true, setups: [...SETUPS], setupUnknown: true, days: null, daysUnknown: true,
  companies: "all", companyIds: [], seniority: [], seniorityUnknown: true, maxYears: null, yearsUnknown: true, types: [], typesUnknown: true, rating: "default",
  maxTravel: null, travelUnknown: true, clearance: "any", clearanceUnknown: true, visa: false, visaUnknown: true,
};

const SETUP_ORDER: Setup[] = ["onsite", "hybrid", "remote"];
const PRESETS = ["7", "30", "90"] as const;

export function toFilters(f: Form): RoleFilters {
  return {
    ...(f.minScore !== null ? { minScore: { value: f.minScore, unknown: f.scoreUnknown } } : {}),
    ...(f.minPay !== null ? { minPay: { value: f.minPay, unknown: f.payUnknown } } : {}),
    ...(f.location.trim() ? { locations: { value: [f.location.trim()], unknown: f.locationUnknown } } : {}),
    ...(f.setups.length < SETUPS.length ? { setups: { value: f.setups, unknown: f.setupUnknown } } : {}),
    ...(f.days !== null ? { postedWithinDays: { value: Math.round(f.days), unknown: f.daysUnknown } } : {}),
    ...(f.companies === "targets" || f.companies === "maybes" ? { companies: f.companies } : f.companies === "pick" && f.companyIds.length ? { companies: f.companyIds } : {}),
    ...(f.seniority.length ? { seniority: { value: f.seniority, unknown: f.seniorityUnknown } } : {}),
    ...(f.maxYears !== null ? { maxYears: { value: f.maxYears, unknown: f.yearsUnknown } } : {}),
    ...(f.types.length ? { employmentTypes: { value: f.types, unknown: f.typesUnknown } } : {}),
    ...(f.rating !== "default" ? { rating: f.rating } : {}),
    ...(f.maxTravel !== null ? { maxTravel: { value: f.maxTravel, unknown: f.travelUnknown } } : {}),
    ...(f.clearance !== "any" ? { clearance: { value: f.clearance, unknown: f.clearanceUnknown } } : {}),
    ...(f.visa ? { visa: { unknown: f.visaUnknown } } : {}),
  };
}

// The form, and the filters it makes once typing pauses. `company`: a company asked for in the address (?company=),
// which the Company filter starts on.
export function useRoleForm(overview: Overview | undefined, company: string | null) {
  const [form, setForm] = useState<Form>(() => (company ? { ...EMPTY, companies: "pick", companyIds: [company as Id<"companies">] } : EMPTY));
  const [seeded, setSeeded] = useState<string | null>(null);
  const fromLimits = overview ? JSON.stringify(overview.fromLimits) : null;
  if (overview && fromLimits !== seeded) {
    setSeeded(fromLimits);
    setForm((f) => ({ ...f, clearance: overview.fromLimits.clearance ?? "any", clearanceUnknown: true, visa: overview.fromLimits.visa, visaUnknown: true }));
  }
  const [asked, setAsked] = useState(company);
  if (company !== asked) {
    setAsked(company);
    if (company) setForm((f) => ({ ...f, companies: "pick", companyIds: [company as Id<"companies">] }));
  }
  const wanted = JSON.stringify(toFilters(form));
  const [filters, setFilters] = useState<RoleFilters>(() => JSON.parse(wanted) as RoleFilters);
  useEffect(() => {
    const t = setTimeout(() => setFilters(JSON.parse(wanted) as RoleFilters), 300);
    return () => clearTimeout(t);
  }, [wanted]);
  // What the form starts as for them: nothing but their limits.
  const start: Form = { ...EMPTY, clearance: overview?.fromLimits.clearance ?? "any", visa: overview?.fromLimits.visa ?? false };
  return { form, setForm, filters, start };
}

const Unknown = ({ label = "Include roles that don’t say", checked, onChange }: { label?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <Checkbox label={label} checked={checked} onChange={onChange} />
);

function Editor({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 p-2">{children}</div>;
}

const money = (n: number) => `$${Math.round(n / 1000)}k`;
const listOf = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, 2).join(", ")} +${xs.length - 2}` : xs.join(", "));

// Every role filter as a chip of the filter bar: what it's set to, its editor, and how it clears. `rating` off leaves out
// the Rating filter (under Interested, which is a rating).
export function roleFilters({ form, setForm, start, overview, places, rating }: { form: Form; setForm: (f: Form) => void; start: Form; overview: Overview; places: { value: string; label: string }[]; rating: boolean }): Filter[] {
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const reset = (...keys: (keyof Form)[]) => () => setForm({ ...form, ...Object.fromEntries(keys.map((k) => [k, start[k]])) });
  const companyName = (id: string) => overview.companies.find((c) => c.id === id)?.name ?? "";
  const filters: (Filter | null)[] = [
    {
      id: "score",
      label: "Score at least",
      value: form.minScore !== null ? String(form.minScore) : undefined,
      onClear: reset("minScore", "scoreUnknown"),
      editor: (
        <Editor>
          <NumberField label="Score at least" value={form.minScore} min={0} max={100} onChange={(v) => set({ minScore: v })} />
          <Unknown checked={form.scoreUnknown} onChange={(v) => set({ scoreUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "pay",
      label: "Pay at least",
      value: form.minPay !== null ? money(form.minPay) : undefined,
      onClear: reset("minPay", "payUnknown"),
      editor: (
        <Editor>
          <NumberField label="Pay at least, per year" currency step={5000} value={form.minPay} onChange={(v) => set({ minPay: v })} />
          <Unknown label="Include roles that don’t list pay" checked={form.payUnknown} onChange={(v) => set({ payUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "location",
      label: "Location",
      value: form.location.trim() || undefined,
      onClear: reset("location", "locationUnknown"),
      editor: (
        <Editor>
          <Combobox label="Location" value={form.location} onChange={(v) => set({ location: v })} options={[{ value: "", label: "Any place" }, ...places]} placeholder="Any place" searchPlaceholder="City, state or country" custom />
          <Unknown checked={form.locationUnknown} onChange={(v) => set({ locationUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "setup",
      label: "Work setup",
      value: form.setups.length < SETUPS.length ? listOf(SETUP_ORDER.filter((s) => form.setups.includes(s)).map((s) => SETUP_LABELS[s])) || "None" : undefined,
      onClear: reset("setups", "setupUnknown"),
      editor: (
        <Editor>
          <ToggleGroup label="Work setup" value={form.setups} onChange={(v) => set({ setups: v })} options={SETUP_ORDER.map((s) => ({ value: s, label: SETUP_LABELS[s] }))} />
          <Unknown label="Include roles that don’t say how" checked={form.setupUnknown} onChange={(v) => set({ setupUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "posted",
      label: "Posted within",
      value: form.days !== null ? `${form.days} days` : undefined,
      onClear: reset("days", "daysUnknown"),
      editor: (
        <Editor>
          <SegmentedControl label="Posted within" value={PRESETS.find((p) => Number(p) === form.days) ?? null} onChange={(v) => set({ days: Number(v) })} options={PRESETS.map((p) => ({ value: p, label: `${p} days` }))} />
          <NumberField label="Or days" unit="days" min={1} value={form.days} onChange={(v) => set({ days: v })} />
          <Unknown checked={form.daysUnknown} onChange={(v) => set({ daysUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "company",
      label: "Company",
      value: form.companies === "targets" ? "Targets" : form.companies === "maybes" ? "Maybes" : form.companies === "pick" && form.companyIds.length ? listOf(form.companyIds.map(companyName)) : undefined,
      onClear: reset("companies", "companyIds"),
      editor: (
        <Editor>
          <FilterOptions
            label="Company"
            multiple={false}
            selected={[form.companies]}
            onChange={([v]) => set({ companies: v as Form["companies"] })}
            options={[{ value: "all", label: "All companies" }, { value: "targets", label: "Targets" }, { value: "maybes", label: "Maybes" }, { value: "pick", label: "Choose companies" }]}
          />
          {form.companies === "pick" && <MultiSelect label="Companies" value={form.companyIds} onChange={(v) => set({ companyIds: v })} options={overview.companies.map((c) => ({ value: c.id, label: c.name }))} />}
        </Editor>
      ),
    },
    {
      id: "seniority",
      label: "Seniority",
      value: form.seniority.length ? listOf(form.seniority.map(seniorityLabel)) : undefined,
      onClear: reset("seniority", "seniorityUnknown"),
      editor: (
        <Editor>
          <FilterOptions label="Seniority" selected={form.seniority} onChange={(v) => set({ seniority: v as Seniority[] })} options={LEVELS.map((l) => ({ value: l, label: seniorityLabel(l) }))} />
          <Unknown checked={form.seniorityUnknown} onChange={(v) => set({ seniorityUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "years",
      label: "Years asked",
      value: form.maxYears !== null ? `At most ${form.maxYears}` : undefined,
      onClear: reset("maxYears", "yearsUnknown"),
      editor: (
        <Editor>
          <NumberField label="Years asked, at most" unit="years" min={0} value={form.maxYears} onChange={(v) => set({ maxYears: v })} />
          <Unknown checked={form.yearsUnknown} onChange={(v) => set({ yearsUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "type",
      label: "Employment type",
      value: form.types.length ? listOf(form.types.map((t) => EMPLOYMENT_LABELS[t])) : undefined,
      onClear: reset("types", "typesUnknown"),
      editor: (
        <Editor>
          <FilterOptions label="Employment type" selected={form.types} onChange={(v) => set({ types: v as EmploymentType[] })} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_LABELS[t] }))} />
          <Unknown checked={form.typesUnknown} onChange={(v) => set({ typesUnknown: v })} />
        </Editor>
      ),
    },
    rating
      ? {
          id: "rating",
          label: "Rating",
          value: { default: undefined, interested: "Interested", unrated: "Not rated", no: "Not for me" }[form.rating],
          onClear: reset("rating"),
          editor: (
            <FilterOptions
              label="Rating"
              multiple={false}
              selected={[form.rating]}
              onChange={([v]) => set({ rating: v as Form["rating"] })}
              options={[{ value: "default", label: "All but Not for me" }, { value: "interested", label: "Interested" }, { value: "unrated", label: "Not rated" }, { value: "no", label: "Not for me" }]}
            />
          ),
        }
      : null,
    {
      id: "travel",
      label: "Travel",
      value: form.maxTravel !== null ? `At most ${form.maxTravel}%` : undefined,
      onClear: reset("maxTravel", "travelUnknown"),
      editor: (
        <Editor>
          <NumberField label="Travel, at most" unit="%" min={0} max={100} value={form.maxTravel} onChange={(v) => set({ maxTravel: v })} />
          <Unknown checked={form.travelUnknown} onChange={(v) => set({ travelUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "clearance",
      label: "Clearance",
      value: form.clearance === "any" ? undefined : form.clearance === "none" ? "None held" : `${clearanceLabel(form.clearance)} held`,
      onClear: () => set({ clearance: "any", clearanceUnknown: true }),
      editor: (
        <Editor>
          <FilterOptions
            label="Clearance you hold"
            multiple={false}
            selected={[form.clearance]}
            onChange={([v]) => set({ clearance: v as Form["clearance"] })}
            options={[{ value: "any", label: "Any" }, ...CLEARANCES.map((c) => ({ value: c, label: c === "none" ? "None held" : `${clearanceLabel(c)} held` }))]}
          />
          <Unknown checked={form.clearanceUnknown} onChange={(v) => set({ clearanceUnknown: v })} />
        </Editor>
      ),
    },
    {
      id: "visa",
      label: "Visa sponsorship",
      value: form.visa ? "Sponsors a visa" : undefined,
      onClear: () => set({ visa: false, visaUnknown: true }),
      editor: (
        <Editor>
          <Checkbox label="Only roles that sponsor a visa" checked={form.visa} onChange={(v) => set({ visa: v })} />
          <Unknown checked={form.visaUnknown} onChange={(v) => set({ visaUnknown: v })} />
        </Editor>
      ),
    },
  ];
  return filters.filter((f): f is Filter => f !== null);
}
