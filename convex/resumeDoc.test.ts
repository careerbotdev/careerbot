import { expect, test } from "vitest";
import { type ResumeDoc, arrange, cleanDoc, gaps, present, recordDoc, resumeTitle, suggestTitle, toHtml, toMarkdown, toPlain, toRtf } from "./resumeDoc";

const bullet = (text: string) => ({ text, factIds: [] });
// Most recent first: Brightwater (current), Ironbridge, a career break, Globex.
const doc: ResumeDoc = {
  summary: "S",
  experience: [
    { employer: "Brightwater", title: "Planning Manager", roleKey: "bw", start: "2022-01", bullets: [bullet("Built the weekly planning cadence")] },
    { employer: "Ironbridge", title: "Operations Manager", roleKey: "ib", start: "2021-03", end: "2022-06", bullets: [bullet("Ran the cross-dock")] },
    { employer: "", title: "Career break", roleKey: "break-2020-02", start: "2020-02", end: "2021-01", break: true, reason: "Caregiving", bullets: [] },
    { employer: "Globex", title: "Production Planner", roleKey: "globex", start: "2017-04", end: "2020-01", bullets: [bullet("Ran the line schedule")] },
  ],
  skills: [],
};
const shown = (...layers: Parameters<typeof present>[1][]) => present(doc, ...layers).experience.map((e) => [e.title, e.start, e.end ?? null, e.bullets.map((b) => b.text)]);

test("a title shows official by default, translated, or both; an empty translation falls back to official", () => {
  const titles = (title?: "official" | "translated" | "both", translated?: string) => present(doc, { roles: [{ roleKey: "globex", title, translated }] }).experience[3].title;
  expect(titles(undefined, "Senior Planner")).toBe("Production Planner");
  expect(titles("official", "Senior Planner")).toBe("Production Planner");
  expect(titles("translated", "Senior Planner")).toBe("Senior Planner");
  expect(titles("both", "Senior Planner")).toBe("Senior Planner (official: Production Planner)");
  expect(titles("translated", "  ")).toBe("Production Planner");
  // The written resume is never changed.
  expect(doc.experience[3].title).toBe("Production Planner");
});

test("folding into the previous role skips career breaks, widens that role's dates and moves or drops the bullets", () => {
  expect(shown({ roles: [{ roleKey: "ib", fold: { into: "previous", bullets: "move" } }] })).toEqual([
    ["Planning Manager", "2022-01", null, ["Built the weekly planning cadence"]],
    ["Career break", "2020-02", "2021-01", []],
    ["Production Planner", "2017-04", "2022-06", ["Ran the line schedule", "Ran the cross-dock"]],
  ]);
  expect(shown({ roles: [{ roleKey: "globex", fold: { into: "next", bullets: "drop" } }, { roleKey: "break-2020-02", hidden: true }] })).toEqual([
    ["Planning Manager", "2022-01", null, ["Built the weekly planning cadence"]],
    ["Operations Manager", "2017-04", "2022-06", ["Ran the cross-dock"]],
  ]);
});

test("folding into the next role keeps a current role current, and reports where each fold went", () => {
  const { doc: out, folds } = arrange(doc, { roles: [{ roleKey: "ib", fold: { into: "next", bullets: "move" } }] });
  expect(out.experience[0]).toMatchObject({ title: "Planning Manager", start: "2021-03", bullets: [bullet("Built the weekly planning cadence"), bullet("Ran the cross-dock")] });
  expect(out.experience[0].end).toBeUndefined();
  expect(folds.map((f) => [f.roleKey, f.into.roleKey])).toEqual([["ib", "bw"]]);
});

test("a fold skips entries that are folded or hidden themselves, and a break folds into a role", () => {
  expect(shown({ roles: [{ roleKey: "ib", fold: { into: "previous", bullets: "move" } }, { roleKey: "break-2020-02", fold: { into: "previous", bullets: "drop" } }] })).toEqual([
    ["Planning Manager", "2022-01", null, ["Built the weekly planning cadence"]],
    ["Production Planner", "2017-04", "2022-06", ["Ran the line schedule", "Ran the cross-dock"]],
  ]);
});

test("a fold with no role on that side is refused and the entry stays", () => {
  const { doc: out, refused } = arrange(doc, { roles: [{ roleKey: "bw", fold: { into: "next", bullets: "move" } }, { roleKey: "globex", fold: { into: "previous", bullets: "move" } }] });
  expect(refused).toEqual(["bw", "globex"]);
  expect(out.experience.map((e) => e.roleKey)).toEqual(["bw", "ib", "break-2020-02", "globex"]);
});

test("a career break shows as one line, with its reason only when chosen, or is left out entirely", () => {
  expect(toPlain(present(doc))).toContain("\nCareer break · Feb 2020 – Jan 2021\n");
  expect(toPlain(present(doc, { roles: [{ roleKey: "break-2020-02", showReason: true }] }))).toContain("\nCareer break · Feb 2020 – Jan 2021 · Caregiving\n");
  const hidden = toPlain(present(doc, { roles: [{ roleKey: "break-2020-02", hidden: true, showReason: true }] }));
  expect(hidden).not.toContain("Career break");
  expect(hidden).not.toContain("Feb 2020");
});

test("translated titles are suggested from the direction's title map, else the record's market title, never invented", () => {
  const map = [{ from: "production planner", to: "Senior Production Planner" }];
  expect(suggestTitle({ title: "Production Planner", marketTitle: "Dock Operations Lead" }, map)).toEqual({ text: "Senior Production Planner", from: "direction" });
  expect(suggestTitle({ title: "Operations Manager", marketTitle: "Dock Operations Lead" }, map)).toEqual({ text: "Dock Operations Lead", from: "record" });
  expect(suggestTitle({ title: "Operations Manager", alternateTitles: ["operations manager", "Fractional COO"] })).toEqual({ text: "Fractional COO", from: "record" });
  expect(suggestTitle({ title: "Operations Manager" }, map)).toBeNull();
  expect(suggestTitle({ title: "Operations Manager", marketTitle: "OPERATIONS MANAGER" })).toBeNull();
});

test("gaps of three months or more between roles are found, newest first; overlaps and current roles cover time", () => {
  expect(
    gaps([
      { start: "2017-04", end: "2019-03" },
      { start: "2019-07", end: "2019-12" },
      { start: "2019-11", end: "2020-01" },
      { start: "2020-03", end: "2021-01" },
      { start: "2021-06", end: null },
      { start: "2022-01", end: "2022-02" },
      { start: null, end: "2016-01" },
    ]),
  ).toEqual([
    { start: "2021-02", end: "2021-05" },
    { start: "2019-04", end: "2019-06" },
  ]);
  // A year alone runs January to December.
  expect(gaps([{ start: "2015", end: "2016" }, { start: "2017", end: "2018" }])).toEqual([]);
});

test("a career break needs no employer or bullets, and one the model left out is kept, placed by its dates", () => {
  const roles = [
    { roleKey: "acme", employer: "Acme", title: "Head of CS", start: "2021-01" },
    { roleKey: "break-2019-06", title: "Career break", start: "2019-06", end: "2020-12", break: true, reason: "Study" },
    { roleKey: "globex", employer: "Globex", title: "Planner", start: "2016-01", end: "2019-05" },
  ];
  const out = cleanDoc(
    { summary: "S", experience: [{ roleKey: "acme", bullets: [{ text: "Cut churn", factIds: [] }] }, { roleKey: "globex", bullets: [{ text: "Grew accounts", factIds: [] }] }] },
    new Map(),
    roles,
  );
  expect(out!.experience.map((e) => [e.roleKey, e.employer, e.title, e.break ?? false, e.reason ?? null])).toEqual([
    ["acme", "Acme", "Head of CS", false, null],
    ["break-2019-06", "", "Career break", true, "Study"],
    ["globex", "Globex", "Planner", false, null],
  ]);
});

test("a role with no official title stays on the resume under its best other title, and only one with no title at all is left off", () => {
  const roles = [
    { roleKey: "acme", employer: "Acme", alternateTitles: ["Learning Designer", "Instructional Designer"], start: "2021-01" },
    { roleKey: "globex", employer: "Globex", title: "", alternateTitles: [], start: "2016-01", end: "2019-05" },
  ];
  const out = cleanDoc(
    { summary: "S", experience: [{ roleKey: "acme", bullets: [{ text: "Built courses", factIds: [] }] }, { roleKey: "globex", bullets: [{ text: "Grew accounts", factIds: [] }] }] },
    new Map(),
    roles,
  );
  expect(out!.experience.map((e) => [e.roleKey, e.title])).toEqual([["acme", "Learning Designer"]]);
  expect(resumeTitle({ title: " ", alternateTitles: ["", " Teacher "] })).toEqual({ text: "Teacher", official: false });
  expect(resumeTitle({ title: "Teacher II", alternateTitles: ["Teacher"] })).toEqual({ text: "Teacher II", official: true });
  expect(resumeTitle({ alternateTitles: [] })).toBeNull();
  expect(recordDoc([{ roleKey: "acme", employer: "Acme", alternateTitles: ["Learning Designer"], start: "2021-01" }]).experience.map((e) => e.title)).toEqual(["Learning Designer"]);
  // Translations are offered against the title the resume uses.
  expect(suggestTitle({ employer: "Acme", alternateTitles: ["Learning Designer", "Instructional Designer"] })).toEqual({ text: "Instructional Designer", from: "record" });
});

test("a direction's title map written as 'Title (Employer)' suggests for that employer's role only", () => {
  const map = [{ from: "Supply Planning Manager (Brightwater)", to: "Supply Chain Product Manager" }, { from: "Network Operations (Ironbridge Logistics)", to: "Solutions Consultant or Product Manager" }];
  expect(suggestTitle({ title: "Supply Planning Manager", employer: "Brightwater" }, map)).toEqual({ text: "Supply Chain Product Manager", from: "direction" });
  expect(suggestTitle({ title: "Supply Planning Manager", employer: "Acme" }, map)).toBeNull();
  expect(suggestTitle({ title: "Network Operations", employer: "Ironbridge Logistics" }, map)?.text).toBe("Solutions Consultant");
});

test("layers merge field by field: an override wins where it's set, null unfolds, and the rest comes from the settings", () => {
  const settings = { roles: [{ roleKey: "ib", fold: { into: "previous" as const, bullets: "move" as const } }, { roleKey: "globex", title: "translated" as const, translated: "Senior Planner" }, { roleKey: "break-2020-02", hidden: true }] };
  expect(shown(settings)).toEqual([
    ["Planning Manager", "2022-01", null, ["Built the weekly planning cadence"]],
    ["Senior Planner", "2017-04", "2022-06", ["Ran the line schedule", "Ran the cross-dock"]],
  ]);
  const override = { roles: [{ roleKey: "ib", fold: null }, { roleKey: "globex", title: "both" as const }, { roleKey: "break-2020-02", hidden: false, showReason: true }] };
  expect(present(doc, settings, override).experience.map((e) => (e.break ? [e.title, e.reason] : [e.title, e.end ?? null]))).toEqual([
    ["Planning Manager", null],
    ["Operations Manager", "2022-06"],
    ["Career break", "Caregiving"],
    ["Senior Planner (official: Production Planner)", "2020-01"],
  ]);
});

test("a hidden bullet never shows; a pinned one always does, even when its role folds and leaves its bullets out", () => {
  const two: ResumeDoc = { ...doc, experience: doc.experience.map((e) => (e.roleKey === "ib" ? { ...e, bullets: [bullet("Ran the cross-dock"), bullet("Ran the board")] } : e)) };
  const layout = { roles: [{ roleKey: "ib", fold: { into: "previous" as const, bullets: "drop" as const } }], bullets: [{ text: "Ran the board", state: "pinned" as const }, { text: "Built the weekly planning cadence", state: "hidden" as const }] };
  expect(present(two, layout).experience.map((e) => [e.title, e.bullets.map((b) => b.text)])).toEqual([
    ["Planning Manager", []],
    ["Career break", []],
    ["Production Planner", ["Ran the line schedule", "Ran the board"]],
  ]);
});

test("a resume lists only approved skills, each once, and at most the strongest twenty", () => {
  const skills = new Map(Array.from({ length: 25 }, (_, i) => [`k${i}`, `Skill ${i}`]));
  const out = cleanDoc({ summary: "S", experience: [], skills: [{ group: "Tools", items: [...skills.keys(), "k0", "skill 1", "Made up"] }] }, new Map(), [], [], new Map(), skills);
  expect(out!.skills[0].keys).toEqual(Array.from({ length: 20 }, (_, i) => `k${i}`));
});

// Trail is part of Brightwater, Kiln of Ironbridge; Notes isn't linked to a role.
const withProjects: ResumeDoc = {
  ...doc,
  projects: [
    { projectKey: "trail", name: "Trail", url: "https://github.com/octo/trail", start: "2024-01", roleKey: "bw", bullets: [bullet("Built map search")] },
    { projectKey: "kiln", name: "Kiln", roleKey: "ib", bullets: [bullet("Wrote firing schedules"), bullet("Fixed the kiln")] },
    { projectKey: "notes", name: "Notes", url: "https://github.com/octo/notes", start: "2023-02", end: "2023-09", bullets: [bullet("Built Notes")] },
  ],
};
const inside = (d: ResumeDoc) => [d.experience.map((e) => [e.roleKey, (e.projects ?? []).map((p) => [p.name, p.bullets.map((b) => b.text)])]), (d.projects ?? []).map((p) => p.name)];

test("a project linked to a role shows inside it, in present and every export; the rest stay under Projects", () => {
  const out = present(withProjects);
  expect(inside(out)).toEqual([
    [["bw", [["Trail", ["Built map search"]]]], ["ib", [["Kiln", ["Wrote firing schedules", "Fixed the kiln"]]]], ["break-2020-02", []], ["globex", []]],
    ["Notes"],
  ]);
  const plain = toPlain(out);
  expect(plain).toContain("\nPlanning Manager, Brightwater\nJan 2022 – Present\n- Built the weekly planning cadence\nProject: Trail · github.com/octo/trail\n- Built map search\n");
  expect(plain).toContain("- Ran the cross-dock\nProject: Kiln\n- Wrote firing schedules\n");
  expect(plain).toContain("\nPROJECTS\n\nNotes · github.com/octo/notes\nFeb 2023 – Sep 2023\n- Built Notes");
  expect(plain.match(/Trail/g)).toHaveLength(1);
  const md = toMarkdown(out);
  expect(md).toContain("- Built the weekly planning cadence\n\n**Project: Trail** · [github.com/octo/trail](https://github.com/octo/trail)\n\n- Built map search\n");
  expect(md).not.toContain("### Trail");
  // HTML and RTF as read: the project follows its role's bullets, before Projects, and isn't repeated there.
  const htmlText = toHtml(out).replace(/<[^>]+>/g, "").replace(/&ensp;/g, " ");
  expect(htmlText).toContain("Built the weekly planning cadence\nProject: Trail · github.com/octo/trail\nBuilt map search");
  expect(htmlText.indexOf("Project: Trail")).toBeLessThan(htmlText.indexOf("PROJECTS"));
  expect(htmlText.match(/Trail/g)).toHaveLength(1);
  expect(toHtml(out)).toContain('<a href="https://github.com/octo/trail" style="color:inherit">github.com/octo/trail</a>');
  const rtf = toRtf(out);
  expect(rtf).toContain("Project: Trail \\u183? github.com/octo/trail");
  expect(rtf.indexOf("Project: Trail")).toBeLessThan(rtf.indexOf("PROJECTS"));
  expect(rtf.match(/Trail/g)).toHaveLength(1);
  // Dates sit on a right tab stop at the margin, as in the PDF and Word.
  expect(rtf).toContain("\\tqr\\tx10080\\fs20{\\b Planning Manager}\\tab Jan 2022 \\u8211? Present");
});

test("a linked project left out is gone; with its role left out it shows under Projects; it goes where its role folds", () => {
  expect(inside(present(withProjects, { roles: [], projects: [{ projectKey: "trail", hidden: true }] }))[0][0]).toEqual(["bw", []]);
  expect(toPlain(present(withProjects, { roles: [], projects: [{ projectKey: "trail", hidden: true }] }))).not.toContain("Trail");
  expect(inside(present(withProjects, { roles: [{ roleKey: "bw", hidden: true }] }))[1]).toEqual(["Trail", "Notes"]);
  // Ironbridge folds into Globex (the break is skipped): Kiln moves with its bullets, or keeps only a pinned one.
  const moved = arrange(withProjects, { roles: [{ roleKey: "ib", fold: { into: "previous", bullets: "move" } }] });
  expect(inside(moved.doc)[0]).toEqual([["bw", [["Trail", ["Built map search"]]]], ["break-2020-02", []], ["globex", [["Kiln", ["Wrote firing schedules", "Fixed the kiln"]]]]]);
  expect(moved.placed).toEqual({ trail: "bw", kiln: "globex" });
  const dropped = present(withProjects, { roles: [{ roleKey: "ib", fold: { into: "previous", bullets: "drop" } }], bullets: [{ text: "Fixed the kiln", state: "pinned" }] });
  expect(inside(dropped)[0][2]).toEqual(["globex", [["Kiln", ["Fixed the kiln"]]]]);
  expect(inside(present(withProjects, { roles: [{ roleKey: "ib", fold: { into: "previous", bullets: "drop" } }] }))[0][2]).toEqual(["globex", []]);
});

test("a written project keeps the role it's linked to, and that role keeps its entry for it", () => {
  const roles = [{ roleKey: "bw", employer: "Brightwater", title: "Planning Manager", start: "2022-01" }, { roleKey: "globex", employer: "Globex", title: "Production Planner", start: "2017-04", end: "2020-01" }];
  const out = cleanDoc(
    { summary: "S", experience: [{ roleKey: "globex", bullets: [{ text: "Ran the line schedule", factIds: ["g1"] }] }], projects: [{ projectKey: "trail", bullets: [{ text: "Built map search", factIds: ["t1"] }] }], skills: [] },
    new Map([["g1", "globex"]]),
    roles,
    [{ projectKey: "trail", name: "Trail", roleKey: "bw" }],
    new Map([["t1", "trail"]]),
  );
  expect(out!.experience.map((e) => [e.roleKey, e.bullets.length])).toEqual([["bw", 0], ["globex", 1]]);
  expect(out!.projects).toEqual([{ projectKey: "trail", name: "Trail", roleKey: "bw", bullets: [{ text: "Built map search", factIds: ["t1"] }] }]);
  expect(inside(present(out!))[0]).toEqual([["bw", [["Trail", ["Built map search"]]]], ["globex", []]]);
});
