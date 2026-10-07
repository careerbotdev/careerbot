"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BuiltOnPeek } from "@/components/BuiltOn";
import { Button } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { StatusTag } from "@/components/StatusTag";
import { whenLong } from "./words";

// What a read of a story proposed, grouped by kind (new facts, updates to facts already there, roles, context, facts it
// no longer says), each group linking to where it's decided: Review while any wait there, else the role it's on.

type Items = FunctionReturnType<typeof api.extract.items>;
type Item = Items[number];
export type Run = FunctionReturnType<typeof api.extract.runFor>;

type Row = { id: string; text: string; was?: string; status: Item["status"]; quotes: string[] };
export type Group = { key: string; label: string; rows: Row[]; link: { label: string; href: string } };

// The roles in their record, by key, as "Senior Supply Planning Manager, Brightwater Provisions".
export function useRoleNames() {
  const items = useQuery(api.extract.items);
  return useMemo(() => {
    const names = new Map<string, { name: string; title: string; employer: string; id: string }>();
    for (const i of items ?? []) {
      if (i.kind !== "role" || i.status === "rejected" || !i.roleKey || i.data.break) continue;
      const title = i.data.title ?? "Role";
      names.set(i.roleKey, { name: [i.data.title, i.data.employer].filter(Boolean).join(", "), title, employer: i.data.employer ?? "", id: i.id });
    }
    return names;
  }, [items]);
}

// The groups for one read of a story (`version`), and how many of their rows wait in Review.
export function useProposals(narrativeId: Id<"narratives">, version: number | null) {
  const items = useQuery(api.extract.items);
  const roles = useRoleNames();
  return useMemo(() => {
    if (!items || version === null) return { groups: [] as Group[], count: 0, waiting: 0, loaded: !!items };
    const mine = (i: Item) => i.sources.filter((s) => s.narrativeId === narrativeId);
    const fromRead = (i: Item) => mine(i).some((s) => s.version === version);
    const quotes = (i: Item) => mine(i).flatMap((s) => s.quotes);
    const onRole = (list: Item[], fallback: string) => {
      const key = list.find((i) => i.roleKey)?.roleKey;
      const role = key ? roles.get(key) : undefined;
      return role ? { label: `On ${role.title}`, href: `/record/roles?role=${encodeURIComponent(key!)}` } : { label: fallback, href: "/record/roles" };
    };
    const link = (list: Item[]) => (list.some((i) => i.status === "proposed") ? { label: "In Review", href: "/review" } : onRole(list, "In Roles"));
    const row = (i: Item, text: string, was?: string): Row => ({ id: i.id, text, was, status: i.status, quotes: quotes(i) });

    const facts = items.filter((i): i is Extract<Item, { kind: "fact" }> => i.kind === "fact" && mine(i).length > 0);
    const added = facts.filter((f) => fromRead(f) && f.data.noLongerSaid == null);
    const updates = facts.filter((f) => f.data.suggestion?.from === "revision" && f.data.suggestion.text);
    const gone = facts.filter((f) => f.data.noLongerSaid != null);
    const roleItems = items.filter((i): i is Extract<Item, { kind: "role" }> => i.kind === "role" && fromRead(i));
    const context = items.filter((i): i is Extract<Item, { kind: "context" }> => i.kind === "context" && fromRead(i));

    const groups: Group[] = [
      { key: "facts", label: "New facts", rows: added.map((f) => row(f, f.data.text)), link: link(added) },
      { key: "updates", label: "Updates", rows: updates.map((f) => row(f, f.data.suggestion!.text!, f.data.text)), link: { label: "In Review", href: "/review" } },
      { key: "roles", label: "Roles", rows: roleItems.map((r) => row(r, [[r.data.title, r.data.employer].filter(Boolean).join(", "), r.data.team?.length ? `team is ${r.data.team.join(", ")}` : ""].filter(Boolean).join(": "))), link: link(roleItems) },
      { key: "context", label: "Context", rows: context.map((c) => row(c, c.data.text)), link: onRole(context, "In Roles") },
      { key: "gone", label: "No longer said", rows: gone.map((f) => row(f, f.data.text)), link: onRole(gone, "In Roles") },
    ].filter((g) => g.rows.length > 0);
    const waiting = added.filter((f) => f.status === "proposed").length + updates.length + roleItems.filter((r) => r.status === "proposed").length + gone.length;
    return { groups, count: groups.reduce((n, g) => n + g.rows.length, 0), waiting, loaded: true };
  }, [items, roles, narrativeId, version]);
}

// The Proposals tab: the read's header (how many, when, what it cost, Review N), then each group.
export function Proposals({ narrativeId, title, run, version, pad }: { narrativeId: Id<"narratives">; title: string; run: Run; version: number; pad: string }) {
  const router = useRouter();
  const shown = run?.lastRead ?? null;
  const { groups, count, waiting } = useProposals(narrativeId, shown);
  const reading = run?.status === "queued" || run?.status === "running";
  const cost = run && run.version === shown && typeof run.result?.costUsd === "number" ? ` · $${(run.result.costUsd as number).toFixed(2)}` : "";

  return (
    <div className={`flex max-w-[860px] flex-col gap-6 py-5 ${pad}`}>
      {reading && (
        <p className="flex items-center gap-2 text-body-sm leading-body-sm text-text">
          <Spinner />
          Reading version {run.version}…
        </p>
      )}
      {shown === null ? (
        !reading && (
          <p className="text-body-sm leading-body-sm text-muted">
            {version > 0 ? `Not read yet. Read it to see what it adds to your record.` : "Write the story, then read it to see what it adds to your record."}
          </p>
        )
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h3 className="text-title-md leading-title-md font-semibold text-text">
                {count} {count === 1 ? "proposal" : "proposals"} from version {shown}
              </h3>
              {run?.lastReadAt != null && (
                <p className="text-body-sm leading-body-sm text-muted">
                  Read {whenLong(run.lastReadAt).replace(/^Today/, "today")}
                  {cost}
                </p>
              )}
            </div>
            {waiting > 0 && (
              <Button variant="primary" icon="review" detail={`Opens Review, where what the read of ${title} proposed waits for your decision.`} note="Free" onClick={() => router.push("/review")}>
                Review {waiting}
              </Button>
            )}
          </div>
          {groups.length === 0 && <p className="text-body-sm leading-body-sm text-muted">Nothing new: your record already had everything this version says.</p>}
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label} className="flex flex-col">
              <div className="flex items-center gap-2 pb-2">
                <h4 className="text-label leading-label font-medium text-text">{g.label}</h4>
                <span className="text-label leading-label text-muted tabular-nums">{g.rows.length}</span>
                <span className="flex-1" />
                <Link href={g.link.href} className="tap flex items-center gap-1 rounded-sm text-body-sm leading-body-sm font-medium text-text hover:underline">
                  {g.link.label}
                  <Icons.goIn aria-hidden className="text-muted" />
                </Link>
              </div>
              <ul className="flex flex-col">
                {g.rows.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 border-t px-2 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {r.was && <p className="text-body-md leading-body-md text-muted line-through">{r.was}</p>}
                      <p className="text-body-md leading-body-md text-text">{r.text}</p>
                    </div>
                    {r.status === "approved" && <StatusTag tone="good">Approved</StatusTag>}
                    {r.status === "rejected" && <StatusTag tone="neutral">Rejected</StatusTag>}
                    {r.quotes.length > 0 && <BuiltOnPeek align="end" sources={r.quotes.map((q) => ({ kind: "quote" as const, text: q, source: `${title} · version ${shown}` }))} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
