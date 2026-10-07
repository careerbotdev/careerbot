import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => {
    const out = [];
    for (const email of ["a@example.com", "b@example.com"]) {
      const u = await ctx.db.insert("users", { email });
      out.push({ u, w: await ensureWorkspace(ctx, u) });
    }
    return out;
  });
  const w = a.w;
  const ids = await t.run(async (ctx) => {
    const company = await ctx.db.insert("companies", { workspaceId: w, name: "Beta", found: [], at: 0 });
    const posting = await ctx.db.insert("postings", { workspaceId: w, companyId: company, provider: "lever", externalId: "1", url: "u", title: "Onboarding Manager", remote: false, firstSeen: 0, lastSeen: 0 });
    const pursuit = await ctx.db.insert("pursuits", { workspaceId: w, postingId: posting, companyId: company, title: "Onboarding Manager", company: "Beta", status: "preparing", timeline: [{ at: 0, event: "started" }], changedAt: 0, at: 0 });
    const item = await ctx.db.insert("items", { workspaceId: w, kind: "fact", status: "approved", data: { text: "Cut churn by 20%." }, sources: [], at: 0 });
    const narrative = await ctx.db.insert("narratives", { workspaceId: w, kind: "career", title: "Beta", body: "I ran onboarding.", version: 1, updatedAt: 0 });
    return { company, posting, pursuit, item, narrative };
  });
  return { t, w, asA: t.withIdentity({ subject: `${a.u}|s` }), asB: t.withIdentity({ subject: `${b.u}|s` }), ...ids };
}

test("notes are their own, on anything in their workspace: another workspace can't read, add, edit or remove them", async () => {
  const { t, asA, asB, company, posting, pursuit, item, narrative } = await setup();
  const subjects = [
    { kind: "pursuit" as const, id: pursuit },
    { kind: "company" as const, id: company },
    { kind: "posting" as const, id: posting },
    { kind: "item" as const, id: item },
    { kind: "narrative" as const, id: narrative },
  ];
  for (const subject of subjects) {
    const id = await asA.mutation(api.notes.add, { subject, text: `  On the ${subject.kind}  ` });
    await expect(asB.query(api.notes.list, { subject })).rejects.toThrow("Not found");
    await expect(asB.mutation(api.notes.add, { subject, text: "Mine now" })).rejects.toThrow("Not found");
    await expect(asB.mutation(api.notes.edit, { id, text: "Changed" })).rejects.toThrow("Not found");
    await expect(asB.mutation(api.notes.remove, { id })).rejects.toThrow("Not found");
    expect((await asA.query(api.notes.list, { subject })).map((n) => [n.text, n.editedAt])).toEqual([[`On the ${subject.kind}`, null]]);
  }
  // Each list holds only its own subject's notes; edit dates the change, remove takes it away.
  const [note] = await asA.query(api.notes.list, { subject: subjects[1] });
  await expect(asA.mutation(api.notes.edit, { id: note.id, text: "   " })).rejects.toThrow("Write the note");
  await asA.mutation(api.notes.edit, { id: note.id, text: "Ask about the night shift" });
  expect((await asA.query(api.notes.list, { subject: subjects[1] }))[0]).toMatchObject({ text: "Ask about the night shift", at: note.at, editedAt: expect.any(Number) });
  await asA.mutation(api.notes.remove, { id: note.id });
  expect(await asA.query(api.notes.list, { subject: subjects[1] })).toEqual([]);
  // A note added to a pursuit goes on its timeline.
  const p = await t.run((ctx) => ctx.db.get(pursuit));
  expect(p!.timeline.map((e) => e.event)).toEqual(["started", "notes"]);
});
