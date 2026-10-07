"use client";

import { useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { PursuitItem } from "./PursuitItem";
import { RoleItem } from "./RoleItem";
import type { ItemNav } from "./third";

// A role open as an item: the role until it's started, then its pursuit. `direction`: the direction it's shown for.
// `pursuitId` instead: a pursuit with no open role, which has no role to show.
export function Item({ postingId, pursuitId, direction, nav, small }: { postingId?: Id<"postings">; pursuitId?: Id<"pursuits">; direction: string | null; nav: ItemNav | null; small: boolean }) {
  const role = useQuery(api.roles.get, postingId ? { id: postingId } : "skip");
  const started = useQuery(api.pursuits.forPosting, postingId ? { postingId } : "skip");
  const id = pursuitId ?? started?.id;
  const p = useQuery(api.pursuits.get, id ? { id } : "skip");
  if (pursuitId) return p ? <PursuitItem key={p.id} p={p} role={null} nav={nav} small={small} /> : null;
  if (!role || started === undefined || (started && !p)) return null;
  return p ? <PursuitItem key={p.id} p={p} role={role} nav={nav} small={small} /> : <RoleItem key={role.id} role={role} direction={direction} nav={nav} small={small} />;
}
