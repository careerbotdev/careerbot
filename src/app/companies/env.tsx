"use client";

import { useAction, useConvex, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { valuesOf, whereText } from "../../../convex/roleDetails";
import type { Note } from "@/components/NoteBlock";
import { useDemo } from "../demo/demo";

export type CompaniesData = FunctionReturnType<typeof api.discovery.list>;
export type Company = CompaniesData["companies"][number];
export type CompanyId = Id<"companies">;
export type Coverage = FunctionReturnType<typeof api.roles.overview>["coverage"][number];
export type Person = FunctionReturnType<typeof api.people.atCompany>[number];
export type Balance = FunctionReturnType<typeof api.apolloKey.balance>;
// A company's best open roles, as its item lists them, and how many it has.
export type OpenRoles = { top: { id: Id<"postings">; title: string; score: number | null; level: "strong" | "some" | "weak" | "none" | null; place: string | null }[]; count: number; more: boolean };

export const TABS = ["targets", "maybe", "found", "aside"] as const;
export type Tab = (typeof TABS)[number];
export type SetParams = (next: { tab?: Tab | null; company?: string | null }, replace?: boolean) => void;
export type CompaniesParams = { tab: Tab | null; company: string | null; set: SetParams };

// Everything the screen changes, by name. The app runs the Convex mutations; the stories run fixtures.
export const MUTATIONS = {
  rate: api.enrich.rate,
  keepAnyway: api.enrich.keepAnyway,
  setEmployer: api.screening.setEmployer,
  recheck: api.enrich.recheck,
  setWebsite: api.enrich.setWebsite,
  setBoard: api.enrich.setBoard,
  fillIn: api.enrich.start,
  rejudge: api.enrich.rejudge,
  checkRoles: api.roles.checkCompany,
  find: api.discovery.start,
  setNamed: api.discovery.setNamed,
  setSeeds: api.discovery.setSeeds,
  setLens: api.discovery.setLens,
  addNote: api.notes.add,
  editNote: api.notes.edit,
  removeNote: api.notes.remove,
  startOutreach: api.pursuits.startAtCompany,
} as const;
type Mutations = typeof MUTATIONS;
export type Act = { [K in keyof Mutations]: (args: FunctionArgs<Mutations[K]>) => Promise<FunctionReturnType<Mutations[K]>> };

// Where Companies reads and acts: Convex and the URL (?tab=, ?company=) in the app; fixtures in the screen's stories.
// Each is a hook, called the same way on every render.
export type CompaniesEnv = {
  useData: () => CompaniesData | undefined;
  useCoverage: (id: CompanyId, watched: boolean) => Coverage | null | undefined;
  useOpenRoles: (id: CompanyId, watched: boolean) => OpenRoles | undefined;
  useNotes: (id: CompanyId) => Note[] | undefined;
  usePeople: (id: CompanyId) => Person[] | undefined;
  useParams: () => CompaniesParams;
  useAct: () => Act;
  // Reads the Apollo credits left this cycle (free); null when the key can't read it.
  useBalance: () => () => Promise<Balance>;
  // Whether this is the demo, which reads no websites or boards (demo/demo.ts).
  useDemo: () => boolean;
};

const TOP_ROLES = 3;

function useConvexAct(): Act {
  const client = useConvex();
  return useMemo(() => Object.fromEntries(Object.entries(MUTATIONS).map(([name, ref]) => [name, (args: never) => client.mutation(ref, args)])) as Act, [client]);
}

function useUrlParams(): CompaniesParams {
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
  const tab = params.get("tab");
  return { tab: (TABS as readonly string[]).includes(tab ?? "") ? (tab as Tab) : null, company: params.get("company"), set };
}

// The demo has no Apollo key and reads nothing on its own: no balance there.
function useConvexBalance() {
  const read = useAction(api.apolloKey.balance);
  const demo = useDemo();
  return useCallback(() => (demo ? Promise.resolve(null) : read({})), [demo, read]);
}

const convexEnv: CompaniesEnv = {
  useData: () => useQuery(api.discovery.list),
  useCoverage: (id, watched) => {
    const overview = useQuery(api.roles.overview, watched ? {} : "skip");
    if (!watched) return null;
    return overview && (overview.coverage.find((c) => c.id === id) ?? null);
  },
  useOpenRoles: (id, watched) => {
    const filters = { companies: [id] };
    const page = useQuery(api.roles.list, watched ? { filters, paginationOpts: { numItems: TOP_ROLES, cursor: null } } : "skip");
    const count = useQuery(api.roles.count, watched ? { filters } : "skip");
    return useMemo(
      () =>
        page && count
          ? {
              top: page.page.map((r) => ({ id: r.id, title: r.title, score: r.score, level: r.level, place: whereText(valuesOf(r.details), r.location) })),
              count: count.count,
              more: count.more,
            }
          : undefined,
      [page, count],
    );
  },
  useNotes: (id) => useQuery(api.notes.list, { subject: { kind: "company", id } }),
  usePeople: (id) => useQuery(api.people.atCompany, { companyId: id }),
  useParams: useUrlParams,
  useAct: useConvexAct,
  useBalance: useConvexBalance,
  useDemo,
};

export const CompaniesEnvContext = createContext<CompaniesEnv>(convexEnv);
export const useCompaniesEnv = () => useContext(CompaniesEnvContext);
