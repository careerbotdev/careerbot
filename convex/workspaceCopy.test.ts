// @vitest-environment node
import { expect, test } from "vitest";
import schema from "./schema";
import { directionMark } from "./resumeBasis";
import { classify, copyRows, directionMarkFixes, insertOrder, type Known, refsOf, remapRow, type Row, shapeOf, slotAt, thisSchema, WORKSPACE_TABLES } from "./workspaceCopy";

// Made-up ids in Convex's alphabet: old ones (from the snapshot) and their new ones.
const id = (c: string) => c.repeat(32);
const [ws, pursuit, letter, resume, fact, job, gone] = ["a", "b", "c", "d", "e", "f", "g"].map(id);
const NEW = (old: string) => `n${old.slice(1)}`;

const validator = (table: keyof typeof schema.tables) => shapeOf(schema.tables[table].validator);
const remap = (table: keyof typeof schema.tables, row: Record<string, unknown>, known: Known, loose = false) =>
  remapRow(table, row, known, (path) => slotAt(validator(table), row, path), loose);

test("old ids become new ones, whole or inside text, in id fields, lists of fact ids and job arguments", () => {
  const known: Known = { map: new Map([[ws, NEW(ws)], [resume, NEW(resume)], [fact, NEW(fact)], [job, NEW(job)]]), pending: new Set(), outside: new Set() };
  const update = { _id: id("h"), _creationTime: 1, workspaceId: ws, target: `resume:${resume}`, runId: job, marks: [{ id: fact, mark: "m1" }], lines: [], at: 5 };
  expect(remap("lineUpdates", update, known)).toEqual({
    doc: { target: `resume:${NEW(resume)}`, runId: NEW(job), marks: [{ id: NEW(fact), mark: "m1" }], lines: [], at: 5 },
    later: [],
    dropped: [],
    droppedText: [],
    needs: null,
  });
  const jobRow = { _id: job, _creationTime: 1, workspaceId: ws, kind: "resume", status: "done", args: { directionId: fact, note: `from ${resume}` } };
  expect(remap("jobs", jobRow, known).doc.args).toEqual({ directionId: NEW(fact), note: `from ${NEW(resume)}` });
});

// A direction's mark covers its detail, which cites facts by id. Resumes written from it were in step at the source;
// in the copy they must still be, or each direction resume shows as changed since it was written.
test("direction resumes in step with their direction stay in step after the copy; one out of step stays out", () => {
  const [direction, inStep, outOfStep] = [id("h"), id("j"), id("k")];
  const known: Known = { map: new Map([ws, direction, fact, inStep, outOfStep].map((x) => [x, NEW(x)])), pending: new Set(), outside: new Set() };
  const data = { name: "Clinical Implementation", includes: ["Clinical Implementation Specialist"], summary: "Go-lives", detail: { carriesOver: [{ text: "Epic go-live", factIds: [fact] }] } };
  const dir = { _id: direction, _creationTime: 1, workspaceId: ws, kind: "direction", status: "approved", data, sources: [], at: 1 };
  const resumeOf = (rid: string, mark: string) => ({ _id: rid, _creationTime: 2, workspaceId: ws, model: "m", directionId: direction, writtenFrom: { roles: [], facts: [], projects: [], insights: [], direction: { id: direction, mark } }, at: 2 });
  const rows = [resumeOf(inStep, directionMark(data)), resumeOf(outOfStep, "stale")];
  const remapped = rows.map((old) => ({ old, doc: remapRow("resumes", old, known, () => "optional").doc }));
  const copied = remapRow("items", dir, known, () => "optional").doc;
  const markIn = (doc: Record<string, unknown>) => (doc.writtenFrom as { direction: { mark: string } }).direction.mark;

  // Remapping alone leaves the old mark, which no longer matches the copied direction.
  expect(markIn(remapped[0].doc)).not.toBe(directionMark(copied.data as typeof data));

  const fixes = directionMarkFixes([dir], remapped, (row) => remapRow("items", row, known, () => "optional").doc, (x) => known.map.get(x));
  expect(fixes.map((f) => f.old._id)).toEqual([inStep]);
  expect(markIn(fixes[0].set)).toBe(directionMark(copied.data as typeof data));
  expect((fixes[0].set.writtenFrom as { direction: { id: string } }).direction.id).toBe(NEW(direction));
});

test("a reference to a row not inserted yet is left out where it can be and patched in afterwards, and fails where it can't", () => {
  const known: Known = { map: new Map([[ws, NEW(ws)], [resume, NEW(resume)]]), pending: new Set([letter, pursuit]), outside: new Set() };
  const p = {
    _id: pursuit, _creationTime: 1, workspaceId: ws, companyId: resume, title: "Specialist", company: "Quillfield", status: "applied",
    sent: { at: 9, resumeId: resume, letterId: letter, letter: "Dear Dana" }, timeline: [], changedAt: 9, at: 1,
  };
  const first = remap("pursuits", p, known);
  expect(first.later).toEqual(["sent"]);
  expect(first.doc.sent).toEqual({ at: 9, resumeId: NEW(resume), letter: "Dear Dana" });
  known.map.set(letter, NEW(letter));
  known.pending.delete(letter);
  expect(remap("pursuits", p, known).doc.sent).toEqual({ at: 9, resumeId: NEW(resume), letterId: NEW(letter), letter: "Dear Dana" });

  // A list element (a role to rank again) goes in without it and is patched in whole too.
  const posting = { _id: id("h"), _creationTime: 3, workspaceId: ws, companyId: resume, provider: "greenhouse", externalId: "x", url: "u", title: "t", remote: true, firstSeen: 1, lastSeen: 1, rerank: [resume, pursuit] };
  expect(remap("postings", posting, known)).toMatchObject({ later: ["rerank"], doc: { rerank: [NEW(resume)] } });

  // Required (a letter's pursuit), or inside required text: no way to leave it out.
  const l = { _id: letter, _creationTime: 2, workspaceId: ws, pursuitId: pursuit, paragraphs: [], at: 2 };
  expect(() => remap("letters", l, known)).toThrow(/letters\.pursuitId points to .* \(required\)/);
  const update = { _id: id("h"), _creationTime: 4, workspaceId: ws, target: `letter:${pursuit}`, runId: resume, lines: [], marks: [], at: 4 };
  expect(() => remap("lineUpdates", update, known)).toThrow(/lineUpdates\.target points to .* \(required\)/);
});

test("an item pointing ahead to another item (a duplicate found later) is patched in after both are in", () => {
  const known: Known = { map: new Map([[ws, NEW(ws)]]), pending: new Set([fact]), outside: new Set() };
  const item = { _id: id("h"), _creationTime: 1, workspaceId: ws, kind: "fact", status: "rejected", data: { text: "Ran the huddle", duplicateOf: fact }, sources: [], at: 1 };
  const r = remap("items", item, known);
  expect(r.later).toEqual(["data"]);
  expect(r.doc.data).toEqual({ text: "Ran the huddle" });
});

test("ids the snapshot doesn't carry are left out of optional fields and lists, and fail a required field", () => {
  const known: Known = { map: new Map([[ws, NEW(ws)], [pursuit, NEW(pursuit)]]), pending: new Set(), outside: new Set([gone]) };
  const usage = { _id: id("h"), _creationTime: 1, workspaceId: ws, service: "openrouter", purpose: "letter", ok: true, jobId: gone, pursuitId: pursuit, at: 1 };
  expect(remap("usage", usage, known)).toEqual({ doc: { service: "openrouter", purpose: "letter", ok: true, pursuitId: NEW(pursuit), at: 1 }, later: [], dropped: ["usage.jobId"], droppedText: [], needs: null });
  const letterRow = { _id: letter, _creationTime: 1, workspaceId: ws, pursuitId: pursuit, paragraphs: [{ text: "x", factIds: [gone, pursuit] }], at: 1 };
  expect(remap("letters", letterRow, known).doc.paragraphs).toEqual([{ text: "x", factIds: [NEW(pursuit)] }]);
  expect(() => remap("contacts", { _id: id("h"), _creationTime: 1, workspaceId: ws, pursuitId: gone, name: "Dana", at: 1 }, known)).toThrow(/needs/);
});

test("tables go in after the tables they need, with the one circle (pursuits and their sent letter) broken where it can be", () => {
  const refs = Object.fromEntries(Object.entries(schema.tables).map(([t, def]) => [t, refsOf(shapeOf(def.validator))]));
  const tables = classify(Object.keys(WORKSPACE_TABLES));
  const order = insertOrder(tables, refs);
  const before = (a: string, b: string) => expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
  before("items", "resumes");
  before("narratives", "narrativeVersions");
  before("pursuits", "letters");
  before("pursuits", "contacts");
  before("contacts", "followUps");
  before("postings", "roleRanks");
  expect(() => insertOrder(["a", "b"], { a: [{ to: "b", optional: false }], b: [{ to: "a", optional: false }] })).toThrow(/circle/);
});

test("every workspace table is carried or left out on purpose, and one that's neither stops a copy", () => {
  expect(() => classify(Object.keys(WORKSPACE_TABLES))).not.toThrow();
  expect(() => classify([...Object.keys(WORKSPACE_TABLES), "invoices"])).toThrow(/neither carried nor left out: invoices/);
  expect(() => classify(Object.keys(WORKSPACE_TABLES).filter((t) => t !== "notes"))).toThrow(/not workspace tables: notes/);
});

// Reading a workspace for an export (or the demo) goes through that index only, never a scan of everyone's rows.
test("every workspace table has an index that starts with workspaceId", () => {
  expect(Object.entries(WORKSPACE_TABLES).filter(([, t]) => !t.index).map(([name]) => name)).toEqual([]);
});

// An export leaves out work that hadn't finished; a row needing it in a required place can't go in as it is.
test("loose: an id the copy doesn't carry takes the nearest part that can go with it, or the whole row", () => {
  const known: Known = { map: new Map([[ws, NEW(ws)], [resume, NEW(resume)]]), pending: new Set(), outside: new Set([gone]) };
  const update = { _id: id("h"), _creationTime: 1, workspaceId: ws, target: `resume:${resume}`, runId: gone, lines: [], marks: [], at: 1 };
  expect(() => remap("lineUpdates", update, known)).toThrow(/needs/);
  expect(remap("lineUpdates", update, known, true).needs).toBe("lineUpdates.runId");
  const basis = { roles: [], facts: [], projects: [], insights: [] };
  const r = { _id: resume, _creationTime: 1, workspaceId: ws, model: "m", additions: { at: 1, runId: gone, before: { doc: { summary: "", experience: [], skills: [] } }, basis, lines: [] }, at: 1 };
  const out = remap("resumes", r, known, true);
  expect(out.needs).toBeNull();
  expect(out.doc).toEqual({ model: "m", at: 1 });
  expect(out.dropped).toEqual(["resumes.additions"]);
});

// Rows from the persona-like shapes above, put in through copyRows twice: once stopped partway, then again picking up.
test("a copy stopped partway picks up where it stopped: nothing twice, every reference and patch in place", async () => {
  const rows = (table: string, list: Record<string, unknown>[]) => [table, list.map((x, i) => ({ _creationTime: i + 1, workspaceId: ws, ...x }) as unknown as Row)] as const;
  const [company, posting, item] = [id("h"), id("j"), id("k")];
  const tables = Object.fromEntries([
    rows("companies", [{ _id: company, name: "Beta", found: [], at: 1 }]),
    rows("postings", [{ _id: posting, companyId: company, provider: "lever", externalId: "1", url: "u", title: "PM", remote: false, firstSeen: 1, lastSeen: 1, rerank: [item] }]),
    rows("items", [{ _id: item, kind: "fact", status: "approved", data: { text: "Shipped" }, sources: [], at: 1 }]),
    rows("pursuits", [{ _id: pursuit, companyId: company, postingId: posting, title: "PM", company: "Beta", status: "preparing", timeline: [], changedAt: 1, at: 1 }]),
    rows("letters", [{ _id: letter, pursuitId: pursuit, paragraphs: [{ text: "Dear", factIds: [item] }], at: 1 }]),
  ]);
  const db = new Map<string, { table: string; doc: Record<string, unknown> }>();
  const done = new Map<string, { id: string; later: string[] }>();
  let stopAfter = 2;
  const writer = {
    insert: async (table: string, list: { old: string; doc: Record<string, unknown>; later: string[] }[]) => {
      if (stopAfter-- <= 0) throw new Error("stopped");
      return list.map(({ old, doc, later }) => {
        const nid = NEW(old);
        db.set(nid, { table, doc: { ...doc } });
        done.set(old, { id: nid, later });
        return nid;
      });
    },
    patch: async (_: string, patches: { id: string; set: Record<string, unknown> }[]) => {
      for (const p of patches) Object.assign(db.get(p.id)!.doc, p.set);
    },
  };
  const fresh = (): Known => ({ map: new Map([[ws, NEW(ws)]]), pending: new Set(), outside: new Set() });
  const source = { workspaceId: ws, outside: [], tables };
  await expect(copyRows(source, thisSchema(), fresh(), writer, { done: new Map(done) })).rejects.toThrow("stopped");
  const before = db.size;
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThan(5);
  stopAfter = Infinity;
  await copyRows(source, thisSchema(), fresh(), writer, { done: new Map(done) });
  expect(db.size).toBe(5);
  expect(db.get(NEW(posting))!.doc).toMatchObject({ companyId: NEW(company), rerank: [NEW(item)] });
  expect(db.get(NEW(letter))!.doc).toMatchObject({ pursuitId: NEW(pursuit), paragraphs: [{ text: "Dear", factIds: [NEW(item)] }] });
  expect(db.get(NEW(pursuit))!.doc).toMatchObject({ postingId: NEW(posting), companyId: NEW(company) });
});
