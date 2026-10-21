import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Finding } from "../../../convex/findCompanies";

// What Find companies would run on the way companies are found (findCompanies.ts) and about what it costs, what the
// last search found, and how a company found by the web search reads in its row.

type Data = FunctionReturnType<typeof api.discovery.list>;
type Company = Data["companies"][number];

// The way companies are found, the Brave key, what the web search has cost a direction so far (estimates.costs:
// findRelevant, findHiringNow; null before the first) and the AI budget left this month (null: no budget set).
export type FindSetup = {
  finding: Finding;
  braveKey: boolean;
  relevantUsd: number | null;
  hiringNowUsd: number | null;
  aiLeft: { left: number; monthly: number } | null;
};

const usd = (n: number) => (n < 0.01 ? "under $0.01" : `$${n.toFixed(2)}`);
export const credits = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "credit" : "credits"}`;

// Apollo: two searches per direction with approved criteria (one more when it has titles to look for hiring companies),
// lookalike searches of up to five of the companies you like that find more like them (shared by every direction), of
// up to five a direction adds on its own (directions adding the same ones share them) and of up to five targets (when
// learning from ratings), a lookup for those not yet looked up, and every company you like, added by the hundred. The
// web search: a search for companies that fit each direction and, when it has titles, one for companies
// hiring now, at what each has cost on average; with a Brave key, a job-board search for each of its first titles. AI
// only looks up the companies to add on their own websites, for free.
export type FindEstimate = {
  // Each direction's searches: Apollo credits (null: Apollo isn't searched) and dollars (null: no web search, or no cost
  // known yet).
  searches: { name: string; credits: number | null; usd: number | null }[];
  seeds: number;
  targets: number;
  named: number;
  credits: number;
  usd: number | null;
  boardSearches: number;
  apollo: boolean;
  web: boolean;
};
export function findEstimate(data: Pick<Data, "likes" | "searchable">, setup: FindSetup): FindEstimate {
  const apollo = setup.finding !== "web";
  const web = setup.finding !== "apollo";
  const liked = data.likes.filter((l) => l.like);
  const lookups = liked.filter((l) => !l.lookup).length + data.searchable.flatMap((d) => d.ownSeeds ?? []).length;
  const batchesOf = (sets: string[][]) => [...new Set(sets.map((s) => s.join(",")))].reduce((n, set) => n + Math.ceil((set ? set.split(",").length : 0) / 5), 0);
  // The ones every direction finds more like are searched once for every direction; a direction's own come on top,
  // batched on their own.
  const global = liked.map((l) => l.domain);
  const seedBatches = (data.searchable.length ? Math.ceil(global.length / 5) : 0) + batchesOf(data.searchable.map((d) => (d.ownSeeds ?? []).map((s) => s.domain).filter((s) => !global.includes(s))));
  const seeds = apollo ? seedBatches + (lookups ? 1 : 0) : 0;
  const targets = apollo ? batchesOf(data.searchable.map((d) => d.targets)) : 0;
  const named = apollo ? Math.ceil(data.likes.length / 100) : 0;
  const webUsd = (hasTitles: boolean) => (setup.relevantUsd === null || (hasTitles && setup.hiringNowUsd === null) ? null : setup.relevantUsd + (hasTitles ? (setup.hiringNowUsd ?? 0) : 0));
  const searches = data.searchable.map((d) => ({ name: d.name, credits: apollo ? 2 + (d.hasTitles ? 1 : 0) : null, usd: web ? webUsd(d.hasTitles) : null }));
  const totalCredits = searches.reduce((n, s) => n + (s.credits ?? 0), 0) + seeds + targets + named;
  const totalUsd = web && searches.every((s) => s.usd !== null) ? searches.reduce((n, s) => n + (s.usd ?? 0), 0) : null;
  const boardSearches = web && setup.braveKey ? data.searchable.reduce((n, d) => n + d.boardQueries, 0) : 0;
  return { searches, seeds, targets, named, credits: totalCredits, usd: totalUsd, boardSearches, apollo, web };
}

// A search's cost in its row: its credits, what it costs from the AI budget, or both.
export function searchCost(s: FindEstimate["searches"][number]) {
  return [s.credits !== null ? credits(s.credits) : null, s.usd !== null ? usd(s.usd) : null].filter(Boolean).join(" · ") || "AI budget";
}

// The whole search's cost beside the button: Apollo credits, dollars from the AI budget, or both.
export function totalCost(e: FindEstimate) {
  const apollo = `About ${e.credits.toLocaleString("en-US")} Apollo ${e.credits === 1 ? "credit" : "credits"}`;
  if (!e.web) return apollo;
  if (!e.apollo) return e.usd === null ? "Uses your AI budget" : `About ${usd(e.usd)}`;
  return e.usd === null ? `${apollo} and your AI budget` : `${apollo}, ${usd(e.usd)}`;
}

// What the AI budget has left, under the cost on AI only.
export const aiLeftLine = (left: { left: number; monthly: number }) => `${usd(Math.max(0, left.left))} of $${left.monthly.toLocaleString("en-US")} left this month`;

type ApolloReport = {
  direction: string;
  large?: { found: number; added: number };
  criteria: { found: number; added: number; total: number | null };
  hiring: { found: number; added: number; total: number | null } | null;
  lookalikes: { seeds: string[]; found: number; added: number }[];
};
type WebReport = { direction: string; relevant: { found: number; added: number }; hiringNow: { found: number; added: number; fromJobBoards: number } };
type Named = { found: number; added: number; missing: string[] } | null;
export type FindResult = {
  finding?: Finding;
  report: ApolloReport[];
  named?: Named;
  seedsNotInApollo?: string[];
  web?: { report: WebReport[]; named: Named; notes: string[] };
};

// The last search, a line a direction, then the companies they named and seeds Apollo didn't know; and what the web
// search couldn't do (notes: job boards it didn't search), said apart as a caution.
export function lastSearch(r: FindResult): { lines: string[]; notes: string[] } {
  const web = new Map((r.web?.report ?? []).map((w) => [w.direction, w]));
  const apolloLines = r.report.map((a) => {
    const w = web.get(a.direction);
    const more = w ? w.relevant.found + w.hiringNow.found : 0;
    return [
      `${a.direction}: ${a.criteria.found} from its criteria${a.criteria.total !== null ? ` (of ${a.criteria.total.toLocaleString("en-US")} in Apollo)` : ""}, ${a.criteria.added} new`,
      a.large ? `; ${a.large.found} large companies, ${a.large.added} new` : "",
      a.hiring ? `; ${a.hiring.found} hiring for its titles, ${a.hiring.added} new` : "",
      (a.lookalikes ?? []).map((l) => (l.found ? `; ${l.found} like ${l.seeds.join(", ")}` : `; none like ${l.seeds.join(", ")} in Apollo`)).join(""),
      w ? `; ${more} more from the web search, ${w.relevant.added + w.hiringNow.added} new` : "",
    ].join("");
  });
  // AI only: no Apollo report, the web search's alone.
  const webLines = r.report.length
    ? []
    : (r.web?.report ?? []).map((w) => `${w.direction}: ${w.relevant.found} that fit, ${w.relevant.added} new${w.hiringNow.found ? `; ${w.hiringNow.found} hiring now, ${w.hiringNow.added} new` : ""}`);
  const named = r.named ?? null;
  // Apollo looks the named companies up by website; AI only reads each one's name from its own site.
  const aiOnly = r.finding === "web";
  const namedLine = named && `Companies you added: ${named.found} found, ${named.added} new${named.missing.length ? `; ${aiOnly ? "no name found on their website" : "not in Apollo"}: ${named.missing.join(", ")}` : ""}`;
  const seeds = (r.seedsNotInApollo ?? []).length ? `Not in Apollo, so none found like them: ${r.seedsNotInApollo!.join(", ")}` : null;
  return { lines: [...apolloLines, ...webLines, ...(namedLine ? [namedLine] : []), ...(seeds ? [seeds] : [])], notes: r.web?.notes ?? [] };
}

// A company's line in the list: what it does once filled in; before that its website, and how the web search found it
// ("Fits, web search").
export function rowLine(c: Pick<Company, "details" | "domain" | "ways">) {
  if (c.details?.summary) return c.details.summary;
  if (!c.domain) return "No website yet";
  const ways = c.ways.join("; ");
  return ways ? `${c.domain} · ${ways.charAt(0).toUpperCase()}${ways.slice(1)}` : c.domain;
}
