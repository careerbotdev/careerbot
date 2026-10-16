import { type CompanySort, openCompanies, sortCompanies } from "../../../convex/companySets";
import type { Lens } from "../../../convex/lens";
import type { Company, Tab } from "./env";

// Why a company is set aside: its goals don't fit (and they haven't kept it), they passed on it, or it isn't a place to
// work (a recruiter, a job board, and the like).
export type AsideKind = "goals" | "no" | "out";
export const ASIDE: Record<AsideKind, { label: string; note: string }> = {
  goals: { label: "Doesn’t fit your goals", note: "Outside what your goals ask for. Keep any you want." },
  no: { label: "Not for me", note: "Ones you passed on, with your reasons." },
  out: { label: "Not a place to work", note: "Staffing agencies, job boards and others that don’t hire for themselves." },
};

export type Sets = { targets: Company[]; maybe: Company[]; found: Company[]; aside: Record<AsideKind, Company[]>; archived: Company[] };

// The tabs, from the shared grouping Review uses: Targets and Maybe are theirs; Found is the open employers they haven't
// rated; Set aside holds goals misfits they haven't rated, the ones they passed on, and the ones that aren't places to
// work (whatever the rating); Archived holds what they archived, out of every other tab. Targets, Maybe, Found and
// Archived are each sorted whole by `sort`.
export function companySets(companies: Company[], judge: Lens["judge"], sort: CompanySort = "best"): Sets {
  const employer = (c: Company) => c.screened?.employer !== false;
  const shown = companies.filter((c) => !c.archived);
  const { employers, misfits } = openCompanies(shown, judge);
  return {
    targets: sortCompanies(shown.filter((c) => employer(c) && c.rating === "excited"), sort, judge),
    maybe: sortCompanies(shown.filter((c) => employer(c) && c.rating === "maybe"), sort, judge),
    found: sortCompanies(employers.filter((c) => c.rating === null), sort, judge),
    aside: {
      goals: misfits.filter((c) => c.rating === null),
      no: shown.filter((c) => employer(c) && c.rating === "no"),
      out: shown.filter((c) => !employer(c)),
    },
    archived: sortCompanies(companies.filter((c) => c.archived), sort, judge),
  };
}

// Where a company is listed.
export function tabOf(sets: Sets, id: string): Tab | null {
  for (const tab of ["targets", "maybe", "found", "archived"] as const) if (sets[tab].some((c) => c.id === id)) return tab;
  return Object.values(sets.aside).some((list) => list.some((c) => c.id === id)) ? "aside" : null;
}

// Where an archived company was, and goes back to when restored: its tab as if it weren't archived.
export const archivedFrom = (c: Company, judge: Lens["judge"]) => tabOf(companySets([{ ...c, archived: null }], judge), c.id);

export function asideKind(sets: Sets, id: string): AsideKind | null {
  return (Object.keys(ASIDE) as AsideKind[]).find((k) => sets.aside[k].some((c) => c.id === id)) ?? null;
}
