import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { pickDirection, pickRole } from "./itemShapes";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

test("the database refuses item data that doesn't match its kind", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const w = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "a@example.com" }));
    const base = { workspaceId: w, status: "proposed" as const, sources: [], at: 0 };
    await ctx.db.insert("items", { ...base, kind: "fact", data: { text: "Cut churn by 20%." } });
    // A fact with a direction's fields, or an unknown key, is refused.
    await expect(ctx.db.insert("items", { ...base, kind: "fact", data: { name: "Supply Chain Product" } } as never)).rejects.toThrow();
    await expect(ctx.db.insert("items", { ...base, kind: "fact", data: { text: "x", invented: 1 } } as never)).rejects.toThrow();
  });
});

test("model output is reduced to a kind's fields before it's written", () => {
  expect(pickRole({ key: "acme", title: " Head of CS ", team: "CS", surprise: true, skills: ["SQL", 3, ""] })).toEqual({ key: "acme", title: "Head of CS", team: ["CS"], skills: ["SQL"] });
  expect(pickDirection({ name: "Supply Chain Product", path: "sideways", vibe: "x" })).toEqual({ name: "Supply Chain Product" });
});

test("resume formats are made from the structure; RTF escapes braces and non-ASCII", async () => {
  const { toMarkdown, toRtf } = await import("./resumeDoc");
  const doc = { summary: "Leader {CS} café", experience: [{ employer: "Acme", title: "Head of CS", start: "2021-03", bullets: [{ text: "Cut churn by 20%.", factIds: [] }] }], skills: [] };
  expect(toMarkdown(doc)).toContain("### Head of CS, Acme\n*Mar 2021 – Present*");
  const rtf = toRtf(doc);
  expect(rtf.startsWith("{\\rtf1")).toBe(true);
  expect(rtf).toContain("Leader \\{CS\\} caf\\u233?");
});

test("every text format starts with the person's name and contact line", async () => {
  const { toHtml, toMarkdown, toPlain, toRtf } = await import("./resumeDoc");
  const doc = { summary: "S", experience: [], skills: [] };
  const contact = { name: "Wren Castellano", email: "wren@example.com", links: [] };
  for (const make of [toPlain, toMarkdown, toHtml, toRtf]) {
    const out = make(doc, contact);
    expect(out).toContain("Wren Castellano");
    expect(out).toContain("wren@example.com");
    expect(out.indexOf("Wren Castellano")).toBeLessThan(out.search(/summary/i));
  }
});

test("phones are formatted however they're typed; invalid ones are kept as typed", async () => {
  const { formatPhone } = await import("./profile");
  expect(formatPhone("5125550142")).toBe("(512) 555-0142");
  expect(formatPhone("+1 512.555.0142")).toBe("(512) 555-0142");
  expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  expect(formatPhone("call me")).toBe("call me");
  expect(formatPhone("  ")).toBeUndefined();
});
