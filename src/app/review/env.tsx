"use client";

import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { REVIEW_KINDS, type ReviewKind } from "../../../convex/reviewKinds";
import { type Decide, type Items, MUTATIONS } from "./decisions";

export type Summary = FunctionReturnType<typeof api.review.summary>;
export type SetParams = (next: { kind?: ReviewKind | null; item?: string | null }, replace?: boolean) => void;
export type ReviewParams = { kind: ReviewKind | null; item: string | null; set: SetParams };

// Where Review reads and decides: the Convex queries and mutations and the URL (?kind=, ?item=) in the app; fixtures
// in the screen's stories. Each is a hook, called the same way on every render.
export type ReviewEnv = {
  useSummary: () => Summary | undefined;
  useItems: (kind: ReviewKind) => Items | undefined;
  useParams: () => ReviewParams;
  useDecide: () => Decide;
};

function useConvexDecide(): Decide {
  const client = useConvex();
  return useMemo(() => Object.fromEntries(Object.entries(MUTATIONS).map(([name, ref]) => [name, (args: never) => client.mutation(ref, args)])) as Decide, [client]);
}

function useUrlParams(): ReviewParams {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const set = useCallback<SetParams>(
    (next, replace = false) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) q.set(k, v);
        else if (v === null) q.delete(k);
      }
      const url = q.toString() ? `${path}?${q}` : path;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, router, path],
  );
  const kind = params.get("kind");
  return { kind: (REVIEW_KINDS as readonly string[]).includes(kind ?? "") ? (kind as ReviewKind) : null, item: params.get("item"), set };
}

const convexEnv: ReviewEnv = {
  useSummary: () => useQuery(api.review.summary),
  useItems: (kind) => useQuery(api.review.items, { kind }),
  useParams: useUrlParams,
  useDecide: useConvexDecide,
};

export const ReviewEnvContext = createContext<ReviewEnv>(convexEnv);
export const useReviewEnv = () => useContext(ReviewEnvContext);
