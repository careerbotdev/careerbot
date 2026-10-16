"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Finding } from "../../../convex/findCompanies";
import { SegmentedControl } from "@/components/SegmentedControl";
import { FINDING_LABEL, FINDING_LINE, findingOptions, type FindingSetup } from "./finding";
import { saved, SettingRow } from "./ui";

// Finding companies: Apollo, Apollo + AI or AI only (findCompanies.ts), a row of a Settings pane. Each way explains
// itself and what it spends in its tooltip; without an Apollo key only AI only can be chosen. A change takes effect from
// the next search, with Undo.

export function FindingChoice({ setup, perDirectionUsd, onChange }: { setup: FindingSetup; perDirectionUsd: number | null; onChange: (finding: Finding) => Promise<unknown> }) {
  const change = (next: Finding) => {
    const was = setup.finding;
    void onChange(next).then(() => saved(`Finding companies: ${FINDING_LABEL[next]}`, () => void onChange(was)));
  };
  return (
    <SettingRow
      title="Finding companies"
      line={FINDING_LINE[setup.finding]}
      control={<SegmentedControl label="Finding companies" hideLabel value={setup.finding} onChange={change} options={findingOptions(setup, perDirectionUsd)} />}
    />
  );
}

// The choice as the app reads and saves it.
export function FindingCompanies() {
  const setup = useQuery(api.findCompanies.settings);
  const costs = useQuery(api.estimates.costs, {});
  const set = useMutation(api.findCompanies.set);
  if (!setup) return <SettingRow title="Finding companies" />;
  const perDirectionUsd = costs?.findRelevant == null ? null : costs.findRelevant + (costs.findHiringNow ?? 0);
  return <FindingChoice setup={setup} perDirectionUsd={perDirectionUsd} onChange={(finding) => set({ finding })} />;
}
