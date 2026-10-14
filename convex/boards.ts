import type { BoardProvider } from "./boardProviders";
import { cleanDetails, type Details } from "./roleDetails";

// Reading companies' public job boards: finding a board in a page's links (boardsIn), reading its open roles (readBoard)
// and one role's full description (readDescription). Each provider's reader is checked against real companies' boards
// (scripts/board-canary.ts) and tested on recorded copies of their replies (testdata/boards, boards.test.ts). Every
// reader returns the same shape: a Job per role, with the details the board states in its own fields (Details), so a
// new provider adds a pattern to boardsIn, a branch to readBoard and, when its listing has no descriptions, a case to
// readDescription. Pure: no Convex functions, so scripts can run it.

const TIMEOUT_MS = 8000;

export type Board = { provider: BoardProvider; slug: string; url: string; foundBy?: string };
// One role on a board. externalId is the board's own id for it (its link when the board has none); postedAt when the
// board says. description is plain text, set only by boards whose listing carries it ("" when the listing has none).
// facts: the details the board states in its own fields (pay, setup, employment type...), set only when it states any.
// applyUrl: the board's own application link, when it gives one apart from the role's page (Lever, Ashby, Workable, Recruitee).
export type Job = { title: string; url: string; applyUrl?: string; location?: string; remote: boolean; externalId: string; postedAt?: number; description?: string; facts?: Details };

// Boards still recognised in links (so a company's board isn't guessed wrongly) but never read, because their own
// published rules ask automated readers not to: nothing is fetched from them and no AI reads their roles.
export const NOT_READ: Partial<Record<BoardProvider, { name: string; why: string }>> = {
  // api.smartrecruiters.com/robots.txt: "User-agent: LinkedInBot Allow: /v1/companies/ ... User-agent: * Disallow: /".
  smartrecruiters: { name: "SmartRecruiters", why: "its rules ask automated readers to stay away" },
  // <company>.teamtailor.com/robots.txt: "Content-Signal: search=no, ai-train=no, ai-input=no".
  teamtailor: { name: "Teamtailor", why: "its rules ask that its pages not be given to AI" },
};

// Only plain public hostnames are fetched: no IP literals, localhost or internal names, and every redirect is checked
// the same way before it's followed. (DNS names that resolve to private addresses can't be checked from here.)
export function publicHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return false;
  if (/^\d+(\.\d+){3}$/.test(h) || h.includes(":")) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|invalid|test)$/.test(h) && !h.endsWith(".arpa");
}

export async function get(url: string, accept = "text/html", timeoutMs = TIMEOUT_MS): Promise<Response | null> {
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
  // Eightfold: the career site's tenant, and the company domain it's searched by when the link names one
  // (micron.eightfold.ai/careers?domain=micron.com); without one, the reader finds it on the career site.
  // A test copy (hp-sandbox.eightfold.ai, linked from hp.com) isn't the company's board.
  for (const m of html.matchAll(/\/\/([a-z0-9-]+)\.eightfold\.ai\/(?:careers|careerhub)([^"'\s<>]*)/gi))
    if (!["www", "app"].includes(m[1].toLowerCase()) && !/sandbox/i.test(m[1])) {
      const domain = m[2].match(/[?&](?:amp;)?domain=([a-z0-9.-]+\.[a-z]{2,})/i)?.[1];
      add("eightfold", domain ? `${m[1]}|${domain}` : m[1]);
    }
  return out;
}

export type Read = { board: Board; jobs: Job[]; total?: number; searched?: boolean };

// Workday, Oracle and large Eightfold boards list a page at a time, so they're read differently: the total count once,
// then a search for each target title. Workday reports at most 2,000 as its total.
let titlesToSearch: string[] = [];
// Boards searched per title (Workday, Oracle, Eightfold): free, but one request each.
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

// Eightfold's career site search, 10 roles a page, with the board's total. A board of up to 50 is read whole; a larger
// one is searched for each target title, up to 30 results each. Its robots.txt allows /careers and /api/pcsx. Checked with
// Micron (micron.eightfold.ai, domain micron.com) and Northrop Grumman (ngc.eightfold.ai, domain ngc.com).
const EIGHTFOLD_WHOLE = 50;
type EightfoldPosition = { id: number; name: string; locations?: string[]; postedTs?: number; workLocationOption?: string | null; positionUrl?: string };
async function readEightfold(b: Board): Promise<Read | null> {
  const [tenant, given] = b.slug.split("|");
  const site = `https://${tenant}.eightfold.ai`;
  let domain = given;
  if (!domain) {
    // A link on the page (?domain=micron.com), or the page's own settings ("domain": "lockheedmartin.com", sometimes
    // HTML-escaped). Checked with Lockheed Martin (lockheedmartin.eightfold.ai).
    const page = (await (await get(`${site}/careers`))?.text().catch(() => "")) ?? "";
    const plain = page.replace(/&#34;|&quot;/g, '"');
    domain = (plain.match(/[?&](?:amp;)?domain=([a-z0-9.-]+\.[a-z]{2,})/i) ?? plain.match(/"domain"\s*:\s*"([a-z0-9.-]+\.[a-z]{2,})"/i))?.[1] ?? "";
    if (!domain) return null;
  }
  const search = async (query: string, start: number) =>
    (await getJson<{ data?: { count?: number; positions?: EightfoldPosition[] } }>(`${site}/api/pcsx/search?domain=${encodeURIComponent(domain)}&query=${encodeURIComponent(query)}&location=&start=${start}`))?.data ?? null;
  const first = await search("", 0);
  if (!first?.positions || typeof first.count !== "number") return null;
  const seen = new Map<string, Job>();
  const keep = (list: EightfoldPosition[] = []) => {
    for (const j of list) seen.set(String(j.id), eightfoldJob(site, domain, j));
  };
  keep(first.positions);
  const whole = first.count <= EIGHTFOLD_WHOLE;
  if (whole) for (let start = 10; start < first.count; start += 10) keep((await search("", start))?.positions);
  else
    for (const t of titlesToSearch.slice(0, SEARCH_TITLES))
      for (let start = 0; start < 30; start += 10) {
        const page = (await search(t, start))?.positions ?? [];
        keep(page);
        if (page.length < 10) break;
      }
  return { board: { ...b, slug: `${tenant}|${domain}`, url: `${site}/careers?domain=${domain}` }, jobs: [...seen.values()], total: first.count, ...(whole ? {} : { searched: true }) };
}
const eightfoldJob = (site: string, domain: string, j: EightfoldPosition): Job => ({
  title: j.name,
  url: `${site}/careers/job/${j.id}?domain=${domain}`,
  location: j.locations?.join("; ") || undefined,
  remote: j.workLocationOption === "remote",
  externalId: String(j.id),
  postedAt: j.postedTs ? j.postedTs * 1000 : undefined,
  facts: facts({ setup: setupOf(j.workLocationOption), locations: j.locations }),
});

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
// the page count and the last page. Checked with General Dynamics Mission Systems (careers-gdms.icims.com). A company that
// sends its iCIMS search page on to its own iCIMS career site is read there instead (icimsSite).
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
  if (!first.includes("iCIMS_JobsTable")) {
    const to = first.match(/window\.top\.location\.href\s*=\s*'(https:[^']+)'/)?.[1]?.replace(/\\\//g, "/");
    return to ? icimsSite(b, new URL(to).host) : null;
  }
  const pages = Number(first.match(/Page 1 of (\d+)/)?.[1] ?? 1);
  const jobs = [first, ...(await Promise.all(Array.from({ length: Math.min(pages, 10) - 1 }, (_, i) => page(i + 1))))].flatMap(cards);
  const total = pages > 10 ? (pages - 1) * cards(first).length + cards(await page(pages - 1)).length : jobs.length;
  return { board: { ...b, url: `${base}/search?ss=1` }, jobs, total };
}

// An iCIMS career site (built on Jibe) on the company's own address: its search page loads /api/jobs, 100 roles a page,
// each with its description. A board of up to 300 is read whole; a larger one is searched for each target title (one page
// each). Requests go one at a time, 5 seconds apart, as these sites' robots.txt asks ("Crawl-delay: 5"), and at most 12 per
// read. Checked with GitHub (www.github.careers, from careers-githubinc.icims.com) and AXA (careers.axa.com).
const ICIMS_SITE_WHOLE = 300;
const ICIMS_SITE_REQUESTS = 12;
const ICIMS_SITE_GAP_MS = 5000;
type IcimsSiteJob = {
  slug?: string; req_id?: string; title?: string; description?: string; responsibilities?: string; qualifications?: string; full_location?: string; location_name?: string;
  additional_locations?: { city?: string; state?: string; country?: string }[]; employment_type?: string; posted_date?: string;
};
async function icimsSite(b: Board, host: string): Promise<Read | null> {
  if (!publicHost(host)) return null;
  let requests = 0;
  const list = async (keywords: string, pageNo: number) => {
    if (requests++) {
      const gap = Promise.withResolvers<void>();
      setTimeout(gap.resolve, ICIMS_SITE_GAP_MS);
      await gap.promise;
    }
    return getJson<{ totalCount?: number; jobs?: { data?: IcimsSiteJob }[] }>(`https://${host}/api/jobs?page=${pageNo}&limit=100${keywords ? `&keywords=${encodeURIComponent(keywords)}` : ""}`);
  };
  const first = await list("", 1);
  if (!first?.jobs || typeof first.totalCount !== "number") return null;
  const seen = new Map<string, Job>();
  const keep = (jobs: { data?: IcimsSiteJob }[] = []) => {
    for (const { data: j } of jobs) {
      const id = j?.req_id ?? j?.slug;
      if (j?.title && id) seen.set(id, icimsSiteJob(host, id, j));
    }
  };
  keep(first.jobs);
  const whole = first.totalCount <= ICIMS_SITE_WHOLE;
  if (whole) for (let p = 2; (p - 1) * 100 < first.totalCount && requests < ICIMS_SITE_REQUESTS; p++) keep((await list("", p))?.jobs);
  else for (const t of titlesToSearch.slice(0, SEARCH_TITLES)) if (requests < ICIMS_SITE_REQUESTS) keep((await list(t, 1))?.jobs);
  return { board: { ...b, url: `https://${host}/jobs` }, jobs: [...seen.values()], total: first.totalCount, ...(whole ? {} : { searched: true }) };
}
function icimsSiteJob(host: string, id: string, j: IcimsSiteJob): Job {
  const location = j.full_location || j.location_name || undefined;
  const more = (j.additional_locations ?? []).map((l) => [l.city, l.state, l.country].filter(Boolean).join(", "));
  return {
    title: decode(j.title ?? ""),
    url: `https://${host}/jobs/${encodeURIComponent(id)}`,
    location,
    remote: /remote/i.test(`${location} ${j.location_name}`),
    externalId: id,
    postedAt: toTime(j.posted_date),
    description: sections([[null, j.description], ["Responsibilities", j.responsibilities], ["Qualifications", j.qualifications]]),
    facts: facts({ employmentType: employmentOf(j.employment_type), setup: setupOf(j.location_name), locations: location ? [location, ...more] : more }),
  };
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

// Pay a board gives only as words ("$140,000 - $180,000", "USD 25-30 per hour"), kept only when it's certain: one amount
// or a range; its currency named (a code, € or £) or a dollar sign on a role in the United States; its period said, or
// plain from the amounts (yearly from 1,000 up, hourly under 200). Anything else is left to the AI's reading.
const PERIOD_WORDS: Record<string, string> = { yr: "year", annum: "year", annual: "year", annually: "year", yearly: "year", mo: "month", monthly: "month", wk: "week", weekly: "week", daily: "day", hr: "hour", hourly: "hour" };
export function payFromText(s: string | null | undefined, country?: string | null) {
  const t = (s ?? "").toLowerCase();
  const amounts = [...t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/g)].map((m) => Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1)).filter((n) => n > 0);
  if (!amounts.length || amounts.length > 2) return undefined;
  const code = t.match(/\b(usd|cad|eur|gbp|aud|nzd|chf|sek|nok|dkk|pln|inr|sgd)\b/)?.[1]?.toUpperCase();
  const currency = code ?? (t.includes("€") ? "EUR" : t.includes("£") ? "GBP" : t.includes("$") && /^(united states|usa|us)$/i.test(country?.trim() ?? "") ? "USD" : undefined);
  const word = t.match(/(?:\bper|\ban?|\/)\s*(year|yr|annum|month|mo|week|wk|day|hour|hr)\b|\b(annually|annual|yearly|monthly|weekly|daily|hourly)\b/);
  const said = word ? (PERIOD_WORDS[word[1] ?? word[2]] ?? word[1]) : undefined;
  const top = Math.max(...amounts);
  const period = said ?? (top >= 1000 ? "year" : top < 200 ? "hour" : undefined);
  return currency && period ? { min: Math.min(...amounts), max: top, currency, period } : undefined;
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
  if (NOT_READ[b.provider]) return null;
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
      const places = [...new Set([...(had?.facts?.locations ?? []), ...(j.locations ?? []).flatMap((l) => l.name ?? [])])];
      // Each place says how it's worked (ON_SITE, HYBRID, REMOTE); the role has a setup only when all places agree.
      const setups = new Set([...(had ? [had.facts?.setup] : []), ...(j.locations ?? []).map((l) => setupOf(l.workplaceType))]);
      jobs.set(id, { title: j.name.trim(), url: j.url, location: places.join("; ") || undefined, remote: !!had?.remote || !!j.locations?.some((l) => l.workplaceType === "REMOTE"), externalId: id, facts: facts({ setup: setups.size === 1 ? [...setups][0] : undefined, locations: places }) });
    }
    // Past the pages read, the board's own count (one per place) says more are there.
    return { board: { ...b, url: `https://ats.rippling.com/${b.slug}/jobs` }, jobs: [...jobs.values()], ...((first.totalPages ?? 1) > pages ? { total: first.totalItems } : {}) };
  }
  if (b.provider === "oracle") return readOracle(b);
  if (b.provider === "eightfold") return readEightfold(b);
  if (b.provider === "icims") return readIcims(b);
  // The listing carries each description. Checked with The Boring Company (jobs.gem.com/the-boring-company).
  if (b.provider === "gem") {
    const body = await getJson<{ id: string; title: string; absolute_url: string; first_published_at?: string; content_plain?: string; location?: { name?: string }; location_type?: string; employment_type?: string }[]>(`https://api.gem.com/job_board/v0/${b.slug}/job_posts`);
    if (!Array.isArray(body)) return null;
    return { board: { ...b, url: `https://jobs.gem.com/${b.slug}` }, jobs: body.map((j) => ({ title: j.title, url: j.absolute_url, location: j.location?.name, remote: j.location_type === "remote" || /remote/i.test(j.location?.name ?? ""), externalId: j.id ?? j.absolute_url, postedAt: toTime(j.first_published_at), description: clip(j.content_plain), facts: facts({ employmentType: employmentOf(j.employment_type), setup: setupOf(j.location_type) }) })) };
  }
  // The widget listing gives each job's places; how it's worked and the description come per job (readDescription).
  // Checked with Usercentrics (apply.workable.com/usercentrics) and CloudFactory (apply.workable.com/cloudfactory).
  if (b.provider === "workable") {
    type Place = { city?: string; region?: string; country?: string; hidden?: boolean };
    const body = await getJson<{ jobs?: { shortcode: string; title: string; url: string; application_url?: string; city?: string; state?: string; country?: string; locations?: Place[]; telecommuting?: boolean; published_on?: string; employment_type?: string }[] }>(`https://apply.workable.com/api/v1/widget/accounts/${b.slug}`);
    if (!body?.jobs) return null;
    // A job open in several places may be listed once per place, so the places are joined into one job.
    const jobs = new Map<string, Job>();
    for (const j of body.jobs) {
      const had = jobs.get(j.shortcode);
      const place = (...parts: (string | undefined)[]) => [...new Set(parts.filter(Boolean))].join(", ");
      const listed = (j.locations ?? []).filter((l) => !l.hidden).map((l) => place(l.city, l.region, l.country));
      const places = [...new Set([...(had?.facts?.locations ?? []), ...(listed.length ? listed : [place(j.city, j.state, j.country)])].filter(Boolean))];
      const remote = !!had?.remote || !!j.telecommuting;
      jobs.set(j.shortcode, { title: j.title, url: j.url, applyUrl: j.application_url, location: places.join("; ") || undefined, remote, externalId: j.shortcode, postedAt: toTime(j.published_on), facts: facts({ employmentType: employmentOf(j.employment_type), setup: remote ? "remote" : undefined, locations: places }) });
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
  // JazzHR's job feed carries each description; JazzHR makes it once a day for sites to copy, which a daily read of a
  // company's board fits. It has no date: a job's id starts with the day it was opened (job_20261013143650_...), the
  // date its page gives as posted. Checked with the National Reconnaissance Office (nro.applytojob.com) and Miso Robotics
  // (misorobotics.applytojob.com).
  if (b.provider === "jazzhr") {
    const res = await get(`https://app.jazz.co/feeds/export/jobs/${b.slug}`, "application/xml");
    const xml = res ? await res.text().catch(() => "") : "";
    if (!xml.includes("<publisher>JazzHR")) return null;
    const jobs = [...xml.matchAll(/<job>([\s\S]*?)<\/job>/g)].map((m) => {
      const location = [xmlTag(m[1], "city"), xmlTag(m[1], "state"), xmlTag(m[1], "country")].filter(Boolean).join(", ") || undefined;
      const url = xmlTag(m[1], "url") ?? "";
      const id = xmlTag(m[1], "id") ?? "";
      const day = id.match(/^job_(\d{4})(\d\d)(\d\d)/);
      return { title: xmlTag(m[1], "title") ?? "", url, location, remote: /remote/i.test(location ?? ""), externalId: id || url, postedAt: day ? Date.UTC(+day[1], +day[2] - 1, +day[3]) : undefined, description: htmlText(xmlTag(m[1], "description")), facts: facts({ employmentType: employmentOf(xmlTag(m[1], "type")), setup: setupOf(location) }) };
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
  if (NOT_READ[b.provider]) return null;
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
    // Rippling (ats.rippling.com/rippling/jobs): pay ranges (one per place; those in the first's currency and period are
    // spanned), employment type ("Salaried, full-time") and places.
    case "rippling": {
      type Range = { currency?: string; frequency?: string; rangeStart?: number | null; rangeEnd?: number | null };
      const r = await getJson<{ createdOn?: string; description?: { role?: string; company?: string }; workLocations?: string[]; employmentType?: { id?: string }; payRangeDetails?: Range[] }>(`https://ats.rippling.com/api/v2/board/${b.slug}/jobs/${id}`);
      if (!r) return null;
      const ranges = (r.payRangeDetails ?? []).filter((p) => p.currency === r.payRangeDetails?.[0].currency && p.frequency === r.payRangeDetails?.[0].frequency);
      const lows = ranges.flatMap((p) => p.rangeStart ?? []);
      const highs = ranges.flatMap((p) => p.rangeEnd ?? []);
      const pay = ranges.length ? { min: lows.length ? Math.min(...lows) : undefined, max: highs.length ? Math.max(...highs) : undefined, currency: ranges[0].currency, period: periodOf(ranges[0].frequency) } : undefined;
      return { text: sections([[null, r.description?.role], [null, r.description?.company]]), postedAt: toTime(r.createdOn), facts: facts({ pay, employmentType: employmentOf(r.employmentType?.id?.replace(/^(salaried|hourly),?\s*/i, "")), locations: r.workLocations }) };
    }
    // Micron (micron.eightfold.ai, domain micron.com).
    case "eightfold": {
      const [tenant, domain] = b.slug.split("|");
      if (!domain) return null;
      const r = await getJson<{ data?: EightfoldPosition & { jobDescription?: string } }>(`https://${tenant}.eightfold.ai/api/pcsx/position_details?position_id=${id}&domain=${encodeURIComponent(domain)}`);
      const x = r?.data;
      return x ? { text: htmlText(x.jobDescription), postedAt: x.postedTs ? x.postedTs * 1000 : undefined, facts: eightfoldJob(`https://${tenant}.eightfold.ai`, domain, x).facts } : null;
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
    // Usercentrics (apply.workable.com/usercentrics): how it's worked ("on_site", "hybrid", "remote") and its type ("full",
    // "part", "contract"...).
    case "workable": {
      const r = await getJson<{ published?: string; description?: string; requirements?: string; benefits?: string; workplace?: string; type?: string }>(`https://apply.workable.com/api/v2/accounts/${b.slug}/jobs/${id}`);
      return r && { text: sections([[null, r.description], ["Requirements", r.requirements], ["Benefits", r.benefits]]), postedAt: toTime(r.published), facts: facts({ setup: setupOf(r.workplace), employmentType: employmentOf(r.type === "full" || r.type === "part" ? `${r.type}-time` : r.type) }) };
    }
    // Scribd (scribd.bamboohr.com) and d1g1t (d1g1t.bamboohr.com). Pay is the company's own words ("$140,000 - $180,000").
    case "bamboohr": {
      const r = await getJson<{ result?: { jobOpening?: { description?: string; datePosted?: string; compensation?: string | null; location?: { addressCountry?: string | null } } } }>(`https://${b.slug}.bamboohr.com/careers/${id}/detail`);
      const x = r?.result?.jobOpening;
      return x ? { text: htmlText(x.description), postedAt: toTime(x.datePosted), facts: facts({ pay: payFromText(x.compensation, x.location?.addressCountry) }) } : null;
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
    // Ashby, Personio, Recruitee, Pinpoint and JazzHR have no public data per job, but their listing carries every
    // description, so the listing is read again.
    default: {
      const r = await readBoard(b);
      if (!r) return null;
      const j = r.jobs.find((x) => x.externalId === job.externalId);
      return { text: j?.description ?? "", postedAt: j?.postedAt, facts: j?.facts };
    }
  }
}
