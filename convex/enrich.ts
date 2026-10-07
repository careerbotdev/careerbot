import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { modelFor } from "./aiSettings";
import { activeLimits, itemsOf } from "./itemShapes";
import { chatJson } from "./metering";
import { listOf, orNull, type ReplySchema, replyOf, strictObject, string } from "./replyJson";
import { braveKeyFor } from "./braveKey";
import type { BoardProvider } from "./boardProviders";
import { countryCode, countryName, countryNameList } from "./limitBuckets";
import { cleanDetails, type Details } from "./roleDetails";
import { DEFAULT_LENS } from "./lens";
import { apollo } from "./metering";
import { origin } from "./schema";
import { dayOf, tally } from "./tallies";
import { requireWorkspace } from "./workspaces";
import { learns, toDomain } from "./discovery";
import { screenCompanies } from "./screening";

// Fills in companies from free sources before any paid enrichment: the company's own website (what they say they build)
// and its public job board (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Breezy, Personio, Rippling, Gem, Workable, Recruitee, BambooHR,
// Pinpoint, Teamtailor, Jobvite, iCIMS, Oracle Recruiting Cloud, JazzHR or Dover) (how many roles are open, and which match a direction's
// titles). A short AI summary of what they build is written from the site text only. No Apollo credits.
// Runs in batches; each batch schedules the next until every place-to-work company has details.

const BATCH = 40;
// Fit is judged for every direction at once, so replies are long: 40 companies ran into the model's ~16k-token reply limit.
const FIT_BATCH = 15;
// The companies they turned down that fit judging reads, latest first.
const TURNED_DOWN_MAX = 40;
const TIMEOUT_MS = 8000;

export type Board = { provider: BoardProvider; slug: string; url: string; foundBy?: string };
// One role on a board. externalId is the board's own id for it (its link when the board has none); postedAt when the
// board says. description is plain text, set only by boards whose listing carries it ("" when the listing has none).
// facts: the details the board states in its own fields (pay, setup, employment type...), set only when it states any.
// applyUrl: the board's own application link, when it gives one apart from the role's page (Lever, Ashby, Workable, Recruitee).
export type Job = { title: string; url: string; applyUrl?: string; location?: string; remote: boolean; externalId: string; postedAt?: number; description?: string; facts?: Details };

// Only plain public hostnames are fetched: no IP literals, localhost or internal names, and every redirect is checked
// the same way before it's followed. (DNS names that resolve to private addresses can't be checked from here.)
export function publicHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return false;
  if (/^\d+(\.\d+){3}$/.test(h) || h.includes(":")) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|invalid|test)$/.test(h) && !h.endsWith(".arpa");
}

async function get(url: string, accept = "text/html", timeoutMs = TIMEOUT_MS): Promise<Response | null> {
  let next = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(next);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || !publicHost(u.hostname)) return null;
    try {
      const res = await fetch(u, { headers: { accept, "user-agent": "CareerBot/1.0 (+https://careerbot.dev)" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        next = new URL(res.headers.get("location")!, u).toString();
        continue;
      }
      return res.ok ? res : null;
    } catch {
      return null;
    }
  }
  return null;
}

// A page read through Jina Reader (r.jina.ai): its text and links as Markdown, or "" if that fails too.
// Used only when a direct request is turned away. Pages behind hard bot checks still fail.
export async function viaReader(url: string): Promise<string> {
  // It loads the page first, so it gets longer than a direct request.
  const res = await get(`https://r.jina.ai/${url}`, "text/plain", 25000);
  const md = res ? await res.text().catch(() => "") : "";
  // The reader passes on the site's own refusal as a warning instead of failing.
  return /Target URL returned error [45]\d\d/.test(md.slice(0, 600)) ? "" : md;
}

// Visible text and meta description of a page, without scripts, styles or markup.
export function pageText(html: string) {
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1];
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { description: meta?.trim(), text: text.slice(0, 2500) };
}

// Job board links on a page, e.g. boards.greenhouse.io/acme, jobs.lever.co/acme, jobs.ashbyhq.com/acme.
export function boardsIn(html: string): Board[] {
  const out: Board[] = [];
  const add = (provider: Board["provider"], slug: string) => {
    const s = provider === "workday" || provider === "smartrecruiters" || provider === "oracle" ? slug : (slug ?? "").toLowerCase();
    if (s && !["embed", "api", "v1", "jobs"].includes(s) && !out.some((b) => b.provider === provider && b.slug === s)) out.push({ provider, slug: s, url: "" });
  };
  for (const m of html.matchAll(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/gi)) add("greenhouse", m[1]);
  for (const m of html.matchAll(/jobs\.lever\.co\/([a-z0-9_-]+)/gi)) add("lever", m[1]);
  for (const m of html.matchAll(/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/gi)) add("ashby", m[1]);
  // Workday: tenant, data center and site make the board, e.g. nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite.
  for (const m of html.matchAll(/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/g))
    if (!["wday", "en-US"].includes(m[3])) add("workday", `${m[1]}|${m[2]}|${m[3]}`);
  for (const m of html.matchAll(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9]+)/g)) add("smartrecruiters", m[1]);
  for (const m of html.matchAll(/([a-z0-9-]+)\.breezy\.hr/gi)) if (m[1] !== "www" && m[1] !== "app") add("breezy", m[1]);
  for (const m of html.matchAll(/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/gi)) add("personio", m[1]);
  for (const m of html.matchAll(/ats\.rippling\.com\/([a-z0-9-]+)/gi)) if (m[1] !== "api") add("rippling", m[1]);
  for (const m of html.matchAll(/jobs\.gem\.com\/([a-z0-9_-]+)/gi)) add("gem", m[1]);
  // Workable: apply.workable.com/acme, or the older acme.workable.com.
  for (const m of html.matchAll(/apply\.workable\.com\/([a-z0-9_-]+)/gi)) if (m[1] !== "j") add("workable", m[1]);
  for (const m of html.matchAll(/\/\/([a-z0-9-]+)\.workable\.com/gi)) if (!["www", "apply", "jobs", "help", "resources"].includes(m[1].toLowerCase())) add("workable", m[1]);
  for (const m of html.matchAll(/([a-z0-9-]+)\.recruitee\.com/gi)) if (!["www", "app", "api", "support", "blog"].includes(m[1].toLowerCase())) add("recruitee", m[1]);
  for (const m of html.matchAll(/([a-z0-9-]+)\.bamboohr\.com\/(?:careers|jobs|js\/embed)/gi)) if (m[1].toLowerCase() !== "www") add("bamboohr", m[1]);
  for (const m of html.matchAll(/([a-z0-9-]+)\.pinpointhq\.com/gi)) if (!["www", "app", "api", "developers", "help"].includes(m[1].toLowerCase())) add("pinpoint", m[1]);
  for (const m of html.matchAll(/([a-z0-9-]+)\.teamtailor\.com/gi)) if (!["www", "app", "api", "cdn", "support", "docs", "status", "partner"].includes(m[1].toLowerCase())) add("teamtailor", m[1]);
  for (const m of html.matchAll(/jobs\.jobvite\.com\/(?:careers\/)?([a-z0-9_-]+)/gi)) add("jobvite", m[1]);
  // iCIMS: the whole subdomain is the board, e.g. careers-gdms.icims.com/jobs.
  for (const m of html.matchAll(/([a-z0-9-]+)\.icims\.com\/jobs/gi)) if (m[1].toLowerCase() !== "www") add("icims", m[1]);
  // Oracle Recruiting Cloud: host and career site make the board, e.g. jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001.
  for (const m of html.matchAll(/([a-z0-9-]+\.fa(?:\.[a-z0-9-]+)?\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[A-Za-z-]+\/sites\/([A-Za-z0-9_]+)/g)) add("oracle", `${m[1]}|${m[2]}`);
  for (const m of html.matchAll(/([a-z0-9-]+)\.applytojob\.com/gi)) if (!["www", "app", "search"].includes(m[1].toLowerCase())) add("jazzhr", m[1]);
  // Dover: app.dover.com/jobs/acme, or a careers page by its id, app.dover.com/Acme/careers/<id>.
  for (const m of html.matchAll(/app\.dover\.com\/(?:jobs\/([a-z0-9_-]+)|[^/\s"'<>]+\/careers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/gi)) add("dover", m[1] ?? m[2]);
  return out;
}

export type Read = { board: Board; jobs: Job[]; total?: number; searched?: boolean };

// Workday and Oracle list a page at a time, so they're read differently: the total count once, then a search for each target title.
// Workday reports at most 2,000 as its total.
let titlesToSearch: string[] = [];
// Boards searched per title (Workday, Oracle): free, but one request each.
const SEARCH_TITLES = 20;
export function interleave(lists: string[][]): string[] {
  const out: string[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && !out.includes(l[i])) out.push(l[i]);
  return out;
}
export const setSearchTitles = (t: string[]) => (titlesToSearch = t);
async function readWorkday(b: Board): Promise<Read | null> {
  const [tenant, dc, site] = b.slug.split("|");
  const api = `https://${tenant}.${dc}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const post = async (searchText: string, offset = 0) => {
    try {
      const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      return r.ok ? ((await r.json()) as { total?: number; jobPostings?: { title: string; externalPath: string; locationsText?: string }[] }) : null;
    } catch {
      return null;
    }
  };
  if (!publicHost(`${tenant}.${dc}.myworkdayjobs.com`)) return null;
  const all = await post("");
  if (!all || typeof all.total !== "number") return null;
  const base = `https://${tenant}.${dc}.myworkdayjobs.com/${site}`;
  const seen = new Map<string, Job>();
  // Each title is searched, up to 3 pages of 20 (60 results per title), so a match isn't lost behind the first page.
  for (const t of titlesToSearch.slice(0, SEARCH_TITLES))
    for (let offset = 0; offset < 60; offset += 20) {
      const page = (await post(t, offset))?.jobPostings ?? [];
      for (const j of page) seen.set(j.externalPath, { title: j.title, url: base + j.externalPath, location: j.locationsText, remote: /remote/i.test(j.locationsText ?? ""), externalId: j.externalPath });
      if (page.length < 20) break;
    }
  return { board: { ...b, url: base }, jobs: [...seen.values()], total: all.total, searched: true };
}

// Oracle Recruiting Cloud: the total and first 200 once, then up to 60 results for each target title. Checked with JPMorgan Chase
// (jpmc.fa.oraclecloud.com, site CX_1001).
async function readOracle(b: Board): Promise<Read | null> {
  const [host, site] = b.slug.split("|");
  type Req = { Id: string; Title: string; PrimaryLocation?: string; PostedDate?: string };
  const find = async (finder: string) => {
    const body = await getJson<{ items?: { TotalJobsCount?: number; requisitionList?: Req[] }[] }>(`https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${site},${finder}`);
    return body?.items?.[0] ?? null;
  };
  const all = await find("limit=200,offset=0");
  if (!all || typeof all.TotalJobsCount !== "number") return null;
  const base = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}`;
  const seen = new Map<string, Job>();
  const keep = (list: Req[] = []) => {
    for (const j of list) seen.set(j.Id, { title: j.Title, url: `${base}/job/${j.Id}`, location: j.PrimaryLocation, remote: /remote/i.test(j.PrimaryLocation ?? ""), externalId: j.Id, postedAt: toTime(j.PostedDate) });
  };
  keep(all.requisitionList);
  for (const t of titlesToSearch.slice(0, SEARCH_TITLES)) keep((await find(`keyword=${encodeURIComponent(t)},limit=60,offset=0`))?.requisitionList);
  return { board: { ...b, url: base }, jobs: [...seen.values()], total: all.TotalJobsCount, searched: true };
}

// iCIMS has no JSON listing, so its search page is read: 20 jobs a page, up to 10 pages. Past that, the total is worked out from
// the page count and the last page. Checked with General Dynamics Mission Systems (careers-gdms.icims.com).
async function readIcims(b: Board): Promise<Read | null> {
  const base = `https://${b.slug}.icims.com/jobs`;
  const page = async (n: number) => {
    const res = await get(`${base}/search?ss=1&in_iframe=1&pr=${n}`);
    return res ? await res.text().catch(() => "") : "";
  };
  const cards = (html: string): Job[] =>
    html.split('class="iCIMS_JobCardItem"').slice(1).flatMap((card) => {
      const a = card.match(/href="(https:\/\/[^"?]+\/jobs\/(\d+)\/[^"?]+\/job)[^"]*"[^>]*title="\d+ - ([^"]+)"/);
      if (!a) return [];
      const location = decode(card.match(/Job Locations?<\/span>[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/)?.[1] ?? "") || undefined;
      return [{ title: decode(a[3]), url: a[1], location, remote: /remote/i.test(location ?? ""), externalId: a[2] }];
    });
  const first = await page(0);
  if (!first.includes("iCIMS_JobsTable")) return null;
  const pages = Number(first.match(/Page 1 of (\d+)/)?.[1] ?? 1);
  const jobs = [first, ...(await Promise.all(Array.from({ length: Math.min(pages, 10) - 1 }, (_, i) => page(i + 1))))].flatMap(cards);
  const total = pages > 10 ? (pages - 1) * cards(first).length + cards(await page(pages - 1)).length : jobs.length;
  return { board: { ...b, url: `${base}/search?ss=1` }, jobs, total };
}

// Teamtailor's remote status; "temporary" (remote for now) says nothing lasting, so it's left out.
const TEAMTAILOR_SETUP: Record<string, string> = { fully: "remote", hybrid: "hybrid", none: "onsite" };
// Teamtailor's RSS feed lists every published job with its description, a page at a time. Checked with Polestar (polestar.teamtailor.com).
async function readTeamtailor(b: Board): Promise<Read | null> {
  const board = { ...b, url: `https://${b.slug}.teamtailor.com/jobs` };
  const seen = new Map<string, Job>();
  for (let offset = 0, n = 0; n < 10; n++) {
    const res = await get(`https://${b.slug}.teamtailor.com/jobs.rss${offset ? `?offset=${offset}` : ""}`, "application/rss+xml");
    const xml = res ? await res.text().catch(() => "") : "";
    if (!xml.includes("<rss")) {
      if (!offset) return null;
      break;
    }
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    // Stop when a page is empty or repeats (the feed ignored the offset).
    if (!items.length || seen.has(xmlTag(items[0], "guid") ?? "")) break;
    for (const x of items) {
      const location = [...x.matchAll(/<tt:name>([\s\S]*?)<\/tt:name>/g)].map((m) => decode(m[1])).join("; ") || undefined;
      const id = xmlTag(x, "guid") ?? xmlTag(x, "link") ?? "";
      const status = xmlTag(x, "remoteStatus");
      seen.set(id, { title: xmlTag(x, "title") ?? "", url: xmlTag(x, "link") ?? "", location, remote: status === "fully", externalId: id, postedAt: toTime(xmlTag(x, "pubDate")), description: htmlText(xmlTag(x, "description")), facts: facts({ setup: TEAMTAILOR_SETUP[status ?? ""] }) });
    }
    offset += items.length;
  }
  return { board, jobs: [...seen.values()].filter((j) => j.title) };
}

// A tag's text in an XML feed, without any CDATA wrapper and with escaped characters undone.
const xmlTag = (x: string, t: string) => {
  const v = x.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${t}>`))?.[1];
  return v === undefined ? undefined : decode(v);
};
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();

// Named characters job descriptions use; numbered ones are read as numbers.
const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", bull: "\u2022", middot: "\u00b7", copy: "\u00a9", reg: "\u00ae", trade: "\u2122", euro: "\u20ac", pound: "\u00a3",
};
const entities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });

// Descriptions are kept as plain text, up to this many characters.
const DESCRIPTION_CAP = 8000;
// Plain text as a board gives it, with tidy spacing and capped.
const clip = (s: string | undefined | null) =>
  (s ?? "").replace(/\u00a0/g, " ").split("\n").map((l) => l.replace(/[ \t\r\f\v]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, DESCRIPTION_CAP);
// A description's HTML as plain text: paragraphs and list items on their own lines, markup and comments gone.
export function htmlText(html: string | undefined | null) {
  let s = html ?? "";
  // Some boards (Greenhouse) send the HTML itself escaped.
  if (!/<[a-z][^>]*>/i.test(s) && /&lt;\/?[a-z]/i.test(s)) s = entities(s);
  s = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|table|section|article|header|blockquote)>/gi, "\n")
    // Inline markup can split a word ("<span>N</span>utanix"); anything else separates words.
    .replace(/<\/?(span|strong|b|em|i|u|a|font|sup|sub|small|mark)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");
  return clip(entities(s));
}
// A board's date as a time. "2026-09-18 13:27:28 UTC" is read as UTC; a number is taken as milliseconds. Unreadable dates are dropped.
function toTime(s: unknown): number | undefined {
  if (typeof s === "number") return s > 1e11 ? s : undefined;
  if (typeof s !== "string" || !s.trim()) return undefined;
  const t = Date.parse(s.trim().replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d(?::\d\d)?) ?UTC$/, "$1T$2Z"));
  return Number.isNaN(t) ? undefined : t;
}
async function getJson<T>(url: string): Promise<T | null> {
  const res = await get(url, "application/json");
  return res ? ((await res.json().catch(() => null)) as T | null) : null;
}
// Titled parts of a description, each as plain text; parts with no text are left out.
function sections(parts: [string | undefined | null, string | undefined | null][]) {
  return clip(
    parts
      .map(([title, html]) => [title?.trim(), htmlText(html)] as const)
      .filter(([, body]) => body)
      .map(([title, body]) => (title ? `${title}\n${body}` : body))
      .join("\n\n"),
  );
}

// ---- A role's details as the board states them in its own fields. Descriptions are never read for them (the AI does that). ----

// Details with valid values only; undefined when the board states none.
function facts(x: Record<string, unknown>): Details | undefined {
  const d = cleanDetails(x);
  return Object.keys(d).length ? d : undefined;
}
// A pay period from a board's word for it: "per-hour-wage", "YEAR", "month".
const periodOf = (s?: string | null) => s?.toLowerCase().match(/year|month|week|day|hour/)?.[0];
// An employment type from a board's word for it: "Full-time", "FullTime", "full_time", "FULL_TIME", "Intern", "Contractor", "Fixed-Term".
function employmentOf(s?: string | null) {
  const t = (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (/fixedterm|^temp/.test(t)) return "temporary";
  if (/^intern|^trainee/.test(t)) return "internship";
  if (/^contract|^freelance/.test(t)) return "contract";
  if (t.startsWith("fulltime")) return "full-time";
  if (t.startsWith("parttime")) return "part-time";
  return undefined;
}
// How a role is done when the board's word or place for it names one way only: "OnSite", "in_office", "Hybrid - London",
// "Remote Home-Based". "Remote or Hybrid" and "Office - Flexible" say nothing certain.
function setupOf(s?: string | null) {
  const said = (
    [
      ["remote", /remote/i],
      ["hybrid", /hybrid/i],
      ["onsite", /on[-_ ]?site|in[-_ ]office/i],
    ] as const
  ).filter(([, re]) => re.test(s ?? ""));
  return said.length === 1 ? said[0][0] : undefined;
}

type GreenhouseJob = { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string; content?: string; metadata?: { name?: string; value?: unknown }[] | null; pay_input_ranges?: { min_cents?: number | null; max_cents?: number | null; currency_type?: string; title?: string }[] };
// Greenhouse gives pay in cents, as ranges (one per place). Several: the lowest and highest of those in the first's currency
// and period. Hourly when titled so ("US Hourly Range") or under 1,000 (some boards list 30-45 USD as "US Salary Range").
// Employment type is a custom field, named by each company.
function greenhouseFacts(j: GreenhouseJob) {
  const ranges = (j.pay_input_ranges ?? [])
    .filter((r) => typeof r.min_cents === "number" || typeof r.max_cents === "number")
    .map((r) => ({
      min: typeof r.min_cents === "number" ? r.min_cents / 100 : undefined,
      max: typeof r.max_cents === "number" ? r.max_cents / 100 : undefined,
      currency: r.currency_type,
      period: /hour/i.test(r.title ?? "") || Math.max(r.min_cents ?? 0, r.max_cents ?? 0) < 100000 ? "hour" : "year",
    }));
  const same = ranges.filter((r) => r.currency === ranges[0].currency && r.period === ranges[0].period);
  const lows = same.flatMap((r) => r.min ?? []);
  const highs = same.flatMap((r) => r.max ?? []);
  const pay = same.length ? { min: lows.length ? Math.min(...lows) : undefined, max: highs.length ? Math.max(...highs) : undefined, currency: same[0].currency, period: same[0].period } : undefined;
  const type = j.metadata?.find((m) => /employment type|job type|time type/i.test(m.name ?? "") && typeof m.value === "string")?.value as string | undefined;
  return facts({ pay, setup: setupOf(j.location?.name), employmentType: employmentOf(type) });
}

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; allLocations?: string[] };
  workplaceType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  descriptionPlain?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
};
// Lever splits a description into an opening, titled lists and a closing.
const leverText = (j: LeverPosting) => sections([[null, j.descriptionPlain], ...(j.lists ?? []).map((l) => [l.text, l.content] as [string | undefined, string | undefined]), [null, j.additionalPlain]]);
// Pay interval "per-year-salary", "per-hour-wage"... ("one-time" isn't a rate); workplace "unspecified" says nothing.
// Checked against public Lever boards (one with pay, one with workplace and commitment).
const leverFacts = (j: LeverPosting) =>
  facts({ pay: j.salaryRange && { ...j.salaryRange, period: periodOf(j.salaryRange.interval) }, setup: j.workplaceType, employmentType: employmentOf(j.categories?.commitment), locations: j.categories?.allLocations });

export async function readBoard(b: Board): Promise<Read | null> {
  // Pay ranges ride along only on request (content=true would bring every description: a large board's is 41 MB).
  if (b.provider === "greenhouse") {
    const body = await getJson<{ jobs?: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?pay_transparency=true`);
    if (!body?.jobs) return null;
    return { board: { ...b, url: `https://boards.greenhouse.io/${b.slug}` }, jobs: body.jobs.map((j) => ({ title: j.title, url: j.absolute_url, location: j.location?.name, remote: /remote/i.test(j.location?.name ?? ""), externalId: j.id !== undefined ? String(j.id) : j.absolute_url, postedAt: toTime(j.first_published), facts: greenhouseFacts(j) })) };
  }
  // Lever's listing carries each full description. Checked against a public board (jobs.lever.co/<slug>).
  if (b.provider === "lever") {
    const body = await getJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
    if (!Array.isArray(body)) return null;
    return { board: { ...b, url: `https://jobs.lever.co/${b.slug}` }, jobs: body.map((j) => ({ title: j.text, url: j.hostedUrl, applyUrl: j.applyUrl, location: j.categories?.location, remote: j.workplaceType === "remote" || /remote/i.test(j.categories?.location ?? ""), externalId: j.id ?? j.hostedUrl, postedAt: toTime(j.createdAt), description: leverText(j), facts: leverFacts(j) })) };
  }
  if (b.provider === "workday") return readWorkday(b);
  // 100 a page, up to 10 pages. Checked with Bosch (jobs.smartrecruiters.com/BoschGroup).
  if (b.provider === "smartrecruiters") {
    type Page = { totalFound?: number; content?: { id: string; name: string; releasedDate?: string; location?: { city?: string; region?: string; remote?: boolean; hybrid?: boolean }; typeOfEmployment?: { label?: string } }[] };
    const first = await getJson<Page>(`https://api.smartrecruiters.com/v1/companies/${b.slug}/postings?limit=100`);
    if (!first?.content) return null;
    const content = [...first.content];
    for (let offset = 100; offset < Math.min(first.totalFound ?? 0, 1000); offset += 100) {
      const page = await getJson<Page>(`https://api.smartrecruiters.com/v1/companies/${b.slug}/postings?limit=100&offset=${offset}`);
      if (!page?.content?.length) break;
      content.push(...page.content);
    }
    return {
      board: { ...b, url: `https://jobs.smartrecruiters.com/${b.slug}` },
      total: first.totalFound,
      jobs: content.map((j) => ({
        title: j.name,
        url: `https://jobs.smartrecruiters.com/${b.slug}/${j.id}`,
        location: [j.location?.city, j.location?.region].filter(Boolean).join(", ") || undefined,
        remote: !!j.location?.remote,
        externalId: j.id,
        postedAt: toTime(j.releasedDate),
        // Neither remote nor hybrid, at a named city: on-site.
        facts: facts({ employmentType: employmentOf(j.typeOfEmployment?.label), setup: j.location?.remote ? "remote" : j.location?.hybrid ? "hybrid" : j.location?.remote === false && j.location.hybrid === false && j.location.city ? "onsite" : undefined }),
      })),
    };
  }
  // The verbose listing carries each description. Checked with Breezy's own trial board (breezy.breezy.hr).
  if (b.provider === "breezy") {
    const body = await getJson<{ id: string; name: string; url: string; published_date?: string; description?: string; location?: { name?: string; is_remote?: boolean } }[]>(`https://${b.slug}.breezy.hr/json?verbose=true`);
    if (!Array.isArray(body)) return null;
    return { board: { ...b, url: `https://${b.slug}.breezy.hr` }, jobs: body.map((j) => ({ title: j.name, url: j.url, location: j.location?.name, remote: !!j.location?.is_remote, externalId: j.id ?? j.url, postedAt: toTime(j.published_date), description: htmlText(j.description) })) };
  }
  // The XML feed carries each description in titled parts. Checked with Personio itself (personio.jobs.personio.de).
  if (b.provider === "personio") {
    const res = await get(`https://${b.slug}.jobs.personio.de/xml`, "application/xml");
    const xml = res ? await res.text().catch(() => "") : "";
    const positions = [...xml.matchAll(/<position>([\s\S]*?)<\/position>/g)].map((m) => m[1]);
    if (!xml.includes("<workzag-jobs")) return null;
    return {
      board: { ...b, url: `https://${b.slug}.jobs.personio.de` },
      jobs: positions
        .map((x) => {
          const id = xmlTag(x, "id") ?? "";
          const parts = [...x.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)].map((m) => [xmlTag(m[1], "name"), xmlTag(m[1], "value")] as [string | undefined, string | undefined]);
          return { title: xmlTag(x, "name") ?? "", url: `https://${b.slug}.jobs.personio.de/job/${id}`, location: xmlTag(x, "office"), remote: /remote/i.test(xmlTag(x, "office") ?? ""), externalId: id, postedAt: toTime(xmlTag(x, "createdAt")), description: sections(parts) };
        })
        .filter((j) => j.title),
    };
  }
  // 100 a page, up to 10 pages. A role open in several places is listed once per place, so the places are joined into
  // one role. Checked with Rippling itself (ats.rippling.com/rippling/jobs).
  if (b.provider === "rippling") {
    type Page = { totalItems?: number; totalPages?: number; items?: { id: string; name: string; url: string; locations?: { name?: string; workplaceType?: string }[] }[] };
    const first = await getJson<Page>(`https://ats.rippling.com/api/v2/board/${b.slug}/jobs?pageSize=100`);
    if (!first?.items) return null;
    const items = [...first.items];
    const pages = Math.min(first.totalPages ?? 1, 10);
    for (let page = 1; page < pages; page++) items.push(...((await getJson<Page>(`https://ats.rippling.com/api/v2/board/${b.slug}/jobs?pageSize=100&page=${page}`))?.items ?? []));
    const jobs = new Map<string, Job>();
    for (const j of items) {
      const id = j.id ?? j.url;
      const had = jobs.get(id);
      const places = [had?.location, ...(j.locations ?? []).map((l) => l.name)].filter(Boolean);
      // Each place says how it's worked (ON_SITE, HYBRID, REMOTE); the role has a setup only when all places agree.
      const setups = new Set([...(had ? [had.facts?.setup] : []), ...(j.locations ?? []).map((l) => setupOf(l.workplaceType))]);
      jobs.set(id, { title: j.name, url: j.url, location: [...new Set(places)].join("; ") || undefined, remote: !!had?.remote || !!j.locations?.some((l) => l.workplaceType === "REMOTE"), externalId: id, facts: facts({ setup: setups.size === 1 ? [...setups][0] : undefined }) });
    }
    // Past the pages read, the board's own count (one per place) says more are there.
    return { board: { ...b, url: `https://ats.rippling.com/${b.slug}/jobs` }, jobs: [...jobs.values()], ...((first.totalPages ?? 1) > pages ? { total: first.totalItems } : {}) };
  }
  if (b.provider === "oracle") return readOracle(b);
  if (b.provider === "icims") return readIcims(b);
  if (b.provider === "teamtailor") return readTeamtailor(b);
  // The listing carries each description. Checked with The Boring Company (jobs.gem.com/the-boring-company).
  if (b.provider === "gem") {
    const body = await getJson<{ id: string; title: string; absolute_url: string; first_published_at?: string; content_plain?: string; location?: { name?: string }; location_type?: string; employment_type?: string }[]>(`https://api.gem.com/job_board/v0/${b.slug}/job_posts`);
    if (!Array.isArray(body)) return null;
    return { board: { ...b, url: `https://jobs.gem.com/${b.slug}` }, jobs: body.map((j) => ({ title: j.title, url: j.absolute_url, location: j.location?.name, remote: j.location_type === "remote" || /remote/i.test(j.location?.name ?? ""), externalId: j.id ?? j.absolute_url, postedAt: toTime(j.first_published_at), description: clip(j.content_plain), facts: facts({ employmentType: employmentOf(j.employment_type), setup: setupOf(j.location_type) }) })) };
  }
  // Checked with Usercentrics (apply.workable.com/usercentrics).
  if (b.provider === "workable") {
    const body = await getJson<{ jobs?: { shortcode: string; title: string; url: string; application_url?: string; city?: string; state?: string; country?: string; telecommuting?: boolean; published_on?: string; employment_type?: string }[] }>(`https://apply.workable.com/api/v1/widget/accounts/${b.slug}`);
    if (!body?.jobs) return null;
    // A job open in several places is listed once per place, so the places are joined into one job.
    const jobs = new Map<string, Job>();
    for (const j of body.jobs) {
      const had = jobs.get(j.shortcode);
      const place = [j.city, j.state, j.country].filter(Boolean).join(", ");
      const remote = !!had?.remote || !!j.telecommuting;
      jobs.set(j.shortcode, { title: j.title, url: j.url, applyUrl: j.application_url, location: [had?.location, place].filter(Boolean).join("; ") || undefined, remote, externalId: j.shortcode, postedAt: toTime(j.published_on), facts: facts({ employmentType: employmentOf(j.employment_type), setup: remote ? "remote" : undefined }) });
    }
    return { board: { ...b, url: `https://apply.workable.com/${b.slug}` }, jobs: [...jobs.values()] };
  }
  // The listing carries each description and requirements. Pay amounts come as strings. Checked with Channable (channable.recruitee.com).
  if (b.provider === "recruitee") {
    type Offer = { id: number; title: string; careers_url: string; careers_apply_url?: string; location?: string; remote?: boolean; hybrid?: boolean; on_site?: boolean; published_at?: string; description?: string; requirements?: string; employment_type_code?: string; salary?: { min?: string | null; max?: string | null; period?: string | null; currency?: string | null } };
    const body = await getJson<{ offers?: Offer[] }>(`https://${b.slug}.recruitee.com/api/offers/`);
    if (!body?.offers) return null;
    return {
      board: { ...b, url: `https://${b.slug}.recruitee.com` },
      jobs: body.offers.map((j) => ({
        title: j.title,
        url: j.careers_url,
        applyUrl: j.careers_apply_url,
        location: j.location || undefined,
        remote: !!j.remote,
        externalId: j.id !== undefined ? String(j.id) : j.careers_url,
        postedAt: toTime(j.published_at),
        description: sections([[null, j.description], [null, j.requirements]]),
        facts: facts({ pay: j.salary, employmentType: employmentOf(j.employment_type_code), setup: j.remote ? "remote" : j.hybrid ? "hybrid" : j.on_site ? "onsite" : undefined }),
      })),
    };
  }
  // Checked with Scribd (scribd.bamboohr.com). Location type "0" is on-site, "1" remote, "2" hybrid; the employment status
  // label may carry more ("Full-Time Netherlands").
  if (b.provider === "bamboohr") {
    const body = await getJson<{
      meta?: { totalCount?: number };
      result?: { id: string; jobOpeningName: string; location?: { city?: string | null; state?: string | null }; atsLocation?: { country?: string | null }; isRemote?: boolean | null; locationType?: string | null; employmentStatusLabel?: string | null }[];
    }>(`https://${b.slug}.bamboohr.com/careers/list`);
    if (!body?.result) return null;
    return {
      board: { ...b, url: `https://${b.slug}.bamboohr.com/careers` },
      total: body.meta?.totalCount,
      jobs: body.result.map((j) => ({
        title: j.jobOpeningName,
        url: `https://${b.slug}.bamboohr.com/careers/${j.id}`,
        location: [j.location?.city, j.location?.state, j.atsLocation?.country].filter(Boolean).join(", ") || undefined,
        remote: !!j.isRemote || j.locationType === "1",
        externalId: String(j.id),
        facts: facts({ employmentType: employmentOf(j.employmentStatusLabel), setup: j.isRemote ? "remote" : ({ "0": "onsite", "1": "remote", "2": "hybrid" } as Record<string, string>)[j.locationType ?? ""] }),
      })),
    };
  }
  // The listing carries each description in titled parts, and pay where the company shows it. Checked with Pinpoint's own
  // board (workwithus.pinpointhq.com).
  if (b.provider === "pinpoint") {
    const body = await getJson<{
      data?: {
        id: string;
        title: string;
        url: string;
        location?: { name?: string; city?: string; province?: string };
        workplace_type?: string;
        employment_type?: string;
        compensation_visible?: boolean;
        compensation_minimum?: number | null;
        compensation_maximum?: number | null;
        compensation_currency?: string | null;
        compensation_frequency?: string | null;
        description?: string;
        key_responsibilities_header?: string;
        key_responsibilities?: string;
        skills_knowledge_expertise_header?: string;
        skills_knowledge_expertise?: string;
        benefits_header?: string;
        benefits?: string;
      }[];
    }>(`https://${b.slug}.pinpointhq.com/postings.json`);
    if (!body?.data) return null;
    return {
      board: { ...b, url: `https://${b.slug}.pinpointhq.com` },
      jobs: body.data.map((j) => ({
        title: j.title,
        url: j.url,
        location: [...new Set([j.location?.city, j.location?.province, j.location?.name].filter(Boolean))].join(", ") || undefined,
        remote: j.workplace_type === "remote",
        externalId: j.id !== undefined ? String(j.id) : j.url,
        description: sections([[null, j.description], [j.key_responsibilities_header, j.key_responsibilities], [j.skills_knowledge_expertise_header, j.skills_knowledge_expertise], [j.benefits_header, j.benefits]]),
        facts: facts({
          pay: j.compensation_visible ? { min: j.compensation_minimum, max: j.compensation_maximum, currency: j.compensation_currency, period: j.compensation_frequency } : undefined,
          employmentType: employmentOf(j.employment_type),
          setup: setupOf(j.workplace_type),
        }),
      })),
    };
  }
  // Jobvite has no JSON listing, so its jobs page is read. Checked against a public board (jobs.jobvite.com/<slug>).
  if (b.provider === "jobvite") {
    const res = await get(`https://jobs.jobvite.com/${b.slug}/jobs`);
    const html = res ? await res.text().catch(() => "") : "";
    if (!html.includes("jv-job-list")) return null;
    const jobs = html.split('class="jv-job-list-name"').slice(1).flatMap((row) => {
      const a = row.match(/href="(\/[^"]+\/job\/([A-Za-z0-9]+))"[^>]*>([^<]+)<\/a>/);
      if (!a) return [];
      const where = decode((row.match(/class="jv-job-list-location">([\s\S]*?)<\/td>/)?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      // A job in many places shows "21 Locations" instead of a place.
      return [{ title: decode(a[3]), url: `https://jobs.jobvite.com${a[1]}`, location: /^\d+ Locations$/i.test(where) ? undefined : where || undefined, remote: /remote/i.test(where), externalId: a[2] }];
    });
    return { board: { ...b, url: `https://jobs.jobvite.com/${b.slug}/jobs` }, jobs };
  }
  // JazzHR's job feed carries each description. Checked with the National Reconnaissance Office (nro.applytojob.com).
  if (b.provider === "jazzhr") {
    const res = await get(`https://app.jazz.co/feeds/export/jobs/${b.slug}`, "application/xml");
    const xml = res ? await res.text().catch(() => "") : "";
    if (!xml.includes("<publisher>JazzHR")) return null;
    const jobs = [...xml.matchAll(/<job>([\s\S]*?)<\/job>/g)].map((m) => {
      const location = [xmlTag(m[1], "city"), xmlTag(m[1], "state"), xmlTag(m[1], "country")].filter(Boolean).join(", ") || undefined;
      const url = xmlTag(m[1], "url") ?? "";
      return { title: xmlTag(m[1], "title") ?? "", url, location, remote: /remote/i.test(location ?? ""), externalId: xmlTag(m[1], "id") || url, postedAt: toTime(xmlTag(m[1], "original_open_date")), description: htmlText(xmlTag(m[1], "description")) };
    });
    return { board: { ...b, url: `https://${b.slug}.applytojob.com/apply` }, jobs: jobs.filter((j) => j.title) };
  }
  // Dover: the careers page is found by its name or id, then its jobs. Checked with Uplimit (app.dover.com/jobs/uplimit).
  if (b.provider === "dover") {
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(b.slug);
    const page = await getJson<{ id?: string; name?: string; slug?: string }>(`https://app.dover.com/api/v1/${byId ? "careers-page" : "careers-page-slug"}/${b.slug}`);
    if (!page?.id) return null;
    const groups = await getJson<{ jobs?: { id: string; title: string; is_published?: boolean; is_sample?: boolean; locations?: { name?: string; location_type?: string }[] }[] }[]>(`https://app.dover.com/api/v1/job-groups/${page.id}/job-groups`);
    if (!Array.isArray(groups)) return null;
    const name = encodeURIComponent(page.name ?? "");
    const jobs = new Map<string, Job>();
    for (const j of groups.flatMap((g) => g.jobs ?? []))
      if (j.is_published !== false && !j.is_sample)
        jobs.set(j.id, { title: j.title, url: `https://app.dover.com/apply/${name}/${j.id}`, location: j.locations?.map((l) => l.name).filter(Boolean).join("; ") || undefined, remote: !!j.locations?.some((l) => l.location_type === "REMOTE"), externalId: j.id });
    return { board: { ...b, url: page.slug ? `https://app.dover.com/jobs/${page.slug}` : `https://app.dover.com/${name}/careers/${page.id}` }, jobs: [...jobs.values()] };
  }
  // Ashby's listing carries each description, and pay where the company shows it: the summary's "Salary" part, paid per
  // "1 YEAR", "1 HOUR"... Checked with a large public board.
  type AshbyJob = {
    id: string;
    title: string;
    jobUrl: string;
    applyUrl?: string;
    location?: string;
    secondaryLocations?: { location?: string }[];
    isRemote?: boolean;
    isListed?: boolean;
    publishedAt?: string;
    descriptionPlain?: string;
    employmentType?: string;
    workplaceType?: string | null;
    compensation?: { summaryComponents?: { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number | null; maxValue?: number | null }[] };
  };
  const body = await getJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`);
  if (!body?.jobs) return null;
  return {
    board: { ...b, url: `https://jobs.ashbyhq.com/${b.slug}` },
    jobs: body.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
        const pay = salary && { min: salary.minValue, max: salary.maxValue, currency: salary.currencyCode, period: salary.interval?.match(/^1 (\w+)$/)?.[1].toLowerCase() };
        const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)];
        return { title: j.title, url: j.jobUrl, applyUrl: j.applyUrl, location: j.location, remote: !!j.isRemote, externalId: j.id ?? j.jobUrl, postedAt: toTime(j.publishedAt), description: clip(j.descriptionPlain), facts: facts({ pay, employmentType: employmentOf(j.employmentType), setup: setupOf(j.workplaceType), locations }) };
      }),
  };
}

export type Description = { text: string; postedAt?: number; facts?: Details };
type LdPosting = {
  "@type"?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  baseSalary?: { currency?: string; value?: number | { minValue?: number; maxValue?: number; value?: number; unitText?: string } };
};
// A JobPosting's description and date from a page's structured data (schema.org JSON-LD), when it has one, with the
// details it states: employment type (FULL_TIME...; one only), base pay per unitText (HOUR, YEAR...), TELECOMMUTE for remote.
function jsonLdPosting(html: string): Description | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const o = JSON.parse(m[1]) as LdPosting;
      if (o["@type"] !== "JobPosting") continue;
      // The salary's value is a range (QuantitativeValue) or a bare amount.
      const v = o.baseSalary?.value;
      const q: { minValue?: number; maxValue?: number; value?: number; unitText?: string } = v && typeof v === "object" ? v : { value: v };
      const types = [o.employmentType ?? []].flat();
      const pay = o.baseSalary && { min: q.minValue ?? q.value, max: q.maxValue ?? q.value, currency: o.baseSalary.currency, period: periodOf(q.unitText) };
      return { text: htmlText(o.description), postedAt: toTime(o.datePosted), facts: facts({ pay, employmentType: types.length === 1 ? employmentOf(types[0]) : undefined, setup: o.jobLocationType === "TELECOMMUTE" ? "remote" : undefined }) };
    } catch {
      // not readable; try the next block
    }
  }
  return null;
}
// A job page's HTML from the element that opens with `start` up to the next `end` marker, or "" when there's no such element.
function between(html: string, start: RegExp, end: string) {
  const i = html.search(start);
  if (i < 0) return "";
  const j = html.indexOf(end, i);
  return html.slice(html.indexOf(">", i) + 1, j > i ? j : i + 60000).replace(/<[^>]*$/, "");
}

// A posting's full description as plain text (up to 8,000 characters), with its posted date when the board gives it there.
// "" when the board has no description for it; null when it couldn't be read. Each was checked against the company named.
export async function readDescription(b: Board, job: { externalId: string; url: string }): Promise<Description | null> {
  const id = encodeURIComponent(job.externalId);
  switch (b.provider) {
    // Anthropic (boards.greenhouse.io/anthropic). The description comes as escaped HTML.
    case "greenhouse": {
      const r = await getJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs/${id}?pay_transparency=true`);
      return r && { text: htmlText(r.content), postedAt: toTime(r.first_published), facts: greenhouseFacts(r) };
    }
    // A public Lever board (jobs.lever.co/<slug>).
    case "lever": {
      const r = await getJson<LeverPosting>(`https://api.lever.co/v0/postings/${b.slug}/${id}`);
      return r && { text: leverText(r), postedAt: toTime(r.createdAt), facts: leverFacts(r) };
    }
    // NVIDIA (nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite). The id is the job's path on the board. Time type
    // "Full time"; remote type, where the company sets one, is its own words ("Remote Home-Based" at Salesforce).
    case "workday": {
      const [tenant, dc, site] = b.slug.split("|");
      if (!job.externalId.startsWith("/job/")) return null;
      const r = await getJson<{ jobPostingInfo?: { jobDescription?: string; startDate?: string; timeType?: string; remoteType?: string } }>(`https://${tenant}.${dc}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${job.externalId}`);
      const x = r?.jobPostingInfo;
      return x ? { text: htmlText(x.jobDescription), postedAt: toTime(x.startDate), facts: facts({ employmentType: employmentOf(x.timeType), setup: setupOf(x.remoteType) }) } : null;
    }
    // Bosch (jobs.smartrecruiters.com/BoschGroup).
    case "smartrecruiters": {
      const r = await getJson<{ releasedDate?: string; jobAd?: { sections?: Record<string, { title?: string; text?: string }> } }>(`https://api.smartrecruiters.com/v1/companies/${b.slug}/postings/${id}`);
      if (!r) return null;
      const s = r.jobAd?.sections ?? {};
      return { text: sections(["companyDescription", "jobDescription", "qualifications", "additionalInformation"].map((k) => [s[k]?.title, s[k]?.text])), postedAt: toTime(r.releasedDate) };
    }
    // Rippling (ats.rippling.com/rippling/jobs).
    case "rippling": {
      const r = await getJson<{ createdOn?: string; description?: { role?: string; company?: string } }>(`https://ats.rippling.com/api/v2/board/${b.slug}/jobs/${id}`);
      return r && { text: sections([[null, r.description?.role], [null, r.description?.company]]), postedAt: toTime(r.createdOn) };
    }
    // JPMorgan Chase (jpmc.fa.oraclecloud.com, site CX_1001).
    case "oracle": {
      const [host, site] = b.slug.split("|");
      const r = await getJson<{ items?: { ExternalDescriptionStr?: string; ExternalResponsibilitiesStr?: string; ExternalQualificationsStr?: string; ExternalPostedStartDate?: string }[] }>(
        `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${id}%22,siteNumber=${site}`,
      );
      const x = r?.items?.[0];
      return x ? { text: sections([[null, x.ExternalDescriptionStr], ["Responsibilities", x.ExternalResponsibilitiesStr], ["Qualifications", x.ExternalQualificationsStr]]), postedAt: toTime(x.ExternalPostedStartDate) } : null;
    }
    // General Dynamics Mission Systems (careers-gdms.icims.com): the job page's structured data.
    case "icims": {
      const res = await get(`${job.url}${job.url.includes("?") ? "&" : "?"}in_iframe=1`);
      const html = res ? await res.text().catch(() => "") : "";
      return html ? (jsonLdPosting(html) ?? { text: "" }) : null;
    }
    // A public Jobvite board (jobs.jobvite.com/<slug>): the description block on the job page.
    case "jobvite": {
      const res = await get(job.url);
      const html = res ? await res.text().catch(() => "") : "";
      return html ? { text: htmlText(between(html, /<div[^>]*class="jv-job-detail-description"/, "jv-job-detail-bottom-actions")) } : null;
    }
    // Breezy's own trial board (breezy.breezy.hr): the description block on the job page.
    case "breezy": {
      const res = await get(job.url);
      const html = res ? await res.text().catch(() => "") : "";
      return html ? { text: htmlText(between(html, /<div[^>]*class="description"/, 'class="apply-container"')) } : null;
    }
    // Usercentrics (apply.workable.com/usercentrics).
    case "workable": {
      const r = await getJson<{ published?: string; description?: string; requirements?: string; benefits?: string }>(`https://apply.workable.com/api/v2/accounts/${b.slug}/jobs/${id}`);
      return r && { text: sections([[null, r.description], ["Requirements", r.requirements], ["Benefits", r.benefits]]), postedAt: toTime(r.published) };
    }
    // Scribd (scribd.bamboohr.com).
    case "bamboohr": {
      const r = await getJson<{ result?: { jobOpening?: { description?: string; datePosted?: string } } }>(`https://${b.slug}.bamboohr.com/careers/${id}/detail`);
      const x = r?.result?.jobOpening;
      return x ? { text: htmlText(x.description), postedAt: toTime(x.datePosted) } : null;
    }
    // Uplimit (app.dover.com/jobs/uplimit).
    case "dover": {
      const r = await getJson<{ user_provided_description?: string; created?: string }>(`https://app.dover.com/api/v1/inbound/application-portal-job/${id}`);
      return r && { text: htmlText(r.user_provided_description), postedAt: toTime(r.created) };
    }
    // The Boring Company (jobs.gem.com/the-boring-company).
    case "gem": {
      const r = await getJson<{ content_plain?: string; first_published_at?: string }>(`https://api.gem.com/job_board/v0/${b.slug}/job_posts/${id}`);
      return r && { text: clip(r.content_plain), postedAt: toTime(r.first_published_at) };
    }
    // Apollo's postings carry no description.
    case "apollo":
      return { text: "" };
    // Ashby, Personio, Teamtailor, Recruitee, Pinpoint and JazzHR have no public data per job, but their listing carries
    // every description, so the listing is read again.
    default: {
      const r = await readBoard(b);
      if (!r) return null;
      const j = r.jobs.find((x) => x.externalId === job.externalId);
      return { text: j?.description ?? "", postedAt: j?.postedAt, facts: j?.facts };
    }
  }
}

// A job matches a target title when it contains the title's core words (seniority words don't count).
// Which countries a job's location names. Strong signs (a country or a well-known city) win over a two-letter
// region code, which is ambiguous (", IN" is Indiana or India).
const US_STRONG = /\b(united states|usa|u\.s\.a?\.?|us|america)\b|\b(new york|san francisco|seattle|austin|boston|chicago|denver|atlanta|los angeles|washington,? d\.?c|dallas|houston|miami|san jose|palo alto|mountain view|santa clara|sunnyvale|menlo park|redmond|san diego|phoenix|philadelphia|pittsburgh|raleigh|nashville|salt lake city|portland|minneapolis|detroit|columbus|arlington|mclean|reston|huntsville|el segundo|hawthorne|irvine)\b/i;
const US_WEAK = /(^|[,(\s-])(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])(\b|$)/;
const CITIES: Record<string, string> = {
  bengaluru: "IN", bangalore: "IN", hyderabad: "IN", pune: "IN", mumbai: "IN", delhi: "IN", gurgaon: "IN", gurugram: "IN", noida: "IN", chennai: "IN",
  london: "GB", manchester: "GB", edinburgh: "GB", cambridge: "GB", paris: "FR", berlin: "DE", munich: "DE", hamburg: "DE", jakarta: "ID", singapore: "SG",
  toronto: "CA", vancouver: "CA", montreal: "CA", ottawa: "CA", dublin: "IE", tokyo: "JP", sydney: "AU", melbourne: "AU", "tel aviv": "IL", amsterdam: "NL",
  zurich: "CH", "sao paulo": "BR", "são paulo": "BR", "mexico city": "MX", seoul: "KR", warsaw: "PL", krakow: "PL", bucharest: "RO", madrid: "ES", barcelona: "ES",
  stockholm: "SE", copenhagen: "DK", oslo: "NO", helsinki: "FI", lisbon: "PT", prague: "CZ", "buenos aires": "AR", bogota: "CO", manila: "PH", "ho chi minh": "VN",
  dubai: "AE", "abu dhabi": "AE", riyadh: "SA", shanghai: "CN", beijing: "CN", shenzhen: "CN", taipei: "TW", "hong kong": "HK", "kuala lumpur": "MY", bangkok: "TH",
};
// Names that are also US states or common words aren't treated as countries.
const NOT_COUNTRIES = new Set(["georgia", "jordan", "chad", "niger"]);
let countryPatterns: [RegExp, string][] | null = null;
export function jobCountries(loc: string): Set<string> {
  countryPatterns ??= countryNameList()
    .filter(([name]) => name.length > 3 && !NOT_COUNTRIES.has(name))
    .map(([name, code]) => [new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), code] as [RegExp, string]);
  const found = new Set<string>();
  for (const [re, code] of countryPatterns) if (re.test(loc)) found.add(code);
  const lower = (loc ?? "").toLowerCase();
  for (const [city, code] of Object.entries(CITIES)) if (new RegExp(`\\b${city}\\b`).test(lower)) found.add(code);
  if (/\b(uk|england|scotland|wales)\b/i.test(loc)) found.add("GB");
  if (US_STRONG.test(loc)) found.add("US");
  else if (!found.size && US_WEAK.test(loc)) found.add("US");
  return found;
}

// Where they said they'll work, from their approved Location limit: the countries, and whether remote is fine.
export type WorkArea = { countries: string[] | null; remoteOk: boolean };
// A role counts when it names one of their countries; a role that names only other countries never counts, remote or
// not; a remote role naming no country counts if remote is fine; a role with no location counts (unknown, not ruled out).
export function inWorkArea(job: { location?: string; remote: boolean }, area: WorkArea | null) {
  if (!area?.countries?.length) return true;
  const where = job.location ? jobCountries(job.location) : new Set<string>();
  if (where.size) return [...where].some((c) => area.countries!.includes(c));
  if (job.remote || /remote|anywhere/i.test(job.location ?? "")) return area.remoteOk;
  return true;
}

const SENIORITY = /\b(senior|sr\.?|junior|jr\.?|principal|staff|lead|head of|director of|director|vp of|vp|vice president of|chief|associate|manager of)\b/g;
const core = (t: string | undefined) => (t ?? "").toLowerCase().replace(SENIORITY, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
export function matchesTitle(job: string, target: string) {
  const want = core(target);
  if (!want.length) return false;
  const have = new Set(core(job));
  return want.every((w) => have.has(w) || have.has(w.replace(/s$/, "")));
}

const slugGuesses = (c: { name: string; domain?: string }) => {
  const base = c.domain?.split(".")[0] ?? "";
  const squashed = (c.name ?? "").toLowerCase().replace(/\b(inc|llc|corp|corporation|co|ltd|technologies|technology|labs|ai)\b/g, "").replace(/[^a-z0-9]+/g, "");
  return [...new Set([base, squashed, (c.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")].filter((s) => s.length > 1))];
};

// Where they said they'll work, from their approved Location limit (the one that applies everywhere, always).
export async function workAreaOf(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<WorkArea | null> {
  const loc = (await activeLimits(ctx, workspaceId)).find((l) => l.data.kind === "location" && !l.data.appliesTo?.length && !l.data.when);
  if (!loc) return null;
  const countries = Array.isArray(loc.data.rule?.countries) ? (loc.data.rule.countries as string[]) : null;
  const modes = Array.isArray(loc.data.rule?.modes) ? (loc.data.rule.modes as string[]) : null;
  return { countries, remoteOk: !modes || modes.includes("remote") };
}

export const todo = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const all = await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect();
    const titles = (await itemsOf(ctx, workspaceId, "direction", "approved"))
      .filter((d) => d.data.criteriaStatus === "approved")
      .map((d) => ({ direction: d.data.name, titles: d.data.criteria?.titles ?? [] }));
    // Strongest signals first: your list, hiring now, lookalikes, large companies, then plain criteria matches.
    const rank = (c: Doc<"companies">) => Math.min(...c.found.map((f) => ({ hand: 0, hiring: 1, lookalike: 2, large: 3, criteria: 4 })[f.via]));
    // What they asked to check again goes first, then strongest source.
    const order = (a: Doc<"companies">, b: Doc<"companies">) => (b.recheckAt ?? 0) - (a.recheckAt ?? 0) || rank(a) - rank(b);
    const left = all.filter((c) => !c.details && c.screened?.employer !== false && c.domain).sort(order);
    const needFit = all.filter((c) => c.details && !c.fitAt && c.screened?.employer !== false).sort(order).slice(0, FIT_BATCH);
    const directions = (await itemsOf(ctx, workspaceId, "direction", "approved"))
      .filter((d) => d.data.criteriaStatus === "approved")
      .map((d) => ({ id: d._id, name: d.data.name, positioning: d.data.detail?.positioning, titles: d.data.criteria?.titles ?? [], industries: d.data.criteria?.industries ?? [], sizes: d.data.criteria?.sizes ?? [] }));
    const limits = (await activeLimits(ctx, workspaceId)).filter((l) => ["companies", "work", "seniority", "location"].includes(l.data.kind)).map((l) => ({ label: l.data.label, value: l.data.value }));
    const settings = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    const judge = (settings?.lens ?? DEFAULT_LENS).judge !== "off";
    // Their approved company goals, as they approved them: the words and the structured lists.
    const companyGoals = (await activeLimits(ctx, workspaceId)).filter((l) => l.data.kind === "companies").map((l) => ({ value: l.data.value, note: l.data.note, rule: l.data.rule }));
    // Learning from their ratings: the companies they turned down, latest first, with the reason when they gave one.
    const turnedDown = learns(settings)
      ? all
          .filter((c) => c.rating?.value === "no")
          .sort((a, b) => b.rating!.at - a.rating!.at)
          .slice(0, TURNED_DOWN_MAX)
          .map((c) => ({ name: c.name, ...(c.details?.summary ? { summary: c.details.summary } : {}), ...(c.rating!.reason ? { why: c.rating!.reason } : {}) }))
      : [];
    const area = await workAreaOf(ctx, workspaceId);
    return {
      area, batch: left.slice(0, BATCH).map((c) => ({ id: c._id, name: c.name, domain: c.domain!, ...(c.apolloId ? { apolloId: c.apolloId } : {}), ...(c.boardUrl ? { boardUrl: c.boardUrl } : {}) })), remaining: left.length, titles, useApollo: !!settings?.apolloJobs,
      fit: { companies: needFit.map((c) => ({ id: c._id, name: c.name, domain: c.domain, summary: c.details?.summary, openRoles: c.details?.jobs?.open, matchingRoles: c.details?.jobs?.matching.slice(0, 5).map((j) => j.title) })), fitLeft: all.filter((c) => c.details && !c.fitAt && c.screened?.employer !== false).length, directions, limits, judge, companyGoals, turnedDown } };
  },
});

export const save = internalMutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("companies"), details: v.any() },
  handler: async (ctx, { workspaceId, id, details }) => {
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { details: details as Doc<"companies">["details"] });
  },
});

// The next batch of a pass, as the one before it was started (origin).
export const next = internalMutation({
  args: { workspaceId: v.id("workspaces"), origin: v.optional(origin) },
  handler: async (ctx, { workspaceId, origin }) => {
    const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "enrich", args: {}, status: "queued", origin });
    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  },
});

// Start a pass unless one is already queued or running (a running pass picks up new work itself). Only they start one.
async function startPass(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const jobs = await ctx.db.query("jobs").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(100);
  if (jobs.some((j) => j.kind === "enrich" && (j.status === "queued" || j.status === "running"))) return null;
  const jobId = await ctx.db.insert("jobs", { workspaceId, kind: "enrich", args: {}, status: "queued", origin: "you" });
  await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId });
  return jobId;
}

export const start = mutation({
  args: {},
  handler: async (ctx) => startPass(ctx, (await requireWorkspace(ctx)).workspaceId),
});

// Check companies again: their site and job board are read afresh, then fit and goals are judged again.
export const recheck = mutation({
  args: { ids: v.array(v.id("companies")) },
  handler: async (ctx, { ids }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!ids.length || ids.length > 1000) throw new ConvexError("Pick between 1 and 1,000 companies.");
    const at = Date.now();
    let skipped = 0;
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
      // Their own "not a place to work" stands; a company with no website has nothing to read yet.
      if ((c.screened?.by === "you" && !c.screened.employer) || !c.domain) { skipped++; continue; }
      await ctx.db.patch(id, { details: undefined, fitAt: undefined, recheckAt: at, ...(c.screened?.by === "you" ? {} : { screened: undefined }) });
    }
    await startPass(ctx, workspaceId);
    return { skipped };
  },
});

// Give a company's job board directly (or clear it with ""). Checked again right away.
export const setBoard = mutation({
  args: { id: v.id("companies"), url: v.string() },
  handler: async (ctx, { id, url }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const u = url.trim();
    if (u && !boardsIn(u).length) throw new ConvexError("CareerBot can't read that kind of job board yet. Paste the board's own page, like jobs.lever.co/acme or acme.wd5.myworkdayjobs.com/External.");
    const theirsOut = c.screened?.by === "you" && !c.screened.employer;
    await ctx.db.patch(id, { boardUrl: u || undefined, details: undefined, fitAt: undefined, ...(theirsOut ? {} : { recheckAt: Date.now() }) });
    return theirsOut ? null : startPass(ctx, workspaceId);
  },
});

// Correct a company's website. Its old details were read from the old site, so it's checked again.
export const setWebsite = mutation({
  args: { id: v.id("companies"), website: v.string() },
  handler: async (ctx, { id, website }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new ConvexError("Not found.");
    const domain = toDomain(website);
    if (!domain) throw new ConvexError("Use the company's website, like nvidia.com.");
    // A new website is a new identity check: the old Apollo match and a rule or AI screening came from the old one.
    // Their own "not a place to work" stands: the website is saved, and it's checked once they Restore it.
    const theirsOut = c.screened?.by === "you" && !c.screened.employer;
    await ctx.db.patch(id, { domain, websiteUrl: `https://${domain}`, apolloId: undefined, details: undefined, fitAt: undefined, ...(theirsOut ? {} : { recheckAt: Date.now() }), ...(c.screened?.by === "you" ? {} : { screened: undefined }) });
    return theirsOut ? null : startPass(ctx, workspaceId);
  },
});

const KNOWN_SUMMARY = `Each company's website couldn't be read. For each company you actually know (matching both the name and the website), write "summary": one plain sentence on what it builds or sells and for whom. No hype. If you don't know the company for sure, set "summary" to null; never guess from the name. Reply with JSON: {"companies":[{"id","summary"}]}.`;

const SUMMARY = `For each company, write "summary": one plain sentence on what the company actually builds or sells and for whom, from its own website text only. No hype, no adjectives it didn't earn, no guessing. If the text doesn't say, write "Its website doesn't say what it builds." Reply with JSON only: {"companies":[{"id": "...", "summary": "..."}]}.`;

// The replies' shapes (structured output, metering.chat), as runEnrich and judgeFit read them.
export const SUMMARY_SCHEMA = replyOf("company_summaries", "companies", { id: string, summary: string });
export const KNOWN_SUMMARY_SCHEMA = replyOf("company_summaries_known", "companies", { id: string, summary: orNull("string") });
// With the company goals judged, each company also carries "goals".
export const companyFitSchema = (judge: boolean): ReplySchema =>
  replyOf("company_fit", "companies", { id: string, fit: listOf({ directionId: string, level: string, reason: string }), ...(judge ? { goals: strictObject({ level: string, reason: string }) } : {}) });

async function braveSearch(key: string, q: string): Promise<string[]> {
  try {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, { headers: { accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return [];
    const body = (await r.json()) as { web?: { results?: { url?: string; title?: string; description?: string }[] } };
    return (body.web?.results ?? []).map((x) => `${x.url ?? ""} ${x.title ?? ""} ${x.description ?? ""}`);
  } catch {
    return [];
  }
}

type ApolloJobs = ((apolloId: string) => Promise<Read | null>) | null;
const apolloPostings = (f: NonNullable<ApolloJobs>, id: string) => f(id);

// Apollo's job postings for a company (1 credit each). They run in the background, so they count as automated: Budgets
// must allow automated Apollo work. Apollo gives no id, so a posting's link is its id.
export function apolloJobsFor(ctx: ActionCtx, ws: Id<"workspaces">): NonNullable<ApolloJobs> {
  return async (id) => {
    const body = (await apollo(ctx, { workspaceId: ws, purpose: "job postings", endpoint: "organizations/job_postings", path: `organizations/${id}/job_postings`, method: "GET", automated: true, params: { per_page: 100, page: 1 } }).catch(() => null)) as {
      organization_job_postings?: { title?: string; url?: string; city?: string; state?: string; country?: string }[];
    } | null;
    const jobs = (body?.organization_job_postings ?? []).filter((j) => j.title && j.url).map((j) => ({ title: j.title!, url: j.url!, location: [j.city, j.state, j.country ? (countryName(countryCode(j.country) ?? j.country)) : undefined].filter(Boolean).join(", ") || undefined, remote: /remote/i.test(`${j.title} ${j.city ?? ""}`), externalId: j.url! }));
    return jobs.length ? { board: { provider: "apollo", slug: id, url: jobs[0].url, foundBy: "Apollo job postings" }, jobs } : null;
  };
}

async function one(c: { name: string; domain: string; apolloId?: string; boardUrl?: string }, titles: { direction: string; titles: string[] }[], braveKey: string | null, apolloJobs: ApolloJobs, area: WorkArea | null) {
  const sources: string[] = [];
  if (!publicHost(c.domain)) return { text: "", details: { sources, at: Date.now() } };
  const home = await get(`https://${c.domain}`);
  let html = home ? await home.text().catch(() => "") : "";
  if (html) sources.push(`https://${c.domain}`);
  // Many sites turn away server requests (bot checks). Then read the page through a reader service, which loads it
  // in a real browser and returns its text and links. Only the public company URL is sent.
  else if ((html = await viaReader(`https://${c.domain}`))) sources.push(`https://${c.domain} (through a reader)`);
  const { description, text } = pageText(html);
  // Their own board link wins over anything found.
  let boards = c.boardUrl ? boardsIn(c.boardUrl).map((b) => ({ ...b, foundBy: "you" })) : boardsIn(html);
  if (!boards.length) {
    const careers = (await get(`https://${c.domain}/careers`)) ?? (await get(`https://${c.domain}/jobs`));
    let chtml = careers ? await careers.text().catch(() => "") : "";
    let from = careers?.url;
    if (!chtml && (chtml = await viaReader(`https://${c.domain}/careers`))) from = `https://${c.domain}/careers (through a reader)`;
    boards = boardsIn(chtml);
    if (boards.length && from) sources.push(from);
  }
  // Guess the usual board names when the site doesn't link one (many embed boards with scripts).
  // Not linked from the site: ask Brave Search, when they've added a key. A board found in results for the company's
  // name and website counts as found by search, the same as a link on its site.
  if (!boards.length && braveKey) {
    // Each result on its own: a board link counts only from a result that names this company or its website.
    const nameKey = (c.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const hit of await braveSearch(braveKey, `"${c.name}" careers jobs ${c.domain}`)) {
      const text = hit.toLowerCase();
      if (!text.includes(c.domain.toLowerCase()) && !(nameKey && text.replace(/[^a-z0-9]+/g, " ").includes(nameKey))) continue;
      for (const b of boardsIn(hit)) if (!boards.some((x) => x.provider === b.provider && x.slug === b.slug)) boards.push({ ...b, foundBy: "Brave Search" });
    }
    if (boards.length) sources.push("Brave Search");
  }
  const linked = boards.length > 0;
  if (!linked) for (const slug of slugGuesses(c)) boards.push({ provider: "greenhouse", slug, url: "" }, { provider: "ashby", slug, url: "" }, { provider: "lever", slug, url: "" });
  // Take titles in turn from each direction so every direction gets searched, not just the first ones.
  titlesToSearch = interleave(titles.map((t) => t.titles));
  let found: Read | null = null;
  for (const b of boards) {
    const r = await readBoard(b);
    if (!r || (!r.jobs.length && !r.total)) continue;
    // A guessed board name can belong to a different company. Keep it only if its board page points back to this site.
    if (!linked) {
      const page = await get(r.board.url);
      const bhtml = page ? await page.text().catch(() => "") : "";
      if (!bhtml.toLowerCase().includes(c.domain.toLowerCase())) continue;
    }
    found = r;
    break;
  }
  if (found) sources.push(found.board.url);
  if (!found && apolloJobs && c.apolloId) found = await apolloPostings(apolloJobs, c.apolloId);
  // A match counts only where they said they'd work (their approved Location limit).
  const where = (j: Job) => inWorkArea(j, area);
  const matching = found
    ? found.jobs.filter(where).flatMap((j) => titles.flatMap((t) => (t.titles.some((x) => matchesTitle(j.title, x)) ? [{ title: j.title, url: j.url, ...(j.location ? { location: j.location } : {}), direction: t.direction }] : []))).slice(0, 20)
    : [];

  return {
    text,
    details: {
      ...(description ? { siteDescription: description.slice(0, 300) } : {}),
      ...(found ? { board: found.board, jobs: { open: found.total ?? found.jobs.length, remote: found.jobs.filter((j) => j.remote).length, matching } } : {}),
      sources,
      at: Date.now(),
    },
  };
}

export async function runEnrich(ctx: ActionCtx, job: Doc<"jobs">) {
  const ws = job.workspaceId;
  // Companies sent back for checking (or given a new website) are screened again first.
  await screenCompanies(ctx, ws);
  const { batch, remaining, titles, useApollo, fit, area } = await ctx.runQuery(internal.enrich.todo, { workspaceId: ws });
  if (!batch.length) {
    // Details are all in; judge fit for the ones that don't have it yet, a batch at a time.
    if (!fit.companies.length || !fit.directions.length) return { done: 0, remaining: 0, fitLeft: 0 };
    const judged = await judgeFit(ctx, ws, fit);
    // Always look again: companies sent back for checking during this pass are picked up by the next one.
    await ctx.runMutation(internal.enrich.next, { workspaceId: ws, origin: job.origin });
    return { done: 0, remaining: 0, judged: judged.n, fitLeft: fit.fitLeft - fit.companies.length, costUsd: judged.costUsd };
  }
  const braveKey = await braveKeyFor(ctx, ws);
  // Last resort, only when they turned it on: Apollo's job postings for a company with no readable public board.
  const apolloJobs: ApolloJobs = useApollo ? apolloJobsFor(ctx, ws) : null;
  const results: { id: Id<"companies">; name: string; text: string; details: Record<string, unknown> }[] = [];
  for (let i = 0; i < batch.length; i += 8) {
    const got = await Promise.all(batch.slice(i, i + 8).map(async (c) => ({ id: c.id, name: c.name, ...(await one(c, titles, braveKey, apolloJobs, area)) })));
    results.push(...got);
  }
  // One AI call for the batch's summaries, from site text only.
  const withText = results.filter((r) => r.text.length > 80);
  let costUsd = 0;
  const summaries = new Map<string, string>();
  if (withText.length) {
    const choice = await modelFor(ctx, ws, "companies");
    const reply = await chatJson<{ companies?: { id?: string; summary?: string }[] }>(ctx, {
      workspaceId: ws,
      purpose: "company summaries",
      model: choice.model,
      reasoning: choice.reasoning,
      schema: SUMMARY_SCHEMA,
      messages: [
        { role: "system", content: SUMMARY },
        { role: "user", content: JSON.stringify(withText.map((r) => ({ id: r.id, name: r.name, website: r.text }))) },
      ],
    });
    costUsd = reply.costUsd;
    for (const x of reply.out.companies ?? []) if (x.id && x.summary) summaries.set(x.id, x.summary.trim());
  }
  // No readable or useful site: a summary from general knowledge, labelled, only for companies the model actually knows.
  // Also when the site was read but says nothing about what the company does (menus and cookie notices only).
  const noText = results.filter((r) => { const x = summaries.get(String(r.id)); return !x || x.startsWith("Its website doesn't say") || x.startsWith("Its website doesn’t say"); });
  if (noText.length) {
    const choice = await modelFor(ctx, ws, "companies");
    const reply = await chatJson<{ companies?: { id?: string; summary?: string | null }[] }>(ctx, {
      workspaceId: ws,
      purpose: "company summaries (general knowledge)",
      model: choice.model,
      reasoning: choice.reasoning,
      schema: KNOWN_SUMMARY_SCHEMA,
      messages: [
        { role: "system", content: KNOWN_SUMMARY },
        { role: "user", content: JSON.stringify(noText.map((r) => ({ id: r.id, name: r.name, website: batch.find((b) => b.id === r.id)?.domain }))) },
      ],
    });
    costUsd += reply.costUsd;
    for (const x of reply.out.companies ?? [])
      if (x.id && x.summary?.trim()) summaries.set(x.id, `From general knowledge: ${x.summary.trim().replace(/^From general knowledge:\s*/i, "")}`);
  }
  for (const r of results) {
    const summary = summaries.get(String(r.id));
    await ctx.runMutation(internal.enrich.save, { workspaceId: ws, id: r.id, details: { ...r.details, ...(summary ? { summary } : {}) } });
  }
  // Keep going until details are in; the batches after that judge fit.
  await ctx.runMutation(internal.enrich.next, { workspaceId: ws, origin: job.origin });
  return { done: results.length, remaining: remaining - batch.length, costUsd };
}

export const setApolloJobs = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const row = await ctx.db.query("discovery").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (row) await ctx.db.patch(row._id, { apolloJobs: on });
    else await ctx.db.insert("discovery", { workspaceId, seeds: [], resolved: [], apolloJobs: on });
  },
});

const GOALS = `Separately, judge each company against the seeker's company goals (what kind of company they want to work for, what excites them, what they avoid), given in their own approved words. This is a signal, not a verdict: "goals": {"level": "fits" | "partly" | "doesnt" | "unknown", "reason": one short plain sentence naming the deciding facts}. You may use general knowledge of well-known companies when the summary is thin or missing; when you do, start the reason with "From general knowledge:". Use "unknown" only when you don't know the company and the summary doesn't say enough. A company outside their wanted industries can still fit if it matches what excites them.`;

const FIT = `You judge how well each company fits each of a job seeker's directions, for deciding which companies deserve their time. For the direction fit, use only what's given: the company's own one-line summary, its open roles, and roles matching the direction's titles; the direction's positioning, titles and industries; and the seeker's approved limits (company types they want or avoid, work they avoid, seniority, location). Levels: "strong" (clearly the kind of company and work they want, ideally hiring for it), "some" (plausible fit worth a look), "weak" (a stretch), "none" (wrong kind of company for this direction, or against a limit). "reason": one short plain sentence naming the deciding facts. Missing information lowers confidence, not the level: say what's unknown. Reply with JSON only: {"companies":[{"id": "...", "fit": [{"directionId": "...", "level": "...", "reason": "..."}]}]}.`;

// Companies they turned down steer fit and the goals judgment as their own preferences, beside their approved words.
const TURNED_DOWN = `"Companies they turned down, and why" are companies the seeker rated Not for me, with the reason when they gave one. They are the seeker's own preferences, not facts about other companies: a company that is clearly like one they turned down, in the way their reason names, fits them less, and its reason says so. Never assume a company shares something its summary and roles don't show.`;

type FitInput = { companies: { id: Id<"companies"> }[]; directions: { id: Id<"items"> }[]; limits: unknown[]; judge: boolean; companyGoals: unknown[]; turnedDown: unknown[] };
async function judgeFit(ctx: ActionCtx, ws: Id<"workspaces">, fit: FitInput) {
  const choice = await modelFor(ctx, ws, "companies");
  const { out, costUsd } = await chatJson<{ companies?: { id?: string; fit?: { directionId?: string; level?: string; reason?: string }[]; goals?: { level?: string; reason?: string } }[] }>(ctx, {
    workspaceId: ws,
    purpose: "company fit",
    model: choice.model,
    reasoning: choice.reasoning,
    schema: companyFitSchema(fit.judge),
    messages: [
      { role: "system", content: `${fit.judge ? `${FIT}\n\n${GOALS}\nEach company in the reply also carries "goals".` : FIT}${fit.turnedDown.length ? `\n\n${TURNED_DOWN}` : ""}` },
      {
        role: "user",
        content: `Directions:\n${JSON.stringify(fit.directions)}\n\nTheir approved limits:\n${JSON.stringify(fit.limits)}\n\n${fit.judge ? `Their company goals:\n${JSON.stringify(fit.companyGoals)}\n\n` : ""}${fit.turnedDown.length ? `Companies they turned down, and why:\n${JSON.stringify(fit.turnedDown)}\n\n` : ""}Companies:\n${JSON.stringify(fit.companies)}`,
      },
    ],
  });
  const dirs = new Set(fit.directions.map((d) => String(d.id)));
  const levels = ["strong", "some", "weak", "none"];
  const byId = new Map((out.companies ?? []).map((c) => [String(c.id), c.fit ?? []]));
  const goalsById = new Map((out.companies ?? []).map((c) => [String(c.id), c.goals]));
  let n = 0;
  for (const c of fit.companies) {
    const f = (byId.get(String(c.id)) ?? [])
      .filter((x) => x.directionId && dirs.has(x.directionId) && levels.includes(x.level ?? "") && x.reason)
      .map((x) => ({ directionId: x.directionId as Id<"items">, level: x.level as "strong" | "some" | "weak" | "none", reason: x.reason!.trim() }));
    const g = goalsById.get(String(c.id));
    const goals = fit.judge && g && ["fits", "partly", "doesnt", "unknown"].includes(g.level ?? "") && g.reason ? { level: g.level as "fits" | "partly" | "doesnt" | "unknown", reason: g.reason.trim() } : undefined;
    await ctx.runMutation(internal.enrich.saveFit, { workspaceId: ws, id: c.id, fit: f, goals });
    n++;
  }
  return { n, costUsd };
}

export const saveFit = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("companies"),
    fit: v.array(v.object({ directionId: v.id("items"), level: v.union(v.literal("strong"), v.literal("some"), v.literal("weak"), v.literal("none")), reason: v.string() })),
    goals: v.optional(v.object({ level: v.union(v.literal("fits"), v.literal("partly"), v.literal("doesnt"), v.literal("unknown")), reason: v.string() })),
  },
  handler: async (ctx, { workspaceId, id, fit, goals }) => {
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { fit, fitAt: Date.now(), recheckAt: undefined, ...(goals ? { goals: { ...goals, ...(c.goals?.keep ? { keep: true } : {}), at: Date.now() } } : {}) });
  },
});

// Their rating. Excited makes a company a target; Targets and Maybe companies have their roles listed. `reason`: why
// it's not for them, kept with a "no" and shown where it's listed.
export const rate = mutation({
  args: { id: v.id("companies"), value: v.union(v.literal("excited"), v.literal("maybe"), v.literal("no"), v.null()), reason: v.optional(v.string()) },
  handler: async (ctx, { id, value, reason }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new Error("Not found.");
    const why = value === "no" ? reason?.trim() || undefined : undefined;
    // Targets over time: made one, or no longer one when it was counted as one.
    const target = value === "excited";
    await ctx.db.patch(id, { rating: value ? { value, at: Date.now(), ...(why ? { reason: why } : {}) } : undefined, ...(target === !!c.talliedTarget ? {} : { talliedTarget: target || undefined }) });
    if (target !== !!c.talliedTarget) await tally(ctx, workspaceId, "targets", dayOf(Date.now()), target ? 1 : -1);
    await ctx.scheduler.runAfter(0, internal.roles.refreshRanks, { workspaceId, companyId: id });
  },
});

// Keep a company the goals judgment set aside (or undo that).
export const keepAnyway = mutation({
  args: { id: v.id("companies"), keep: v.boolean() },
  handler: async (ctx, { id, keep }) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.workspaceId !== workspaceId || !c.goals) throw new Error("Not found.");
    await ctx.db.patch(id, { goals: { ...c.goals, keep } });
  },
});

// Judge fit and goals again for every filled-in company (after goals or the lens change).
export const rejudge = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    for (const c of await ctx.db.query("companies").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      if (c.fitAt) await ctx.db.patch(c._id, { fitAt: undefined });
    await startPass(ctx, workspaceId);
  },
});
