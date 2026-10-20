"use client";

import { useAction, useConvex, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { COMPANY_SORTS, type CompanySort } from "../../../convex/companySets";
import type { FindResult, SiteName } from "../../../convex/companyLookup";
import type { Id } from "../../../convex/_generated/dataModel";
import { valuesOf, whereText } from "../../../convex/roleDetails";
import type { Note } from "@/components/NoteBlock";
import { useDemo } from "../demo/demo";
import type { FindSetup } from "./findPlan";

export type CompaniesData = FunctionReturnType<typeof api.discovery.list>;
export type Company = CompaniesData["companies"][number];
export type CompanyId = Id<"companies">;
export type Coverage = FunctionReturnType<typeof api.roles.overview>["coverage"][number];
export type Person = FunctionReturnType<typeof api.people.atCompany>[number];
export type Balance = FunctionReturnType<typeof api.apolloKey.balance>;
// A company's best open roles, as its item lists them, and how many it has.
export type OpenRoles = { top: { id: Id<"postings">; title: string; score: number | null; level: "strong" | "some" | "weak" | "none" | null; place: string | null }[]; count: number; more: boolean };

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
  useOpenRoles: (id: CompanyId, watched: boolean) => OpenRoles | undefined;
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
  // Finding a company by name, and a typed website's name (companyLookup.ts).
  useLookup: () => Lookup;
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
            byNameUsd: costs.findByName,
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

export type Lookup = { find: (name: string) => Promise<FindResult>; website: (site: string) => Promise<SiteName> };
function useConvexLookup(): Lookup {
  const find = useAction(api.companyLookup.find);
  const website = useAction(api.companyLookup.website);
  return useMemo(() => ({ find: (name) => find({ name }), website: (site) => website({ website: site }) }), [find, website]);
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
  useFindSetup: useConvexFindSetup,
  useLookup: useConvexLookup,
};

export const CompaniesEnvContext = createContext<CompaniesEnv>(convexEnv);
export const useCompaniesEnv = () => useContext(CompaniesEnvContext);
