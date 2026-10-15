"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import { clashOf } from "../../../../convex/limitBuckets";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { limitSummary } from "../limitWords";
import { failed, Notice } from "../ui";
import { clashName, clashWhy, conditionsOf, effectShort, type Effects, type Limit } from "./words";

// Two limits that can't both hold for the same roles (limitBuckets.clashOf): which, why, each one's rule, sentence and
// what it does to the listed roles, with Edit on the other one and Keep both (Undo with U). On a proposed or approved
// limit, and on its Review card.

export const KEEP_BOTH_WORDS = { detail: "Keeps both limits and stops marking them as clashing; a role has to meet both. Shows again if either one changes.", note: "Free · Undo with U" };

export function ClashNotice({ limit: l, other, effects }: { limit: Limit; other: Limit; effects: Effects | undefined }) {
  const router = useRouter();
  const keepBoth = useMutation(api.goals.keepBoth);
  const c = clashOf(l.data, other.data);
  if (!c) return null;
  const why = clashWhy(l.data.kind, c, conditionsOf(l.data));
  const keep = (kept: boolean) => keepBoth({ id: l.id, with: other.id, kept });
  const onKeep = () =>
    void keep(true).then(
      () => toast({ message: "Kept both", icon: "approve", action: { label: "Undo", key: "U", run: () => void keep(false).catch((e: unknown) => failed(e)) } }),
      (e: unknown) => failed(e),
    );
  const name = clashName(other);
  return (
    <Notice tone="caution" title={`Clashes with ${name}`}>
      <div className="flex flex-col gap-2">
        <p>{why.where}, so a role has to meet both. Keep one, change one, or keep both.</p>
        <ul className="flex flex-col border-y">
          <ClashRow limit={l} who="This limit" effects={effects} />
          <ClashRow
            limit={other}
            who="Other limit"
            effects={effects}
            edit={
              <Button variant="ghost" size="sm" detail={`Opens ${name} to change its rule, where it applies or when it holds. Saving approves it.`} note="Free" onClick={() => router.push(`/goals/limits?limit=${other.id}&edit=1`)}>
                Edit
              </Button>
            }
          />
        </ul>
        <div>
          <Button size="sm" {...KEEP_BOTH_WORDS} onClick={onKeep}>
            Keep both
          </Button>
        </div>
      </div>
    </Notice>
  );
}

// One of the two: its rule summed up, whose it is, its sentence, and what it does to the listed roles.
function ClashRow({ limit: l, who, effects, edit }: { limit: Limit; who: string; effects: Effects | undefined; edit?: ReactNode }) {
  const d = l.data;
  const firm = d.firm !== false;
  const saved = effects?.limits.find((x) => x.id === l.id)?.fails;
  const probe = useQuery(api.goals.effects, saved === undefined ? { draft: { kind: d.kind, firm, rule: d.rule ?? null, appliesTo: d.appliesTo ?? [], when: conditionsOf(d) } } : "skip");
  const fails = saved ?? probe?.draft?.fails;
  return (
    <li className="flex items-center gap-3 border-t py-2 first:border-t-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-text">
          {limitSummary(d.kind, d.rule, d.value)} <span className="text-muted">· {who}</span>
        </span>
        <span className="text-muted">{d.value}</span>
      </span>
      {fails !== undefined && <span className="shrink-0 text-muted tabular-nums">{effectShort(firm, fails)}</span>}
      <span className="flex w-12 shrink-0 justify-end">{edit}</span>
    </li>
  );
}

// The notice on a Review card, from the limit's id and the one it clashes with: Review reads them here.
export function ClashOnCard({ id, other }: { id: string; other: string }) {
  const items = useQuery(api.goals.items);
  const effects = useQuery(api.goals.effects, {});
  const limits = (items ?? []).filter((i): i is Limit => i.kind === "limit");
  const l = limits.find((x) => x.id === id);
  const o = limits.find((x) => x.id === other);
  return l && o ? <ClashNotice limit={l} other={o} effects={effects} /> : null;
}
