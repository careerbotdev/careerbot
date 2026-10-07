import { companyScore, openCompanies } from "../../../convex/companySets";
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

export type Sets = { targets: Company[]; maybe: Company[]; found: Company[]; aside: Record<AsideKind, Company[]> };

// The four tabs, from the shared grouping Review uses: Targets and Maybe are theirs (best fit first); Found is the open
// employers they haven't rated, best first; Set aside holds goals misfits they haven't rated, the ones they passed on,
// and the ones that aren't places to work (whatever the rating).
export function companySets(companies: Company[], judge: Lens["judge"]): Sets {
  const employer = (c: Company) => c.screened?.employer !== false;
  const best = (list: Company[]) => [...list].sort((a, b) => companyScore(b, judge) - companyScore(a, judge));
  const { employers, misfits } = openCompanies(companies, judge);
  return {
    targets: best(companies.filter((c) => employer(c) && c.rating === "excited")),
    maybe: best(companies.filter((c) => employer(c) && c.rating === "maybe")),
    found: employers.filter((c) => c.rating === null),
    aside: {
      goals: misfits.filter((c) => c.rating === null),
      no: companies.filter((c) => employer(c) && c.rating === "no"),
      out: companies.filter((c) => !employer(c)),
    },
  };
}

// Where a company is listed.
export function tabOf(sets: Sets, id: string): Tab | null {
  for (const tab of ["targets", "maybe", "found"] as const) if (sets[tab].some((c) => c.id === id)) return tab;
  return Object.values(sets.aside).some((list) => list.some((c) => c.id === id)) ? "aside" : null;
}

export function asideKind(sets: Sets, id: string): AsideKind | null {
  return (Object.keys(ASIDE) as AsideKind[]).find((k) => sets.aside[k].some((c) => c.id === id)) ?? null;
}
