import { cleanName } from "./drivePaths";
import type { ExportFile } from "./exportFormat";
import { type ClosedReason, PATH_LABELS, type Path, type PursuitStatus, statusText, type TimelineEntry, timelineWords } from "./pursuitSteps";
import { resumeTitle } from "./resumeDoc";
import type { Row } from "./workspaceCopy";

// The readable half of an export (yourDataRun.ts): Markdown files a person can open anywhere, made from the same rows
// as careerbot-export.json. Only what they approved and wrote themselves; proposals, rejected items and CareerBot's own
// workings stay in the JSON. Resumes, cover letters and answers come as Word and Markdown files beside these
// (yourDataRun.ts, from the same plan Google Drive syncs). Pure: rows in, files out.

type Data = Record<string, unknown>;
const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : "");
const strs = (x: unknown) => (Array.isArray(x) ? x.map(str).filter(Boolean) : []);
const dataOf = (r: Row): Data => (r.data && typeof r.data === "object" ? (r.data as Data) : {});
const day = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : "");
const dates = (d: Data) => [str(d.start), str(d.end) || (str(d.start) ? "now" : "")].filter(Boolean).join(" to ");
// A file name from a title: no slashes or characters file systems refuse.
export const fileName = (name: string, fallback: string) => cleanName(name.replace(/[\\/:*?"<>|]+/g, "-"), fallback);

export type TextFile = { path: string; text: string };

const README = (f: ExportFile) => `# Your CareerBot data

Exported ${f.exportedAt.slice(0, 10)} from CareerBot ${f.careerbotVersion}.

- **careerbot-export.json**: everything in your workspace, in the format CareerBot imports (format ${f.format}). Import it into an empty workspace on any copy of CareerBot: Settings, Your data.
- **Record.md**, **Goals.md**, **Companies.md**, **Stories/** and **Pursuits/** (and **Notes.md**, when you wrote notes on anything but a pursuit): the same, readable: what you approved and wrote.
- **Resumes and letters/**: your current resumes, cover letters and answers, as Word and Markdown files.
- **files/**: files you stored in CareerBot, if any.

Not included: your keys (OpenRouter, Apollo, Brave), Google Drive and GitHub connections, password and sign-ins, and work that was still running. Add your keys and connections again after an import.

What each part of the JSON holds: https://careerbot.dev/docs/using/your-data
`;

function record(items: Row[], profile: Row | undefined) {
  const of = (kind: string) => items.filter((i) => i.kind === kind && i.status === "approved");
  const out = ["# Record", ""];
  if (profile) out.push(...[profile.name, profile.email, profile.phone, profile.location].map(str).concat(strs(profile.links)).filter(Boolean).map((l) => `${l}  `), "");
  const facts = of("fact");
  const factLines = (key: (r: Row) => unknown, value: unknown) => facts.filter((f) => key(f) === value).map((f) => `- ${str(dataOf(f).text)}`);
  out.push("## Experience", "");
  // Newest first, as Record's Roles list them; a role's heading is its title as resumes show it, then the employer.
  for (const r of of("role").sort((a, b) => str(dataOf(b).start).localeCompare(str(dataOf(a).start)))) {
    const d = dataOf(r);
    const title = d.break ? "Career break" : resumeTitle(d as { title?: string; alternateTitles?: string[] })?.text;
    out.push(`### ${[title, d.break ? "" : str(d.employer)].filter(Boolean).join(", ") || "Role"}`, "");
    const line = [dates(d), str(d.location)].filter(Boolean).join(" · ");
    if (line) out.push(`*${line}*`, "");
    if (d.break && str(d.reason)) out.push(str(d.reason), "");
    const lines = factLines((f) => f.roleKey, r.roleKey);
    if (lines.length) out.push(...lines, "");
  }
  const projects = of("project");
  if (projects.length) {
    out.push("## Projects", "");
    for (const p of projects) {
      const d = dataOf(p);
      out.push(`### ${str(d.name)}`, "", ...[str(d.url), str(d.summary) || str(d.description)].filter(Boolean).map((l) => `${l}  `), "");
      const lines = factLines((f) => f.projectKey, p.projectKey);
      if (lines.length) out.push(...lines, "");
    }
  }
  for (const [kind, title] of [["skill", "Skills"], ["tool", "Tools"], ["certification", "Certifications"]]) {
    const list = of(kind).map((s) => {
      const d = dataOf(s);
      return [str(d.name), str(d.issuer), str(d.earned)].filter(Boolean).join(", ");
    });
    if (list.length) out.push(`## ${title}`, "", ...list.map((l) => `- ${l}`), "");
  }
  const insights = of("insight");
  if (insights.length) out.push("## Insights", "", ...insights.map((i) => `- ${str(dataOf(i).text)}`), "");
  return out.join("\n");
}

function goals(items: Row[], narratives: Row[]) {
  const out = ["# Goals", ""];
  const story = narratives.find((n) => n.kind === "goals");
  if (story) out.push(str(story.body), "");
  const directions = items.filter((i) => i.kind === "direction" && i.status === "approved");
  if (directions.length) {
    out.push("## Directions", "");
    for (const d of directions) {
      const x = dataOf(d);
      out.push(`### ${str(x.name)}`, "");
      if (str(x.summary)) out.push(str(x.summary), "");
      if (strs(x.includes).length) out.push(`Titles: ${strs(x.includes).join(", ")}`, "");
    }
  }
  const limits = items.filter((i) => i.kind === "limit" && i.status === "approved");
  if (limits.length) {
    out.push("## Limits", "");
    for (const l of limits) {
      const x = dataOf(l);
      out.push(`- ${str(x.label)}: ${str(x.value)}${x.firm ? " (firm)" : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}

const RATINGS: Record<string, string> = { excited: "Targets", maybe: "Maybe", no: "Not for me" };
function companies(rows: Row[]) {
  const out = ["# Companies", ""];
  for (const [value, title] of Object.entries(RATINGS)) {
    const list = rows.filter((c) => (c.rating as Data | undefined)?.value === value);
    if (!list.length) continue;
    out.push(`## ${title}`, "");
    for (const c of list) {
      const reason = str((c.rating as Data).reason);
      out.push(`- ${str(c.name)}${str(c.domain) ? ` (${str(c.domain)})` : ""}${reason ? `: ${reason}` : ""}`);
    }
    out.push("");
  }
  const unrated = rows.filter((c) => !c.rating);
  if (unrated.length) out.push("## Not rated", "", ...unrated.map((c) => `- ${str(c.name)}${str(c.domain) ? ` (${str(c.domain)})` : ""}`), "");
  return out.join("\n");
}

function pursuit(p: Row, t: Record<string, Row[]>, notesOn: (kind: string, id: string) => string[]) {
  const mine = (table: string) => (t[table] ?? []).filter((r) => r.pursuitId === p._id);
  const out = [`# ${str(p.title)}, ${str(p.company)}`, ""];
  const facts = [
    ["Status", statusText(p.status as PursuitStatus, (p.closedReason as ClosedReason | undefined) ?? null)],
    ["Path", p.path ? PATH_LABELS[p.path as Path] : ""],
    ["Direction", str(p.direction)],
    ["Next step", str(p.nextStep)],
    ["Interview", str(p.interviewAt)],
    ["Contacted", day(p.contactedAt)],
    ["Applied", day(p.appliedAt)],
    ["Started", day(p.at)],
  ].filter(([, v]) => v);
  out.push(...facts.map(([k, v]) => `- **${k}**: ${v}`), "");
  const timeline = (p.timeline as (TimelineEntry & { at: number })[] | undefined) ?? [];
  if (timeline.length) out.push("## Timeline", "", ...timeline.map((e) => `- ${day(e.at)}: ${timelineWords(e, day)}`), "");
  const people = mine("contacts");
  if (people.length) {
    out.push("## People", "");
    for (const c of people) {
      out.push(`### ${str(c.name)}`, "", ...[str(c.title), str(c.email), str(c.linkedinUrl)].filter(Boolean).map((l) => `${l}  `), "");
      for (const s of (c.sent as Data[] | undefined) ?? []) out.push(`**Sent ${day(s.at)} to ${str(s.to)}: ${str(s.subject)}**`, "", str(s.text), "");
    }
  }
  const followUps = mine("followUps");
  if (followUps.length) {
    out.push("## Follow-ups", "");
    for (const f of followUps) out.push(`### ${str(f.subject)} (${f.state === "sent" ? `sent ${day(f.at)}` : "draft"})`, "", str(f.text), "");
  }
  const letters = mine("letters");
  const letter = letters[letters.length - 1];
  if (letter) out.push("## Cover letter", "", ...((letter.paragraphs as Data[] | undefined) ?? []).flatMap((x) => [str(x.text), ""]));
  const answers = (p.answers as Data[] | undefined) ?? [];
  if (answers.length) out.push("## Answers", "", ...answers.flatMap((a) => [`### ${str(a.question)}`, "", str(a.answer), ""]));
  const messages = mine("pursuitMessages");
  if (messages.length) out.push("## Questions about this role", "", ...messages.flatMap((m) => [`**${m.from === "you" ? "You" : "CareerBot"}**, ${day(m.at)}`, "", str(m.text), ""]));
  const notes = notesOn("pursuit", p._id);
  if (notes.length) out.push("## Notes", "", ...notes);
  return out.join("\n");
}

// Every readable Markdown file for an export.
export function readableFiles(f: ExportFile): TextFile[] {
  const t = f.tables;
  const items = t.items ?? [];
  const narratives = t.narratives ?? [];
  const notes = t.notes ?? [];
  const notesOn = (kind: string, id: string) =>
    notes.filter((n) => (n.subject as Data).kind === kind && (n.subject as Data).id === id).flatMap((n) => [`*${day(n.at)}*`, "", str(n.text), ""]);
  const files: TextFile[] = [
    { path: "README.md", text: README(f) },
    { path: "Record.md", text: record(items, t.profiles?.[0]) },
    { path: "Goals.md", text: goals(items, narratives) },
    { path: "Companies.md", text: companies(t.companies ?? []) },
  ];
  const taken = new Set<string>();
  // Two of the same name become "Name (2)", in the order they were made.
  const unique = (path: string) => {
    let p = path;
    for (let n = 2; taken.has(p.toLowerCase()); n++) p = path.replace(/\.md$/, ` (${n}).md`);
    taken.add(p.toLowerCase());
    return p;
  };
  for (const n of narratives.filter((x) => x.kind !== "goals"))
    files.push({ path: unique(`Stories/${fileName(str(n.title), "Story")}.md`), text: `# ${str(n.title)}\n\n*${day(n.updatedAt)}${n.rejectedAt ? " · rejected as a source" : ""}*\n\n${str(n.body)}\n` });
  for (const p of t.pursuits ?? []) files.push({ path: unique(`Pursuits/${fileName(`${str(p.company)} - ${str(p.title)}`, "Pursuit")}.md`), text: pursuit(p, t, notesOn) });
  const subjects: Record<string, (id: string) => string> = {
    company: (id) => str(t.companies?.find((c) => c._id === id)?.name),
    posting: (id) => str(t.postings?.find((p) => p._id === id)?.title),
    item: (id) => str(dataOf(items.find((i) => i._id === id) ?? ({} as Row)).text) || str(dataOf(items.find((i) => i._id === id) ?? ({} as Row)).name),
    resume: () => "A resume",
    narrative: (id) => str(narratives.find((n) => n._id === id)?.title),
  };
  const others = notes.filter((n) => (n.subject as Data).kind !== "pursuit");
  if (others.length)
    files.push({
      path: "Notes.md",
      text: ["# Notes", "", ...others.flatMap((n) => {
        const s = n.subject as Data;
        return [`## ${subjects[String(s.kind)]?.(String(s.id)) || String(s.kind)}`, "", `*${day(n.at)}*`, "", str(n.text), ""];
      })].join("\n"),
    });
  return files;
}
