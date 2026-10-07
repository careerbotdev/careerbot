"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import { duplicatePairs, sameWorkSuggestions } from "../../../../convex/factPairs";
import { dateLabel, resumeTitle } from "../../../../convex/resumeDoc";
import type { BuiltOnSource } from "@/components/BuiltOn";
import type { IconName } from "@/components/icons";
import { toast } from "@/components/Toast";

// What the facts of a role, career break or project read: the record's items, the stories they came from and the costs.

export type Item = FunctionReturnType<typeof api.extract.items>[number];
export type Fact = Extract<Item, { kind: "fact" }>;
export type Role = Extract<Item, { kind: "role" }>;
export type Project = Extract<Item, { kind: "project" }>;
export type Context = Extract<Item, { kind: "context" }>;
type Story = FunctionReturnType<typeof api.narratives.list>[number];

// Whose facts: a role's (a career break is a role) or a project's.
export type Owner = { roleKey: string } | { projectKey: string };

export const FREE_UNDO = "Free · Undo with U";
export const WHY = "Free · Undo with U · Why is optional and steers what’s proposed next";

// Quick reasons, most common first.
export const PICKS = {
  fact: ["Overstates my part", "Wrong role", "Not true"],
  rewrite: ["Changes the meaning", "Overstates it", "I prefer mine"],
  duplicate: ["Different work", "Different result", "Both matter"],
  sameWork: ["Different work", "Personal project", "Different time"],
};

export const failed = (e: unknown) =>
  toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t save that. Try again.", icon: "failed" });

// A toast is one line: long fact wording is cut short.
export const short = (text: string) => (text.length > 64 ? `${text.slice(0, 61).trimEnd()}…` : text);

// Runs a change, then says so with its Undo.
export function act(run: Promise<unknown>, message: string, icon: IconName, undo?: () => Promise<unknown>) {
  void run.then(
    () => toast({ message, icon, action: undo ? { label: "Undo", key: "U", run: () => void undo().catch(failed) } : undefined }),
    failed,
  );
}

export const monthDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const roleDates = (r: Role) => {
  const start = r.data.start ? dateLabel(r.data.start) : "";
  const end = r.data.end ? dateLabel(r.data.end) : start ? "now" : "";
  // "Jan – Feb 2016" when both fall in one year.
  const same = start && end && start.slice(-4) === end.slice(-4) ? start.slice(0, -5) : start;
  return [same, end].filter(Boolean).join(" – ");
};

export const roleName = (r: Role) => (r.data.break ? `Career break · ${roleDates(r)}` : [resumeTitle(r.data)?.text ?? "Untitled role", r.data.employer].filter(Boolean).join(" · "));

export const isOwnedBy = (owner: Owner) => (i: Item) =>
  "roleKey" in owner ? !i.projectKey && i.roleKey === owner.roleKey : i.projectKey === owner.projectKey;

// Facts that are still in the record (rejected ones are kept apart).
export const live = (f: Fact) => f.status === "approved" || f.status === "proposed";

// The record's items by kind and its stories by id.
export type RecordData = { items: Item[]; facts: Fact[]; roles: Role[]; projects: Project[]; context: Context[]; story: Map<string, Story> };

// The record's items and stories, with what each fact rests on. Undefined while loading.
export function useRecord(): RecordData | undefined {
  const items = useQuery(api.extract.items);
  const stories = useQuery(api.narratives.list);
  return useMemo(() => {
    if (!items || !stories) return undefined;
    const facts = items.filter((i): i is Fact => i.kind === "fact");
    const roles = items.filter((i): i is Role => i.kind === "role");
    const projects = items.filter((i): i is Project => i.kind === "project");
    const context = items.filter((i): i is Context => i.kind === "context");
    const story = new Map<string, Story>(stories.map((s) => [String(s.id), s]));
    return { items, facts, roles, projects, context, story };
  }, [items, stories]);
}

// Where a story's words come from, as a source line: "Brightwater Provisions story · version 2", "Note · One more thing about Ironbridge".
export function storyLine(r: RecordData, narrativeId: string, version?: number) {
  const s = r.story.get(narrativeId);
  if (!s) return "A deleted story";
  const name = s.kind === "note" ? `Note · ${s.title}` : `${s.title} story`;
  return version ? `${name} · version ${version}` : name;
}

export const projectOf = (r: RecordData, f: Fact) => r.projects.find((p) => p.projectKey === f.projectKey);

// A fact's source line where it's shown beside another fact (same work, duplicates).
export function sourceLine(r: RecordData, f: Fact) {
  if (f.projectKey) return `GitHub · ${projectOf(r, f)?.data.repo ?? f.projectKey.replace(/^github:/, "")}`;
  const s = f.sources[0];
  return s ? storyLine(r, String(s.narrativeId), s.version) : "Your words";
}

// What a fact rests on: each story quote, the notes it was rewritten with, and a project's repository.
export function sourcesOf(r: RecordData, f: Fact): BuiltOnSource[] {
  const quotes: BuiltOnSource[] = f.sources.flatMap((s) =>
    s.quotes.map((q) => ({ kind: "quote" as const, text: q, source: storyLine(r, String(s.narrativeId), s.version), href: `/record/story?story=${s.narrativeId}` })),
  );
  const notes: BuiltOnSource[] = (f.data.history ?? [])
    .filter((h) => h.how === "rewrite" && h.note)
    .map((h) => ({ kind: "quote" as const, text: h.note!, source: `Your note · ${monthDay(h.at)}` }));
  const repo: BuiltOnSource[] = f.projectKey ? [{ kind: "fact" as const, text: (f.data.files ?? []).join(", ") || "Commit history", source: sourceLine(r, f), href: projectOf(r, f)?.data.url }] : [];
  return [...quotes, ...notes, ...repo];
}

// Decisions waiting on the owner's facts, in the order they're shown: rewrites, new facts, same work, duplicates.
export type Card =
  | { type: "rewrite"; fact: Fact }
  | { type: "fact"; fact: Fact }
  | { type: "sameWork"; fact: Fact; other: Fact; project: Project; role: Role }
  | { type: "duplicate"; fact: Fact; other: Fact };

export function cardsOf(r: RecordData, owner: Owner): Card[] {
  const mine = isOwnedBy(owner);
  const facts = r.facts.filter(mine);
  const rewrites: Card[] = facts.filter((f) => live(f) && f.data.suggestion?.text && !f.data.suggestion.pending).map((fact) => ({ type: "rewrite", fact }));
  const fresh: Card[] = facts.filter((f) => f.status === "proposed" && !f.data.suggestion && !f.data.noLongerSaid && !f.data.sourceDeleted && !f.data.duplicateOf).map((fact) => ({ type: "fact", fact }));
  const same: Card[] = sameWorkSuggestions(r.facts, r.projects, r.roles)
    .filter((s) => ("roleKey" in owner ? s.other.roleKey === owner.roleKey : s.fact.projectKey === owner.projectKey))
    .map((s) => ({ type: "sameWork", ...s }));
  const twins = duplicatePairs(r.facts);
  const dupes: Card[] = facts.flatMap((f) => (twins.has(f.id) ? [{ type: "duplicate" as const, fact: f, other: twins.get(f.id)! }] : []));
  return [...rewrites, ...fresh, ...same, ...dupes];
}

// Facts connected as the same work, by fact id: the other fact and where it is ("Palletwise", "Senior Supply Planning Manager · Brightwater Provisions").
export function connectedOf(r: RecordData) {
  const out = new Map<string, { other: Fact; where: string; lead: string }>();
  for (const f of r.facts) {
    const c = f.data.sameWork;
    if (!c || !f.projectKey || f.status !== "approved") continue;
    const o = r.facts.find((x) => x.id === c.factId && x.status === "approved" && !x.projectKey && x.data.sameWork?.factId === f.id);
    const p = r.projects.find((x) => x.projectKey === f.projectKey && x.status === "approved");
    const role = r.roles.find((x) => x.status === "approved" && x.roleKey === o?.roleKey);
    if (!o || !p || !role || p.roleKey !== o.roleKey) continue;
    out.set(f.id, { other: o, where: roleName(role), lead: String(c.lead) });
    out.set(o.id, { other: f, where: p.data.name, lead: String(c.lead) });
  }
  return out;
}

// Whether the owner has decisions waiting, for a host that hands its phone bar to them.
export function useFactsHaveCards(owner: Owner) {
  const r = useRecord();
  return !!r && cardsOf(r, owner).length > 0;
}

// Opens Add a fact from a host's own menu (the item ⋯ "Add a fact").
export const ADD_FACT = "record:add-fact";
export const openAddFact = () => window.dispatchEvent(new Event(ADD_FACT));
