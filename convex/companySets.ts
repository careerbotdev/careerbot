import type { Lens } from "./lens";

// Which found companies still wait on them, shared by the Companies page and Review. Pure, so the browser can use it.
// Open: an employer (not screened out) they haven't made a target or passed on. A misfit: when goals hide misfits, one
// the goals judgment says doesn't fit, that they haven't kept anyway and didn't name themselves.

export type Rateable = {
  screened: { employer: boolean } | null;
  rating: "excited" | "maybe" | "no" | null;
  goals: { level: "fits" | "partly" | "doesnt" | "unknown"; keep?: boolean } | null;
  named: boolean;
  fit: { level: "strong" | "some" | "weak" | "none" }[];
};

const isMisfit = (c: Rateable, judge: Lens["judge"]) => judge === "hide" && c.goals?.level === "doesnt" && !c.goals.keep && !c.named;

// Goals first when judged, then best fit.
export function companyScore(c: Rateable, judge: Lens["judge"]) {
  const goals = judge === "off" || !c.goals ? 1 : { fits: 3, partly: 2, unknown: 1, doesnt: 0 }[c.goals.level];
  return goals * 10 + Math.max(-1, ...c.fit.map((f) => ({ strong: 3, some: 2, weak: 1, none: 0 })[f.level]));
}

// The open employers, best first, and the misfits set aside from them.
export function openCompanies<C extends Rateable>(companies: C[], judge: Lens["judge"]) {
  const open = companies.filter((c) => c.screened?.employer !== false && c.rating !== "excited" && c.rating !== "no");
  return {
    employers: open.filter((c) => !isMisfit(c, judge)).sort((a, b) => companyScore(b, judge) - companyScore(a, judge)),
    misfits: open.filter((c) => isMisfit(c, judge)),
  };
}

// What Review asks them to decide: open employers they haven't rated yet, best first, then every misfit (Keep anyway or
// Not for me).
export function companiesToRate<C extends Rateable>(companies: C[], judge: Lens["judge"]) {
  const { employers, misfits } = openCompanies(companies, judge);
  return [...employers.filter((c) => c.rating === null).map((c) => ({ company: c, misfit: false })), ...misfits.map((c) => ({ company: c, misfit: true }))];
}
