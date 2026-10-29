"use client";

import { useAction, useConvex, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { COMPANY_SORTS, type CompanySort } from "../../../convex/companySets";
import type { Resolved, SiteName, Suggestion } from "../../../convex/companyLookup";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Note } from "@/components/NoteBlock";
import { useDemo } from "../demo/demo";
import type { FindSetup } from "./findPlan";

export type CompaniesData = FunctionReturnType<typeof api.discovery.list>;
export type Company = CompaniesData["companies"][number];
export type CompanyId = Id<"companies">;
export type Coverage = FunctionReturnType<typeof api.roles.overview>["coverage"][number];
// One company's coverage, Target or Maybe or not (watched: its board is read every day).
export type CompanyCoverage = FunctionReturnType<typeof api.roles.companyCoverage>;
export type Person = FunctionReturnType<typeof api.people.atCompany>[number];
export type Balance = FunctionReturnType<typeof api.apolloKey.balance>;
// One of a company's open roles as its page lists it (roles.atCompany), and a page at a time of them with whether more
// can be read.
export type CompanyRole = FunctionReturnType<typeof api.roles.atCompany>["page"][number];
export type CompanyRoles = { rows: CompanyRole[]; status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"; loadMore: () => void };

export const TABS = ["targets", "maybe", "found", "aside", "archived"] as const;
export type Tab = (typeof TABS)[number];
// settings: Search settings is open (?settings=search). sort: the lists' order (?sort=; Best fit when left out).
export type SetParams = (next: { tab?: Tab | null; company?: string | null; settings?: "search" | null; sort?: CompanySort | null }, replace?: boolean) => void;
export type CompaniesParams = { tab: Tab | null; company: string | null; settings: boolean; sort: CompanySort; set: SetParams };

// Everything the screen changes, by name. The app runs the Convex mutations; the stories run fixtures.
export const MUTATIONS = {
  rate: api.enrich.rate,
  archive: api.enrich.archive,
  keepAnyway: api.enrich.keepAnyway,
  setEmployer: api.screening.setEmployer,
  recheck: api.enrich.recheck,
  setWebsite: api.enrich.setWebsite,
  setBoard: api.enrich.setBoard,
  fillIn: api.enrich.start,
  rejudge: api.enrich.rejudge,
  checkRoles: api.roles.checkCompany,
  find: api.discovery.start,
  setLikes: api.discovery.setLikes,
  setLens: api.discovery.setLens,
  setLearn: api.discovery.setLearn,
  setFitRefresh: api.discovery.setFitRefresh,
  addNote: api.notes.add,
  editNote: api.notes.edit,
  removeNote: api.notes.remove,
  startOutreach: api.pursuits.startAtCompany,
  fillInDirections: api.directions.detail,
} as const;
type Mutations = typeof MUTATIONS;
export type Act = { [K in keyof Mutations]: (args: FunctionArgs<Mutations[K]>) => Promise<FunctionReturnType<Mutations[K]>> };

// Where Companies reads and acts: Convex and the URL (?tab=, ?company=, ?sort=) in the app; fixtures in the screen's stories.
// Each is a hook, called the same way on every render.
export type CompaniesEnv = {
  useData: () => CompaniesData | undefined;
  useCoverage: (id: CompanyId, watched: boolean) => Coverage | null | undefined;
  useCompanyCoverage: (id: CompanyId) => CompanyCoverage | undefined;
  // Its open roles, ROLES_PAGE at a time; with `search`, those whose title matches.
  useCompanyRoles: (id: CompanyId, search: string) => CompanyRoles;
  useNotes: (id: CompanyId) => Note[] | undefined;
  usePeople: (id: CompanyId) => Person[] | undefined;
  useParams: () => CompaniesParams;
  useAct: () => Act;
  // Reads the Apollo credits left this cycle (free); null when the key can't read it.
  useBalance: () => () => Promise<Balance>;
  // Whether this is the demo, which reads no websites or boards (demo/demo.ts).
  useDemo: () => boolean;
  // How companies are found and what the web search costs (findPlan.ts); undefined while it loads.
  useFindSetup: () => FindSetup | undefined;
  // Free: companies for a typed name, a pasted list's companies, and a typed website's name (companyLookup.ts).
  useLookup: () => Lookup;
};

export const ROLES_PAGE = 100;

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
  const sort = params.get("sort");
  return {
    tab: (TABS as readonly string[]).includes(tab ?? "") ? (tab as Tab) : null,
    company: params.get("company"),
    settings: params.get("settings") === "search",
    sort: (COMPANY_SORTS as readonly string[]).includes(sort ?? "") ? (sort as CompanySort) : "best",
    set,
  };
}

function useConvexFindSetup(): FindSetup | undefined {
  const finding = useQuery(api.findCompanies.settings);
  const costs = useQuery(api.estimates.costs, {});
  const budgets = useQuery(api.budgets.status);
  return useMemo(
    () =>
      finding && costs && budgets
        ? {
            finding: finding.finding,
            braveKey: finding.braveKey,
            relevantUsd: costs.findRelevant,
            hiringNowUsd: costs.findHiringNow,
            aiLeft: budgets.aiMonthlyUsd > 0 ? { left: budgets.aiMonthlyUsd - budgets.aiSpentUsd, monthly: budgets.aiMonthlyUsd } : null,
          }
        : undefined,
    [finding, costs, budgets],
  );
}

// The demo has no Apollo key and reads nothing on its own: no balance there.
function useConvexBalance() {
  const read = useAction(api.apolloKey.balance);
  const demo = useDemo();
  return useCallback(() => (demo ? Promise.resolve(null) : read({})), [demo, read]);
}

export type Lookup = { suggest: (q: string) => Promise<Suggestion[]>; resolve: (lines: string[]) => Promise<Resolved[]>; website: (site: string) => Promise<SiteName> };
function useConvexLookup(): Lookup {
  const suggest = useAction(api.companyLookup.suggest);
  const resolve = useAction(api.companyLookup.resolve);
  const website = useAction(api.companyLookup.website);
  return useMemo(() => ({ suggest: (q) => suggest({ q }), resolve: (lines) => resolve({ lines }), website: (site) => website({ website: site }) }), [suggest, resolve, website]);
}

const convexEnv: CompaniesEnv = {
  useData: () => useQuery(api.discovery.list),
  useCoverage: (id, watched) => {
    const overview = useQuery(api.roles.overview, watched ? {} : "skip");
    if (!watched) return null;
    return overview && (overview.coverage.find((c) => c.id === id) ?? null);
  },
  useCompanyCoverage: (id) => useQuery(api.roles.companyCoverage, { companyId: id }),
  useCompanyRoles: (id, search) => {
    const { results, status, loadMore } = usePaginatedQuery(api.roles.atCompany, { companyId: id, ...(search ? { search } : {}) }, { initialNumItems: ROLES_PAGE });
    return useMemo(() => ({ rows: results, status, loadMore: () => loadMore(ROLES_PAGE) }), [results, status, loadMore]);
  },
  useNotes: (id) => useQuery(api.notes.list, { subject: { kind: "company", id } }),
  usePeople: (id) => useQuery(api.people.atCompany, { companyId: id }),
  useParams: useUrlParams,
  useAct: useConvexAct,
  useBalance: useConvexBalance,
  useDemo,
  useFindSetup: useConvexFindSetup,
  useLookup: useConvexLookup,
};

export const CompaniesEnvContext = createContext<CompaniesEnv>(convexEnv);
export const useCompaniesEnv = () => useContext(CompaniesEnvContext);
