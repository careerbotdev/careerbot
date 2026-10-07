import { compareVersions } from "./releases";
import { VERSION } from "./version";
import { newer, NEWER_FORMAT, WRONG_FILE } from "./exportRules";
import { CARRIED, type Row } from "./workspaceCopy";

// The file Settings, Your data exports and imports (yourData.ts, yourDataRun.ts): careerbot-export.json, at the top of
// the export's ZIP beside readable copies (readableExport.ts) and the workspace's stored files. Documented for people
// in content/docs/using/your-data.mdx; a change to what it holds updates that page.
//
//   { format, careerbotVersion, exportedAt, workspace, outside, files, tables }
//
// format: this file's own version, raised whenever a row from an older CareerBot would no longer go in as it is (a
// field renamed, made required or reshaped), with a migration that brings the older file forward (MIGRATIONS).
// careerbotVersion: the CareerBot that exported it. workspace: the search's own settings. outside: ids its rows name
// that it doesn't carry (work that hadn't finished), with their tables. files: stored files by id, and where each is in
// the ZIP. tables: every carried table's rows (workspaceCopy.CARRIED), oldest first, with their ids as they were.

export const FORMAT = 1;
export const DATA_FILE = "careerbot-export.json";

export type WorkspaceAbout = { _id: string; name: string; began: number; setupHidden?: boolean; setupSkipped?: ("drive" | "people")[]; toursOffered?: string[] };
export type FileAbout = { path: string; contentType?: string; bytes: number };
export type ExportFile = {
  format: number;
  careerbotVersion: string;
  exportedAt: string;
  workspace: WorkspaceAbout;
  outside: Record<string, string>;
  files: Record<string, FileAbout>;
  tables: Record<string, Row[]>;
};

type Loose = Record<string, unknown>;
// Each brings a file of format n (its key) to n + 1. Empty while there's only format 1.
export const MIGRATIONS: Record<number, (file: Loose) => Loose> = {};

// Why a file can't be imported, in words for the person importing it.
export class Refusal extends Error {}

const isObject = (x: unknown): x is Loose => !!x && typeof x === "object" && !Array.isArray(x);

// The file as this copy's format, from its text: refused when it isn't an export, comes from a newer CareerBot or a
// newer format, or is older than any migration reaches; an older format is brought forward one step at a time.
export function readExport(text: string, here = { format: FORMAT, version: VERSION }, migrations = MIGRATIONS): { file: ExportFile; from: number } {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Refusal(WRONG_FILE);
  }
  if (!isObject(file) || typeof file.format !== "number" || !Number.isInteger(file.format) || typeof file.careerbotVersion !== "string") throw new Refusal(WRONG_FILE);
  if (compareVersions(file.careerbotVersion, here.version) > 0) throw new Refusal(newer(file.careerbotVersion, here.version));
  if (file.format > here.format) throw new Refusal(NEWER_FORMAT);
  let f: Loose = file;
  for (let n = file.format; n < here.format; n++) {
    const step = migrations[n];
    if (!step) throw new Refusal(`This file is from CareerBot ${file.careerbotVersion}, too old for this copy to read.`);
    f = { ...step(f), format: n + 1 };
  }
  const { workspace, tables, outside, files, exportedAt } = f;
  if (!isObject(workspace) || typeof workspace._id !== "string" || typeof workspace.name !== "string" || typeof workspace.began !== "number") throw new Refusal(WRONG_FILE);
  if (!isObject(tables) || !isObject(outside) || !isObject(files) || typeof exportedAt !== "string") throw new Refusal(WRONG_FILE);
  for (const [table, rows] of Object.entries(tables)) {
    if (!CARRIED.includes(table) || !Array.isArray(rows)) throw new Refusal(WRONG_FILE);
    for (const r of rows) if (!isObject(r) || typeof r._id !== "string" || typeof r._creationTime !== "number") throw new Refusal(WRONG_FILE);
  }
  return { file: f as ExportFile, from: file.format };
}

// How much of each kind a file holds, as the import's preview lists it.
const KINDS: [string, string[]][] = [
  ["Stories", ["narratives"]],
  ["Record items", ["items"]],
  ["Companies", ["companies"]],
  ["Roles", ["postings"]],
  ["Pursuits", ["pursuits"]],
  ["People", ["contacts"]],
  ["Resumes", ["resumes"]],
  ["Cover letters", ["letters"]],
  ["Follow-ups", ["followUps"]],
  ["Notes", ["notes"]],
];
export const countsOf = (tables: Record<string, Row[]>) =>
  KINDS.map(([kind, of]) => ({ kind, n: of.reduce((n, t) => n + (tables[t]?.length ?? 0), 0) })).filter((c) => c.n > 0);

// What an import would leave out because it points to something the file doesn't hold, by kind as the preview lists
// it: whole rows (workspaceCopy.copyRows' left), and parts of rows that go in without them (its dropped, as
// "table.field…"). Essential, so a file that would lose it is refused: a row of a kind a person sees (KINDS), text in
// one of those (droppedText: a note naming a row), and a resume's Add what's new they were going through, whose
// decisions and reasons they wrote. The rest (links CareerBot keeps, spending, counts, its own work) can be left out
// once they say so.
export type Omission = { kind: string; n: number; essential: boolean };
export const OTHER_HISTORY = "Other history";
const kindOf = (table: string) => KINDS.find(([, of]) => of.includes(table))?.[0];
const AUTHORED_PARTS: [string, string][] = [["resumes.additions", "Resume lines you were going through (Add what’s new)"]];
export function omissionsOf(left: { table: string }[], dropped: string[] = [], droppedText: string[] = []): Omission[] {
  const out = new Map<string, Omission>();
  const add = (kind: string, essential: boolean) => {
    const o = out.get(kind) ?? { kind, n: 0, essential };
    o.n++;
    out.set(kind, o);
  };
  for (const { table } of left) {
    const kind = kindOf(table);
    add(kind ?? OTHER_HISTORY, !!kind);
  }
  const text = new Set(droppedText);
  for (const at of dropped) {
    const table = at.split(".")[0];
    const kind = kindOf(table);
    const authored = AUTHORED_PARTS.find(([prefix]) => at === prefix || at.startsWith(`${prefix}.`));
    if (authored) add(authored[1], true);
    else if (text.has(at) && kind) add(`Text in ${kind.toLowerCase()}`, true);
    else add(kind ? `Links in ${kind.toLowerCase()}` : OTHER_HISTORY, false);
  }
  return [...out.values()];
}
export const lostEssential = (omitted: Omission[]) =>
  `Some of this file can’t come in whole: ${omitted
    .filter((o) => o.essential)
    .map((o) => `${o.kind} (${o.n})`)
    .join(", ")} point to things that aren’t in it, and would be lost. Export it again from the copy it came from.`;

// What an export or import says it's on, for each table.
export const STEPS: Record<string, string> = {
  narratives: "Stories",
  narrativeVersions: "Stories",
  items: "Record",
  profiles: "Settings",
  aiDefaults: "Settings",
  aiSettings: "Settings",
  budgets: "Settings",
  discovery: "Settings",
  reminderSettings: "Settings",
  resumeSettings: "Settings",
  companies: "Companies",
  postings: "Roles",
  postingTexts: "Roles",
  roleRanks: "Roles",
  pursuits: "Pursuits",
  contacts: "People",
  pursuitMessages: "Pursuits",
  letters: "Cover letters",
  followUps: "Follow-ups",
  lineUpdates: "Resumes",
  resumes: "Resumes",
  notes: "Notes",
  jobs: "History",
  usage: "Spending",
  aiSpend: "Spending",
  spendTotals: "Spending",
  tallies: "Reports",
  comparisons: "Model comparisons",
  rubricRuns: "Model comparisons",
};

// The export's file name: careerbot-export-2026-10-06.zip.
export const zipName = (at: number) => `careerbot-export-${new Date(at).toISOString().slice(0, 10)}.zip`;
