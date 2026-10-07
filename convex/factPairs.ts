// Pairs of facts waiting on a decision, shared by the Record page and Review. Pure, so the browser can use it; server
// callers pass items with `id` set to their `_id`.

type Status = "proposed" | "approved" | "rejected" | "skipped" | "superseded" | "setAside";
type FactLike = { id: string; status: Status; roleKey?: string; projectKey?: string; data: { duplicateOf?: string; sameWorkAs?: { factId: string; lead: string } } };
type ProjectLike = { id: string; status: Status; roleKey?: string; projectKey?: string };
type RoleLike = { id: string; status: Status; roleKey?: string; data: { break?: boolean } };

// Duplicates: each flagged fact and the fact it looks like, while both are still in the record (not rejected; merged
// ones are superseded) and in the same role. Keyed by the flagged fact's id.
export function duplicatePairs<F extends FactLike>(facts: F[]) {
  const live = facts.filter((f) => f.status === "proposed" || f.status === "approved");
  return new Map(
    live.flatMap((f) => {
      const twin = live.find((o) => o.id === f.data.duplicateOf && o.roleKey === f.roleKey);
      return twin ? [[f.id, twin] as const] : [];
    }),
  );
}

// Same work waiting for Connect or Keep separate: an approved project fact suggested as the same work as an approved
// fact of the approved role (not a career break) its approved project is linked to.
export function sameWorkSuggestions<F extends FactLike, P extends ProjectLike, R extends RoleLike>(facts: F[], projects: P[], roles: R[]) {
  const out: { fact: F; other: F; project: P; role: R }[] = [];
  for (const f of facts) {
    const s = f.data.sameWorkAs;
    if (!s || !f.projectKey || f.status !== "approved") continue;
    const project = projects.find((p) => p.status === "approved" && p.projectKey === f.projectKey);
    const role = project && roles.find((r) => r.status === "approved" && !r.data.break && r.roleKey === project.roleKey);
    const other = role && facts.find((o) => o.id === s.factId && o.status === "approved" && !o.projectKey && o.roleKey === role.roleKey);
    if (project && role && other) out.push({ fact: f, other, project, role });
  }
  return out;
}
