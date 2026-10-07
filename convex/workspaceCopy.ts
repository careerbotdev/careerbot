import type { GenericValidator, Value } from "convex/values";
import { directionMark } from "./resumeBasis";
import schema from "./schema";

// Copying a workspace's rows whole into another workspace, on the same deployment or another one: what a copy
// carries, the order its tables go in, and every old id swapped for its new one. Pure, so both the app's own export and
// import (yourData.ts, yourDataRun.ts) and the demo script (scripts/demo.ts) use the same rules; each brings its own
// way of reading and writing rows.

// ---- What a copy carries ----

// Every workspace table is in exactly one of these; a table that's in neither stops an export (classify), so a new
// table is never missed. Carried tables keep spending, counts and budgets, so Reports read as they did; jobs only once
// finished, so nothing in the copy runs.
export const CARRIED = [
  "aiDefaults", "aiSettings", "aiSpend", "budgets", "comparisons", "companies", "contacts", "discovery", "followUps", "items", "jobs",
  "letters", "lineUpdates", "narrativeVersions", "narratives", "notes", "postingTexts", "postings", "profiles", "pursuitMessages",
  "pursuits", "reminderSettings", "resumeSettings", "resumes", "roleRanks", "rubricRuns", "spendTotals", "tallies", "usage",
];
export const LEFT_OUT: Record<string, string> = {
  apiKeys: "keys are secrets, added again in the copy",
  githubInstalls: "a GitHub connection belongs to the copy it was made on",
  githubLinks: "one-time GitHub links",
  driveConnections: "a Google Drive connection belongs to the copy it was made on",
  driveFiles: "the Docs a Google Drive connection made, which only that connection can reach",
  driveLinks: "one-time Google Drive links",
  memberships: "who can use a workspace, made by the copy it goes into",
  exports: "an export's own progress and file",
  imports: "an import's own progress and file",
  importIds: "an import's old and new ids, kept while it runs",
};
const FINISHED = new Set(["done", "failed"]);

// Fails when a workspace table is neither carried nor left out, or a listed table is gone from the schema.
export function classify(workspaceTables: string[]) {
  const listed = [...CARRIED, ...Object.keys(LEFT_OUT)];
  const unknown = workspaceTables.filter((t) => !listed.includes(t));
  if (unknown.length) throw new Error(`workspace tables neither carried nor left out: ${unknown.join(", ")}. Add each to CARRIED or LEFT_OUT in convex/workspaceCopy.ts.`);
  const gone = listed.filter((t) => !workspaceTables.includes(t));
  if (gone.length) throw new Error(`listed in convex/workspaceCopy.ts but not workspace tables: ${gone.join(", ")}`);
  return CARRIED;
}

export type Row = { _id: string; _creationTime: number } & Record<string, unknown>;

// A table's rows as a copy carries them: oldest first, and jobs only once finished.
export function carried(table: string, rows: Row[]) {
  return (table === "jobs" ? rows.filter((j) => FINISHED.has(String(j.status))) : rows).sort((a, b) => a._creationTime - b._creationTime);
}

// ---- The schema as plain data ----

// Every table with a workspaceId, found from the schema itself so a new table is never missed, with the index that
// starts with workspaceId when it has one (else the table is read whole and filtered).
function hasWorkspaceId(validator: GenericValidator): boolean {
  if (validator.kind === "object") return validator.fields.workspaceId?.kind === "id" && validator.fields.workspaceId.tableName === "workspaces";
  if (validator.kind === "union") return validator.members.some(hasWorkspaceId);
  return false;
}

export const WORKSPACE_TABLES: Record<string, { index: string | null }> = Object.fromEntries(
  Object.entries(schema.tables)
    .filter(([, t]) => hasWorkspaceId(t.validator))
    .map(([name, t]) => [name, { index: t[" indexes"]().find((i) => i.fields[0] === "workspaceId")?.indexDescriptor ?? null }]),
);

// A table's schema as plain data, to find references with (which fields hold ids of which table, and which can be left
// out). The demo script can't load the schema itself, so it asks the deployment it's working on (demoSeed:shape).
export type Shape = {
  kind: GenericValidator["kind"];
  optional: boolean;
  table?: string;
  fields?: Record<string, Shape>;
  members?: Shape[];
  // An array's element, or a record's value.
  element?: Shape;
  literal?: Value;
};

export function shapeOf(v: GenericValidator): Shape {
  const s: Shape = { kind: v.kind, optional: v.isOptional === "optional" };
  if (v.kind === "id") s.table = v.tableName;
  if (v.kind === "object") s.fields = Object.fromEntries(Object.entries(v.fields).map(([k, f]) => [k, shapeOf(f)]));
  if (v.kind === "union") s.members = v.members.map(shapeOf);
  if (v.kind === "array") s.element = shapeOf(v.element);
  if (v.kind === "record") s.element = shapeOf(v.value);
  if (v.kind === "literal") s.literal = v.value;
  return s;
}

// The schema as the copy needs it: the workspace tables and each table's shape.
export type Schema = { workspaceTables: string[]; tables: Record<string, Shape> };
export const thisSchema = (): Schema => ({
  workspaceTables: Object.keys(WORKSPACE_TABLES),
  tables: Object.fromEntries(Object.entries(schema.tables).map(([name, t]) => [name, shapeOf(t.validator)])),
});

// ---- References, from the schema ----

type Ref = { to: string; optional: boolean };

// Each table a table's rows point to through id fields, and whether a row can do without it (an optional field, or
// a list that can be shorter).
export function refsOf(s: Shape, optional = false, out: Ref[] = []): Ref[] {
  const opt = optional || s.optional;
  if (s.kind === "id" && s.table) out.push({ to: s.table, optional: opt });
  for (const f of Object.values(s.fields ?? {})) refsOf(f, opt, out);
  for (const m of s.members ?? []) refsOf(m, opt, out);
  if (s.element) refsOf(s.element, true, out);
  return out;
}
const refsByTable = (s: Schema) => Object.fromEntries(Object.entries(s.tables).map(([t, shape]) => [t, refsOf(shape)]));

// The order to insert tables in: each after every table it points to where possible; when references go round in a
// circle, a table whose remaining references can all be left out goes first (they're patched in afterwards). A circle
// of required references can't be inserted at all.
export function insertOrder(tables: string[], refs: Record<string, Ref[]>): string[] {
  const order: string[] = [];
  const left = [...tables];
  const waiting = (t: string, required: boolean) => (refs[t] ?? []).filter((r) => r.to !== t && left.includes(r.to) && (!required || !r.optional));
  while (left.length) {
    const free = left.filter((t) => waiting(t, true).length === 0);
    const next = free.find((t) => waiting(t, false).length === 0) ?? free.sort((a, b) => waiting(a, false).length - waiting(b, false).length)[0];
    if (!next) throw new Error(`required references go round in a circle: ${left.join(", ")}`);
    order.push(next);
    left.splice(left.indexOf(next), 1);
  }
  return order;
}

export type Slot = "required" | "optional" | "element" | "any";

// Which member of a union a value is: the first whose shape it has (for objects, every literal field matching, like an
// item's kind).
function memberFor(s: Shape, value: unknown): Shape {
  if (s.kind !== "union") return s;
  const fits = (m: Shape): boolean => {
    if (m.kind === "union") return (m.members ?? []).some(fits);
    if (m.kind === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const obj: Record<string, unknown> = { ...value };
      const fields = m.fields ?? {};
      // System fields (_id, _creationTime) are on every row and in no schema.
      return Object.keys(obj).every((k) => k.startsWith("_") || k in fields) && Object.entries(fields).every(([k, f]) => f.kind !== "literal" || obj[k] === f.literal);
    }
    if (m.kind === "array") return Array.isArray(value);
    if (m.kind === "literal") return value === m.literal;
    if (m.kind === "null") return value === null;
    if (m.kind === "string" || m.kind === "id") return typeof value === "string";
    if (m.kind === "float64") return typeof value === "number";
    if (m.kind === "boolean") return typeof value === "boolean";
    return m.kind === "any" || m.kind === "record";
  };
  const m = (s.members ?? []).find(fits);
  if (!m) throw new Error(`a value fits none of its union's members: ${JSON.stringify(value).slice(0, 200)}`);
  return memberFor(m, value);
}

// What holds the value at `path` in a row: a field that must be there, one that can be left out, a list element, or
// something under v.any() (job arguments), which can always be left out.
export function slotAt(s: Shape, doc: unknown, path: (string | number)[]): Slot {
  let cur = s;
  let value = doc;
  let slot: Slot = "required";
  for (const key of path) {
    cur = memberFor(cur, value);
    if (cur.kind === "any") return "any";
    const field = typeof key === "string" && cur.kind === "object" ? cur.fields?.[key] : undefined;
    if (typeof key === "number" && cur.kind === "array" && cur.element) {
      cur = cur.element;
      slot = "element";
    } else if (field) {
      cur = field;
      slot = field.optional ? "optional" : "required";
    } else if (typeof key === "string" && cur.kind === "record" && cur.element) {
      cur = cur.element;
      slot = "optional";
    } else throw new Error(`the schema has nothing at ${path.join(".")}`);
    value = value && typeof value === "object" ? Object.entries(value).find(([k]) => k === String(key))?.[1] : undefined;
  }
  return slot;
}

// The stored files a row names (fields holding ids of _storage).
export function filesIn(s: Shape, value: unknown, out = new Set<string>()): Set<string> {
  if (value === undefined || value === null) return out;
  const m = memberFor(s, value);
  if (m.kind === "id" && m.table === "_storage" && typeof value === "string") out.add(value);
  else if (m.kind === "object" && typeof value === "object") {
    for (const [k, y] of Object.entries(value)) if (m.fields?.[k]) filesIn(m.fields[k], y, out);
  }
  else if ((m.kind === "array" || m.kind === "record") && m.element && typeof value === "object") for (const y of Object.values(value)) filesIn(m.element, y, out);
  return out;
}

// ---- Remapping ids ----

// A Convex id: base32 without i, l, o or u.
const ID = /\b[0-9a-hjkmnp-tv-z]{31,37}\b/g;
export const WHOLE_ID = /^[0-9a-hjkmnp-tv-z]{31,37}$/;
const DROP: unique symbol = Symbol("drop");
const NEEDS: unique symbol = Symbol("needs");

// What's known while inserting: old id to new for rows inserted so far; ids of rows not inserted yet; ids the copy
// names but doesn't carry.
export type Known = { map: Map<string, string>; pending: Set<string>; outside: Set<string> };

// A row ready to insert: every old id, whole or inside a string, swapped for its new one. A reference to a row not
// inserted yet (rows go in the order they were made, so a direction made before the facts it cites points ahead) is
// left out when it can be, an optional field or a list element (`later` names the top-level fields to patch whole once
// it's there), and fails in a required field. A reference to an id the copy doesn't carry is left out the same way
// (`dropped`) and not put back; in a required field, or inside text, it fails, unless `loose`: then the nearest part
// that can be left out goes instead (an optional field, a list element), and when nothing can, the whole row
// (`needs`: where). The app's import is loose, since an export leaves out work that hadn't finished, which a row may
// name; the demo isn't, since its snapshot is checked by hand.
export function remapRow(table: string, doc: Record<string, unknown>, known: Known, slot: (path: (string | number)[]) => Slot, loose = false) {
  const later = new Set<string>();
  const dropped: string[] = [];
  // The dropped parts that were text naming an id (a note that mentions a row), not a reference alone.
  const droppedText: string[] = [];
  let needs: string | null = null;
  const where = (path: (string | number)[]) => `${table}.${path.join(".")}`;
  const ahead = (id: string, path: (string | number)[]): typeof DROP => {
    const s = slot(path);
    if (s !== "required") {
      later.add(String(path[0]));
      return DROP;
    }
    throw new Error(`${where(path)} points to ${id}, which isn't inserted yet, and it can't be left out until it is (${s})`);
  };
  // A part naming an id that isn't carried: left out where it can be; else the part holding it has to go.
  const without = (path: (string | number)[], what: string, text = false): typeof DROP | typeof NEEDS => {
    if (slot(path) !== "required") {
      dropped.push(where(path));
      if (text) droppedText.push(where(path));
      return DROP;
    }
    if (!loose) throw new Error(what);
    return NEEDS;
  };
  const str = (s: string, path: (string | number)[]): string | typeof DROP | typeof NEEDS => {
    const now = known.map.get(s);
    if (now) return now;
    if (known.pending.has(s)) return ahead(s, path);
    if (known.outside.has(s)) return without(path, `${where(path)} needs ${s}, which the copy doesn't carry`);
    let forward: string | null = null;
    let missing: string | null = null;
    const out = s.replace(ID, (t) => {
      const mapped = known.map.get(t);
      if (mapped) return mapped;
      if (known.pending.has(t)) forward = t;
      else if (known.outside.has(t)) missing = t;
      return t;
    });
    if (missing) {
      if (!loose) throw new Error(`${where(path)} names ${missing} in its text, which the copy doesn't carry`);
      return without(path, "", true);
    }
    return forward ? ahead(forward, path) : out;
  };
  const walk = (x: unknown, path: (string | number)[]): unknown => {
    if (typeof x === "string") return str(x, path);
    if (Array.isArray(x)) {
      const out = [];
      for (let i = 0; i < x.length; i++) {
        const y = walk(x[i], [...path, i]);
        if (y === NEEDS) return without(path, "");
        if (y !== DROP) out.push(y);
      }
      return out;
    }
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, y] of Object.entries(x)) {
        if (known.pending.has(k) || known.outside.has(k)) throw new Error(`${where(path)} is keyed by ${k}, which isn't inserted`);
        const z = walk(y, [...path, k]);
        if (z === NEEDS) return without(path, "");
        if (z !== DROP) out[known.map.get(k) ?? k] = z;
      }
      return out;
    }
    return x;
  };
  const out: Record<string, unknown> = {};
  for (const [k, y] of Object.entries(doc)) {
    // System fields go; the new workspace's id is set by the insert.
    if (k === "_id" || k === "_creationTime" || k === "workspaceId") continue;
    const z = walk(y, [k]);
    if (z === NEEDS) {
      needs = where([k]);
      break;
    }
    if (z !== DROP) out[k] = z;
  }
  return { doc: out, later: [...later], dropped, droppedText, needs };
}

// Every string in a value, and the ids inside each.
export function idsIn(x: unknown, out = new Set<string>()): Set<string> {
  if (typeof x === "string") {
    out.add(x);
    for (const t of x.match(ID) ?? []) out.add(t);
  } else if (Array.isArray(x)) for (const y of x) idsIn(y, out);
  else if (x && typeof x === "object")
    for (const [k, y] of Object.entries(x)) {
      out.add(k);
      idsIn(y, out);
    }
  return out;
}

// The ids a copy's rows name that it doesn't carry (a job still running when it was taken, a user): the reader looks
// up which are ids on its deployment (and of which table), so the import knows to leave them out.
export function namedIds(workspaceId: string, tables: Record<string, Row[]>) {
  const has = new Set([workspaceId, ...Object.values(tables).flatMap((rows) => rows.map((r) => r._id))]);
  return [...idsIn(Object.values(tables))].filter((s) => !has.has(s) && WHOLE_ID.test(s));
}

// A direction resume keeps the mark of the direction it was written from (resumeBasis.directionMark), and that mark
// covers the direction's detail, which names facts by id: with new ids every direction's mark changes, and each of its
// resumes would show as changed since it was written. So a resume whose mark was in step with its direction at the
// source gets the direction's new mark; one that wasn't keeps its own, so a real change still shows. Returns, for each
// resume to fix, the top-level fields to patch, taken from `doc`, the resume as inserted.
const DIRECTION_ENTRIES = [["writtenFrom", "direction"], ["additions", "before", "writtenFrom", "direction"], ["additions", "basis", "direction"]];
export function directionMarkFixes(
  items: Row[],
  resumes: { old: Row; doc: Record<string, unknown> }[],
  remapItem: (row: Row) => Record<string, unknown>,
  newId: (old: string) => string | undefined,
) {
  const marks = new Map<string, { was: string; now: string }>();
  for (const d of items) {
    const was = d.data;
    const now = remapItem(d).data;
    const id = newId(d._id);
    if (d.kind === "direction" && id && was && typeof was === "object" && now && typeof now === "object") marks.set(id, { was: directionMark(was), now: directionMark(now) });
  }
  const fixes: { old: Row; set: Record<string, unknown> }[] = [];
  for (const { old, doc } of resumes) {
    const copy = structuredClone(doc);
    const changed = new Set<string>();
    for (const path of DIRECTION_ENTRIES) {
      const entry = path.reduce<unknown>((x, k) => (x && typeof x === "object" ? Object.entries(x).find(([key]) => key === k)?.[1] : undefined), copy);
      if (!entry || typeof entry !== "object" || !("id" in entry) || !("mark" in entry) || typeof entry.id !== "string") continue;
      const m = marks.get(entry.id);
      if (!m || entry.mark !== m.was || m.was === m.now) continue;
      entry.mark = m.now;
      changed.add(path[0]);
    }
    if (changed.size) fixes.push({ old, set: Object.fromEntries([...changed].map((k) => [k, copy[k]])) });
  }
  return fixes;
}

// ---- Putting rows in ----

// What a copy holds: the source workspace's id, the ids its rows name that it doesn't carry, and its rows by table,
// oldest first.
export type Source = { workspaceId: string; outside: string[]; tables: Record<string, Row[]> };

// How rows reach the new workspace. insert: rows (old id, row ready to go in, top-level fields to patch once every row
// is in) in one go, returning the new ids in order. patch: set top-level fields on rows by new id. progress: after
// each batch, how many of a table's rows are in.
export type Writer = {
  insert(table: string, rows: { old: string; doc: Record<string, unknown>; later: string[] }[]): Promise<string[]>;
  patch(table: string, patches: { id: string; set: Record<string, unknown> }[]): Promise<void>;
  progress?(table: string, done: number, total: number): Promise<void>;
};

// Rows already in from an earlier run of the same copy, which picks up after them: old id to new, and the fields each
// still has to have patched in.
export type Done = Map<string, { id: string; later: string[] }>;

const BATCH_DOCS = 100;
const BATCH_BYTES = 1_000_000;

// Puts a copy's rows into a workspace (whose new id `known` already maps the source's to), table by table in an order
// that keeps references pointing back, then patches in the references that point ahead and brings direction resumes'
// marks along. Picks up after `done` (rows in from an earlier run): those are skipped, and their patches still made, so
// running it again after an interruption finishes the same copy. Rows that can't go in without something the copy
// doesn't carry (loose only) are left out and counted.
export async function copyRows(source: Source, schema: Schema, known: Known, w: Writer, { loose = false, done = new Map() as Done } = {}) {
  for (const t of Object.keys(source.tables)) if (!CARRIED.includes(t)) throw new Error(`the copy has ${t}, which isn't carried`);
  for (const [old, { id }] of done) known.map.set(old, id);
  for (const rows of Object.values(source.tables)) for (const r of rows) if (!known.map.has(r._id)) known.pending.add(r._id);
  for (const id of source.outside) known.outside.add(id);
  const order = insertOrder(Object.keys(source.tables), refsByTable(schema));
  const toPatch: { table: string; old: Row; keys: string[] }[] = [];
  const byOld = new Map(Object.entries(source.tables).flatMap(([table, rows]) => rows.map((r) => [r._id, { table, row: r }] as const)));
  for (const [old, { later }] of done) {
    const at = byOld.get(old);
    if (at && later.length) toPatch.push({ table: at.table, old: at.row, keys: later });
  }
  const dropped: string[] = [];
  const droppedText: string[] = [];
  const left: { table: string; needs: string }[] = [];
  for (const table of order) {
    const shape = schema.tables[table];
    const rows = source.tables[table];
    let batch: { old: Row; doc: Record<string, unknown>; later: string[] }[] = [];
    let bytes = 0;
    let count = rows.filter((r) => known.map.has(r._id)).length;
    const flush = async () => {
      if (!batch.length) return;
      const ids = await w.insert(table, batch.map((b) => ({ old: b.old._id, doc: b.doc, later: b.later })));
      batch.forEach((b, i) => (known.map.set(b.old._id, ids[i]), known.pending.delete(b.old._id)));
      count += batch.length;
      batch = [];
      bytes = 0;
      await w.progress?.(table, count, rows.length);
    };
    for (const old of rows) {
      if (known.map.has(old._id)) continue;
      // A row naming one in the batch waiting to go in sends the batch first, so its reference points back.
      const names = idsIn(old);
      if (batch.some((b) => names.has(b.old._id))) await flush();
      const r = remapRow(table, old, known, (path) => slotAt(shape, old, path), loose);
      if (r.needs) {
        // Never going in: what names it now names something the copy doesn't carry.
        left.push({ table, needs: r.needs });
        known.pending.delete(old._id);
        known.outside.add(old._id);
        continue;
      }
      if (r.later.length) toPatch.push({ table, old, keys: r.later });
      dropped.push(...r.dropped);
      droppedText.push(...r.droppedText);
      const size = JSON.stringify(r.doc).length;
      if (batch.length >= BATCH_DOCS || bytes + size > BATCH_BYTES) await flush();
      batch.push({ old, doc: r.doc, later: r.later });
      bytes += size;
    }
    await flush();
    if (!rows.length) await w.progress?.(table, 0, 0);
  }
  // Now every row has its new id: the references left out point ahead no more.
  const final = (table: string) => (row: Row) => remapRow(table, row, known, () => "optional", loose).doc;
  const byTable = new Map<string, { id: string; set: Record<string, unknown> }[]>();
  for (const { table, old, keys } of toPatch) {
    const doc = final(table)(old);
    const list = byTable.get(table) ?? [];
    list.push({ id: known.map.get(old._id)!, set: Object.fromEntries(keys.map((k) => [k, doc[k]])) });
    byTable.set(table, list);
  }
  for (const [table, patches] of byTable) for (let i = 0; i < patches.length; i += BATCH_DOCS) await w.patch(table, patches.slice(i, i + BATCH_DOCS));
  // Direction resumes in step with their direction at the source stay in step here.
  const resumes = (source.tables.resumes ?? []).filter((old) => known.map.has(old._id)).map((old) => ({ old, doc: final("resumes")(old) }));
  const fixes = directionMarkFixes(source.tables.items ?? [], resumes, final("items"), (id) => known.map.get(id));
  const markPatches = fixes.map(({ old, set }) => ({ id: known.map.get(old._id)!, set }));
  for (let i = 0; i < markPatches.length; i += BATCH_DOCS) await w.patch("resumes", markPatches.slice(i, i + BATCH_DOCS));
  return { order, patched: toPatch.length, marks: fixes.length, dropped, droppedText, left };
}
