"use client";

import { Authenticated, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { pursuitHref } from "../../../../convex/pursuitSteps";

// A pursuit opens in the panel of Pursuits, as its role (or, with no open role, as itself); the address names the role,
// so it's looked up first.
export default function PursuitPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Authenticated>
      <ToRole id={id as Id<"pursuits">} />
    </Authenticated>
  );
}

function ToRole({ id }: { id: Id<"pursuits"> }) {
  const p = useQuery(api.pursuits.get, { id });
  const router = useRouter();
  useEffect(() => {
    if (p) router.replace(`${pursuitHref(p)}${p.direction && p.postingId ? `&direction=${p.direction.id}` : ""}`);
  }, [p, router]);
  return null;
}
