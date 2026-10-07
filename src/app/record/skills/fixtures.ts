import { getFunctionName } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { answer, type Answers } from "../../storyConvex";
import { itemId, NOW, recordFixture, ROLE } from "../fixtures";
import type { Data, OnResume } from "./words";

// The Skills, Tools and Certifications stories: the record's fixture, plus what these screens add to it (facts they
// were found in, a certification's issuer, why a pair looks the same, a Samsara tool), the resumes that list them,
// and answers for their mutations (skills.*, resume.setSkillPresentation) that change the fixture as the real ones do.

type Item = Doc<"items">;
type SkillDoc = Extract<Item, { kind: "skill" | "tool" | "certification" }>;
const DAY = 86_400_000;
const isSkill = (i: Item): i is SkillDoc => i.kind === "skill" || i.kind === "tool" || i.kind === "certification";

// The resumes in the stories: the base resume, two direction resumes and a tailored one.
const RESUMES = [
  { id: "r-base" as Id<"resumes">, key: "base", kind: "base" as const, name: "Base resume", at: NOW, state: "upToDate" as const },
  { id: "r-meridian" as Id<"resumes">, key: "r-meridian", kind: "tailored" as const, name: "Supply Chain Product Manager · Meridian Coldchain", at: NOW - DAY, state: null },
  { id: "r-product" as Id<"resumes">, key: "d-product", kind: "direction" as const, name: "Supply Chain Product", at: NOW - 4 * DAY, state: "changed" as const },
  { id: "r-solutions" as Id<"resumes">, key: "d-solutions", kind: "direction" as const, name: "Solutions Consulting", at: NOW - 4 * DAY, state: "upToDate" as const },
];

export const SKILL_IDS = {
  negotiationTwo: itemId("s-negotiation-2"),
  recall: itemId("s-recall"),
  sop: itemId("s-sop"),
  postgres: itemId("s-postgres"),
  samsara: itemId("t-samsara"),
  netsuite: itemId("t-netsuite"),
  postmark: itemId("t-postmark"),
  cpim: itemId("cert-cpim"),
} as const;

export function skillsFixture({ gathering, empty = false, leftOut = [] }: { gathering?: "running" | "failed"; empty?: boolean; leftOut?: string[] } = {}) {
  const fx = recordFixture({ empty });
  const { state } = fx;
  state.presentation = { ...state.presentation, skills: leftOut.map((key) => ({ key, hidden: true })) };
  const fact = (id: string, roleKey: string, text: string): Item => ({
    _id: itemId(id),
    _creationTime: NOW - 8 * DAY,
    workspaceId: "ws-owner" as Id<"workspaces">,
    kind: "fact",
    status: "approved",
    roleKey,
    at: NOW - 8 * DAY,
    data: { text },
    sources: [],
  });
  if (!empty)
    state.items.push(
    fact("f-kcPlan-cpim", ROLE.kcPlan, "Earned the ASCM CPIM certification in 2019, studying nights while running the brewery’s production plan."),
    fact("f-ib-samsara", ROLE.ib, "Put Samsara telematics on the Pittsburgh fleet so dispatchers could see every truck’s arrival time and dwell at the dock."),
    {
      _id: SKILL_IDS.samsara,
      _creationTime: NOW - 9 * DAY,
      workspaceId: "ws-owner" as Id<"workspaces">,
      kind: "tool",
      status: "proposed",
      at: NOW - 9 * DAY,
      data: { name: "Samsara", group: "Fleet telematics", from: { roles: [ROLE.ib], projects: [], facts: [itemId("f-ib-samsara")] } },
      sources: [],
    },
  );
  const patch = (id: string, data: Partial<SkillDoc["data"]>) => {
    state.items = state.items.map((i) => (i._id === id && isSkill(i) ? ({ ...i, data: { ...i.data, ...data } } as Item) : i));
  };
  patch(SKILL_IDS.cpim, { issuer: "ASCM", from: { roles: [ROLE.kcPlan], projects: [], facts: [itemId("f-kcPlan-cpim")] } });
  patch(SKILL_IDS.negotiationTwo, { sameWhy: "Both describe bargaining with the companies you buy from. The longer one only adds the carrier rate resets at Ironbridge." });
  if (gathering) state.jobs = [{ kind: "skills", args: {}, status: gathering, ...(gathering === "failed" ? { error: "The model didn’t answer." } : {}) }, ...state.jobs];

  // Which resumes list an approved one: every resume lists the approved ones; the tailored and direction resumes only
  // the first few tools. Each shows it unless the record leaves it out.
  const listing = (id: string) => {
    const s = state.items.find((i) => i._id === id);
    if (!s || !isSkill(s) || s.status !== "approved") return [];
    const approved = state.items.filter((i): i is SkillDoc => isSkill(i) && i.status === "approved");
    return s.kind === "tool" && approved.filter((i) => i.kind === "tool").indexOf(s) > 0 ? RESUMES.slice(0, 1) : RESUMES;
  };
  const hidden = (id: string) => state.presentation.skills.some((k) => k.key === id && k.hidden);
  const skillsOf = (): OnResume["skills"] => {
    const approved = state.items.filter((i): i is SkillDoc => isSkill(i) && i.status === "approved");
    return (["skill", "tool", "certification"] as const)
      .map((k) => ({ group: { skill: "Skills", tool: "Tools", certification: "Certifications" }[k], items: approved.filter((i) => i.kind === k).map((i) => ({ text: i.data.name, key: i._id as string })) }))
      .filter((g) => g.items.length);
  };
  const list = fx.answers[getFunctionName(api.skills.list)] as () => Data;
  const change = (id: string, next: (i: SkillDoc) => SkillDoc) => {
    state.items = state.items.map((i) => (i._id === id && isSkill(i) ? next(i) : i));
  };

  const answers: Answers = {
    ...fx.answers,
    ...answer(api.skills.list, () => {
      const out = list();
      return { ...out, items: out.items.map((s) => ({ ...s, resumes: hidden(s.id) ? 0 : listing(s.id).length })) };
    }),
    ...answer(api.skills.onResumes, ({ id }) => listing(id).map((r) => ({ ...r, shown: !hidden(id), skills: skillsOf() }))),
    ...answer(api.skills.start, () => {
      state.jobs = [{ kind: "skills", args: {}, status: "done", result: { added: 0 } }, ...state.jobs];
      return "job-skills" as Id<"jobs">;
    }),
    ...answer(api.skills.edit, ({ id, name, group, kind, issuer, earned }) =>
      change(id, (i) => ({
        ...i,
        kind,
        status: "approved",
        data: {
          ...i.data,
          name: name.trim(),
          group: group?.trim() || undefined,
          issuer: kind === "certification" ? (issuer === undefined ? i.data.issuer : issuer.trim() || undefined) : undefined,
          earned: kind === "certification" ? (earned === undefined ? i.data.earned : earned.trim() || undefined) : undefined,
          lowValue: undefined,
          edited: true,
        },
      })),
    ),
    ...answer(api.skills.classify, ({ ids, group, kind }) => {
      for (const id of ids)
        change(id, (i) => {
          const k = kind ?? i.kind;
          return { ...i, kind: k, data: { ...i.data, ...(group !== undefined ? { group: group.trim() || undefined } : {}), ...(k !== "certification" ? { issuer: undefined, earned: undefined } : {}) } };
        });
    }),
    ...answer(api.skills.merge, ({ id, keep }) => {
      const item = state.items.find((i): i is SkillDoc => i._id === id && isSkill(i))!;
      const other = state.items.find((i): i is SkillDoc => i._id === item.data.sameAs && isSkill(i))!;
      const [kept, gone] = keep === "this" ? [item, other] : [other, item];
      const undoMerge = { status: gone.status, flagged: keep === "this" ? ("kept" as const) : ("removed" as const), keptStatus: kept.status, keptFrom: kept.data.from, keptApart: kept.data.keptApart };
      const from = { roles: [...new Set([...kept.data.from.roles, ...gone.data.from.roles])], projects: [...new Set([...kept.data.from.projects, ...gone.data.from.projects])], facts: [...new Set([...kept.data.from.facts, ...gone.data.from.facts])] };
      change(kept._id, (i) => ({ ...i, status: "approved", data: { ...i.data, sameAs: undefined, from } }));
      change(gone._id, (i) => ({ ...i, status: "superseded", data: { ...i.data, sameAs: undefined, mergedInto: kept._id, undoMerge } }));
    }),
    ...answer(api.skills.unmerge, ({ id }) => {
      const gone = state.items.find((i): i is SkillDoc => i._id === id && isSkill(i))!;
      const u = gone.data.undoMerge!;
      change(gone.data.mergedInto!, (i) => ({ ...i, status: u.keptStatus, data: { ...i.data, from: u.keptFrom, keptApart: u.keptApart, sameAs: u.flagged === "kept" ? gone._id : i.data.sameAs } }));
      change(id, (i) => ({ ...i, status: u.status, data: { ...i.data, mergedInto: undefined, undoMerge: undefined, sameAs: u.flagged === "removed" ? gone.data.mergedInto : undefined } }));
    }),
    ...answer(api.skills.keepApart, ({ id, reason }) => {
      const item = state.items.find((i): i is SkillDoc => i._id === id && isSkill(i))!;
      const other = item.data.sameAs!;
      change(id, (i) => ({ ...i, data: { ...i.data, sameAs: undefined, keptApart: [...(i.data.keptApart ?? []), other], apartBecause: reason?.trim() ? [...(i.data.apartBecause ?? []), { id: other, reason: reason.trim() }] : i.data.apartBecause } }));
      change(other, (i) => ({ ...i, data: { ...i.data, keptApart: [...(i.data.keptApart ?? []), id] } }));
    }),
    ...answer(api.skills.reopenPair, ({ id, other }) => {
      change(id, (i) => ({ ...i, data: { ...i.data, sameAs: other, keptApart: i.data.keptApart?.filter((x) => x !== other), apartBecause: i.data.apartBecause?.filter((a) => a.id !== other) } }));
      change(other, (i) => ({ ...i, data: { ...i.data, keptApart: i.data.keptApart?.filter((x) => x !== id) } }));
    }),
    ...answer(api.resume.setSkillPresentation, ({ key, hidden: out }) => {
      state.presentation = { ...state.presentation, skills: [...state.presentation.skills.filter((k) => k.key !== key), ...(out ? [{ key, hidden: true }] : [])] };
    }),
  };
  return { state, answers };
}
