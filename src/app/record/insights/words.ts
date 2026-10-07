import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import { clockNow } from "../../clock";

export type Insight = FunctionReturnType<typeof api.insights.list>["insights"][number];
export type RecordItem = FunctionReturnType<typeof api.extract.items>[number];
export type Fact = Insight["basedOn"][number];

// The reasons an insight is turned down, as quick picks.
export const INSIGHT_REASONS = ["Not true", "Overstated", "Not how I see myself", "Repeats another"];

// What each move on an insight does, the same in the list's row menu, the item's buttons and its ⋯ menu.
export const EXPLAIN = {
  edit: { detail: "Rewords the insight; your wording is kept as approved.", note: "Free · Undo with U" },
  undoApproval: { detail: "Moves the insight back to Review. Resumes stop using it until you approve it again.", note: "Free · Undo with U" },
  reject: { detail: "Turns the insight down, with why if you like, so none like it come back.", note: "Free · Undo with U" },
  moveBack: { detail: "Puts the insight back in Review to decide again.", note: "Free · Undo with U" },
  reason: { note: "Free · Change it again any time" },
  quotes: (open: boolean) => ({ detail: open ? "Closes the facts and story quotes beside it." : "Opens the facts it’s built on beside it, with the story words each was read from.", note: "Free" }),
} as const;

// An insight reads as its claim and, often, one sentence of evidence: the claim heads the item, the rest reads under it.
export function claimOf(text: string): { claim: string; rest: string } {
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text.trim());
  return m ? { claim: m[1], rest: m[2] } : { claim: text.trim(), rest: "" };
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const day = (at: number, now = clockNow()) => (new Date(at).toDateString() === new Date(now).toDateString() ? "Today" : DAY.format(at));

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Where the record's roles and projects are, by key, to name and link a fact's owner.
export type Owners = {
  roles: Map<string, { id: string; label: string; employer: string | null }>;
  projects: Map<string, { id: string; name: string }>;
  facts: Map<string, RecordItem>;
};

export function ownersOf(items: RecordItem[] | undefined): Owners {
  const roles: Owners["roles"] = new Map();
  const projects: Owners["projects"] = new Map();
  const facts: Owners["facts"] = new Map();
  for (const i of items ?? []) {
    if (i.kind === "role" && i.roleKey) {
      const label = [i.data.title, i.data.employer].filter(Boolean).join(" · ") || i.roleKey;
      roles.set(i.roleKey, { id: i.id, label, employer: i.data.employer ?? null });
    } else if (i.kind === "project" && i.projectKey) projects.set(i.projectKey, { id: i.id, name: i.data.name });
    else if (i.kind === "fact") facts.set(i.id, i);
  }
  return { roles, projects, facts };
}

// Where a fact lives: its role or project, named, with the address that opens the fact there.
export function placeOf(f: Fact, owners: Owners): { key: string; label: string; href: string | null; where: "Roles" | "Projects" } {
  if (f.projectKey) {
    const p = owners.projects.get(f.projectKey);
    return { key: f.projectKey, label: p?.name ?? f.project ?? "Project", href: p ? `/record/projects?project=${p.id}&fact=${f.id}` : null, where: "Projects" };
  }
  const key = f.roleKey ?? "";
  const r = owners.roles.get(key);
  return { key, label: r?.label ?? f.role ?? "Role", href: key ? `/record/roles?role=${encodeURIComponent(key)}&fact=${f.id}` : null, where: "Roles" };
}

// "5 facts · Ironbridge Logistics, Lanebook": how many facts it's built on and the employers and projects they come from.
export function rowLine(i: Insight, owners: Owners) {
  const from = [
    ...new Set(i.basedOn.map((f) => (f.projectKey ? (owners.projects.get(f.projectKey)?.name ?? f.project) : (owners.roles.get(f.roleKey ?? "")?.employer ?? f.role)) ?? null).filter((x): x is string => !!x)),
  ];
  return [plural(i.basedOn.length, "fact"), from.join(", ")].filter(Boolean).join(" · ");
}

// What an edit took out and put in, word by word (case and punctuation aside): the longest run of each, shortened.
export function changeOf(before: string, after: string): { out: string; in: string } {
  const a = before.trim().split(/\s+/);
  const b = after.trim().split(/\s+/);
  const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");
  // Longest common subsequence lengths, from the end.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let x = a.length - 1; x >= 0; x--) for (let y = b.length - 1; y >= 0; y--) lcs[x][y] = bare(a[x]) === bare(b[y]) ? lcs[x + 1][y + 1] + 1 : Math.max(lcs[x + 1][y], lcs[x][y + 1]);
  const outs: string[][] = [];
  const ins: string[][] = [];
  let x = 0;
  let y = 0;
  let last: "same" | "out" | "in" = "same";
  while (x < a.length || y < b.length) {
    if (x < a.length && y < b.length && bare(a[x]) === bare(b[y])) {
      x++;
      y++;
      last = "same";
    } else if (y >= b.length || (x < a.length && lcs[x + 1][y] >= lcs[x][y + 1])) {
      if (last !== "out") outs.push([]);
      outs[outs.length - 1].push(a[x++]);
      last = "out";
    } else {
      if (last !== "in") ins.push([]);
      ins[ins.length - 1].push(b[y++]);
      last = "in";
    }
  }
  const longest = (runs: string[][]) => {
    const words = runs.reduce<string[]>((best, r) => (r.length > best.length ? r : best), []).join(" ").replace(/^[,;:.]+|[,;:.]+$/g, "");
    return words.length > 60 ? `${words.slice(0, 57).trimEnd()}…` : words;
  };
  return { out: longest(outs), in: longest(ins) };
}
