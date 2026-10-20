import type { LayoutRole, ResumeLayout } from "./resumeDoc";
import { arrange, part, PLACEMENT, recordDoc } from "./resumeDoc";

// How the record's roles are placed on one resume, as the writer is told it: the record's setting (resumeSettings)
// with the resume's own override on top, judged by the same rules as a shown resume (resumeDoc.arrange), so a fold
// with nothing to fold into stays its own entry. Only roles that aren't their own entry are listed, by roleKey, so the
// list is stable to compare (resumeBasis: a change marks the resume changed). Pure: no database access.

export type Placed = { roleKey: string; how: "out" | "fold"; into?: string; lines?: "move" | "drop" };

type RoleIn = Parameters<typeof recordDoc>[0][number];
type Layer = Pick<ResumeLayout, "roles"> | null | undefined;

export function placementOf(roles: RoleIn[], ...layers: Layer[]): Placed[] {
  const placed = layers.map((l) => (l ? { roles: l.roles.map((r: LayoutRole) => part(r, PLACEMENT)) } : l));
  const doc = recordDoc(roles);
  const shown = arrange(doc, ...placed);
  const left = shown.doc.experience.map((e) => e.roleKey);
  const out = doc.experience.flatMap((e) => (left.includes(e.roleKey) || shown.folds.some((f) => f.roleKey === e.roleKey) ? [] : [e.roleKey!]));
  // Later layers win, as in arrange.
  const lines = new Map(placed.flatMap((l) => l?.roles ?? []).flatMap((r) => (r.fold ? [[r.roleKey, r.fold.bullets] as const] : [])));
  return [
    ...out.map((roleKey): Placed => ({ roleKey, how: "out" })),
    ...shown.folds.map((f): Placed => ({ roleKey: f.roleKey, how: "fold", into: f.into.roleKey, lines: lines.get(f.roleKey) ?? "move" })),
  ].sort((a, b) => a.roleKey.localeCompare(b.roleKey));
}

type WriterRecord = {
  roles: { roleKey?: string }[];
  projects: { projectKey: string; roleKey?: string }[];
  facts: { roleKey?: string; projectKey?: string }[];
  context: { roleKey?: string; projectKey?: string }[];
};

// The record as the writer reads it under a placement: a role left out, or folded with its lines left out, gives none
// of its own facts or context; its title and dates stay, so the dates of the role it folds into still read right. A
// folded role whose lines are kept is told it belongs to the role it folds into, so its facts are written as part of
// that entry. Projects keep their own visibility: a project's facts and context go unless the project itself is
// hidden on this resume (`hiddenProjects`), whatever its linked role's placement.
export function writerRecord<R extends WriterRecord>(
  record: R,
  placement: Placed[],
  hiddenProjects: string[] = [],
): Omit<R, "roles"> & { roles: (R["roles"][number] & { onResumes?: string })[] } {
  const by = new Map(placement.map((p) => [p.roleKey, p]));
  const silent = new Set(placement.filter((p) => p.how === "out" || p.lines === "drop").map((p) => p.roleKey));
  const keeps = (x: { roleKey?: string; projectKey?: string }) => (x.projectKey ? !hiddenProjects.includes(x.projectKey) : !(x.roleKey && silent.has(x.roleKey)));
  const note = (p: Placed | undefined) =>
    !p
      ? undefined
      : p.how === "out"
        ? "Left out of this resume: write nothing for it."
        : p.lines === "drop"
          ? `Folded into ${p.into}: only its title and dates show, inside that role's entry; write no lines for it.`
          : `Folded into ${p.into}: write its facts as lines of that role's entry.`;
  return {
    ...record,
    roles: record.roles.map((r) => {
      const n = note(r.roleKey ? by.get(r.roleKey) : undefined);
      return n ? { ...r, onResumes: n } : r;
    }),
    facts: record.facts.filter(keeps),
    context: record.context.filter(keeps),
  };
}
