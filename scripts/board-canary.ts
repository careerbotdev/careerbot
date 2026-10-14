// Live check of the job board readers (convex/boards.ts) against real companies' public boards. Not part of CI or
// `pnpm test`: run by hand when a provider changes, or when a board stops reading.
//
//   pnpm tsx scripts/board-canary.ts [provider ...] [--record]
//
// For each provider, two real companies: read the board, then one role's full description, and check what every reader
// promises (a title and an https link for each role, its own id, and the role's details only in their known values).
// Bounded and polite: one request at a time, a pause between them, two companies per provider, one description each.
// --record saves the first company's replies to testdata/boards/<provider>.json, trimmed to a few roles with email
// addresses and phone numbers masked, for the recorded tests (convex/boards.test.ts), which never go online.
import { writeFileSync } from "node:fs";
import type { BoardProvider } from "../convex/boardProviders";
import { type Board, type Job, readBoard, readDescription, setSearchTitles } from "../convex/boards";
import { cleanDetails } from "../convex/roleDetails";

const COMPANIES: Partial<Record<BoardProvider, string[]>> = {
  workable: ["cloudfactory", "usercentrics"],
  bamboohr: ["edgecortix", "d1g1t"],
  rippling: ["positron", "rippling"],
  jazzhr: ["misorobotics", "nro"],
  eightfold: ["micron|micron.com", "lockheedmartin"],
  // GitHub's iCIMS search page sends it on to its iCIMS career site (www.github.careers); GDMS's lists roles itself.
  icims: ["careers-githubinc", "careers-gdms"],
};
const PAUSE_MS = 500;
// Large boards are searched by title (Eightfold, Workday, Oracle); the canary searches one.
setSearchTitles(["Software Engineer"]);

const args = process.argv.slice(2);
const record = args.includes("--record");
const only = args.filter((a) => !a.startsWith("--"));
const providers = (Object.keys(COMPANIES) as BoardProvider[]).filter((p) => !only.length || only.includes(p));

type Reply = { status: number; contentType: string; location?: string; body: string };
let replies: Record<string, Reply> = {};
const live = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const pause = Promise.withResolvers<void>();
  setTimeout(pause.resolve, PAUSE_MS);
  await pause.promise;
  const res = await live(input, init);
  const body = await res.text();
  const location = res.headers.get("location");
  replies[String(input)] = { status: res.status, contentType: res.headers.get("content-type") ?? "", ...(location ? { location } : {}), body };
  return new Response(body, { status: res.status, headers: res.headers });
};

// What every reader promises for a role.
function problems(j: Job): string[] {
  const out: string[] = [];
  if (!j.title?.trim()) out.push("no title");
  if (!/^https:\/\//.test(j.url)) out.push(`link isn't https: ${j.url}`);
  if (!j.externalId) out.push("no id");
  if (j.facts && JSON.stringify(cleanDetails(j.facts)) !== JSON.stringify(j.facts)) out.push(`details outside their values: ${JSON.stringify(j.facts)}`);
  if (j.postedAt !== undefined && !(j.postedAt > Date.UTC(2000, 0, 1) && j.postedAt < Date.now() + 86_400_000)) out.push(`odd posted date ${j.postedAt}`);
  return out;
}

// A recorded reply trimmed to a few roles, with contact details masked.
const MASK = (s: string) => s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "jobs@example.com").replace(/\+?\d[\d ().-]{8,}\d/g, (m) => (/^\d{4}-\d\d-\d\d/.test(m) || /^\d[\d,.]*$/.test(m) ? m : "555-0100"));
function trim(body: string): string {
  try {
    const cut = (x: unknown): unknown => (Array.isArray(x) ? x.slice(0, x.length > 3 && typeof x[0] === "object" ? 3 : x.length).map(cut) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, cut(v)])) : x);
    return JSON.stringify(cut(JSON.parse(body)));
  } catch {
    // A job page: only its structured data. XML feeds: the first three roles.
    const ld = body.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi);
    if (ld && /^\s*<!DOCTYPE html|^\s*<html/i.test(body)) return `<html><head>${ld.join("")}</head></html>`;
    let n = 0;
    return body.replace(/<job>[\s\S]*?<\/job>\s*/g, (m) => (n++ < 3 ? m : ""));
  }
}

// One company: its board, one role's description, and what's wrong with them; its replies saved when recording.
async function check(provider: BoardProvider, slug: string, save: boolean) {
  replies = {};
  const read = await readBoard({ provider, slug, url: "" } satisfies Board);
  const sample = read?.jobs[0];
  const description = sample ? await readDescription(read.board, sample) : null;
  const issues = !read ? ["board not read"] : [...(read.jobs.length || read.total ? [] : ["no roles"]), ...read.jobs.flatMap(problems)];
  if (sample && description === null) issues.push("description not read");
  const facts = { ...sample?.facts, ...description?.facts };
  const posted = description?.postedAt ?? sample?.postedAt;
  console.log(
    `${issues.length ? "FAIL" : "ok  "} ${provider} ${slug}: ${read?.jobs.length ?? 0} roles${read?.total !== undefined ? ` of ${read.total}` : ""}; first: ${sample?.title ?? "-"} | ${sample?.location ?? "-"} | posted ${posted ? new Date(posted).toISOString().slice(0, 10) : "-"} | ${JSON.stringify(facts)} | description ${description?.text.length ?? 0} chars`,
  );
  for (const p of [...new Set(issues)].slice(0, 5)) console.log(`       ${p}`);
  if (save && read) {
    const kept = Object.fromEntries(Object.entries(replies).map(([url, r]) => [url, { ...r, body: MASK(trim(r.body)) }]));
    writeFileSync(`testdata/boards/${provider}.json`, `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), board: { provider, slug }, replies: kept }, null, 1)}\n`);
  }
  return issues.length === 0;
}

async function main() {
  let failed = 0;
  for (const provider of providers) for (const [i, slug] of (COMPANIES[provider] ?? []).entries()) if (!(await check(provider, slug, record && i === 0))) failed++;
  process.exit(failed ? 1 : 0);
}
void main();
