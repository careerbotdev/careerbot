"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Lens } from "../../../convex/lens";
import { Button } from "@/components/Button";
import type { ScreenSize } from "@/components/Panes";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Switch } from "@/components/Switch";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { Rows, saved, SettingRow, SettingsPane } from "./ui";

// How goals steer the company search: the industries they want, whether companies are checked against their goals,
// whether their ratings teach the search, fit and ranking, and whether Apollo is asked for job postings a company
// doesn't publish.

const INDUSTRIES = [
  { value: "steer", label: "Steer", line: "Searches start with them and add related ones." },
  { value: "only", label: "Only these", line: "Searches stay inside them." },
  { value: "ignore", label: "Ignore", line: "Industry doesn’t shape searches." },
] as const;

const JUDGE = [
  { value: "off", label: "Off", line: "Companies aren’t checked against your goals." },
  { value: "rank", label: "Rank", line: "Ones that fit your goals rank higher." },
  { value: "hide", label: "Hide", line: "Ones that don’t fit move to Doesn’t fit your goals, where you can keep them." },
] as const;

// About a cent for every 40 companies checked again.
const PER_COMPANY_USD = 0.01 / 40;

export function Companies({ size }: { size: ScreenSize }) {
  const data = useQuery(api.discovery.companySettings);
  const setLens = useMutation(api.discovery.setLens);
  const setApolloJobs = useMutation(api.enrich.setApolloJobs);
  const setLearn = useMutation(api.discovery.setLearn);
  const rejudge = useMutation(api.enrich.rejudge);
  if (!data) return <SettingsPane title="Companies" size={size}>{null}</SettingsPane>;

  const lens = data.lens;
  const change = (next: Partial<Lens>, message: string) =>
    void setLens({ ...lens, ...next }).then(() => {
      if (next.judge && next.judge !== "off") void rejudge({});
      saved(message, () => void setLens(lens));
    });
  const estimate = data.filledIn * PER_COMPANY_USD;
  const small = size === "small";

  return (
    <SettingsPane title="Companies" size={size}>
      <Rows>
        <SettingRow
          title="Industries you want"
          line={INDUSTRIES.find((o) => o.value === lens.industries)?.line}
          control={<SegmentedControl label="Industries you want" hideLabel value={lens.industries} onChange={(industries) => change({ industries }, `Industries: ${INDUSTRIES.find((o) => o.value === industries)?.label}`)} options={INDUSTRIES} />}
        />
        <SettingRow
          title="Check companies against your goals"
          line={JUDGE.find((o) => o.value === lens.judge)?.line}
          control={<SegmentedControl label="Check companies against your goals" hideLabel value={lens.judge} onChange={(judge) => change({ judge }, `Checking against your goals: ${JUDGE.find((o) => o.value === judge)?.label}`)} options={JUDGE} />}
        >
          {lens.judge !== "off" && data.filledIn > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size={small ? "lg" : "sm"}
                icon="tryAgain"
                detail="Checks every company again against your goals and directions, after you change them."
                note={`${estimate < 0.01 ? "Under $0.01" : `About $${estimate.toFixed(2)}`} from your AI budget`}
                onClick={() => void rejudge({}).then(() => toast({ message: `Checking ${data.filledIn.toLocaleString("en-US")} companies again` }))}
              >
                Check all again
              </Button>
              <Text size="sm" muted>
                {estimate < 0.01 ? "Under $0.01" : `About $${estimate.toFixed(2)}`} for {data.filledIn.toLocaleString("en-US")} {data.filledIn === 1 ? "company" : "companies"}
              </Text>
            </div>
          )}
        </SettingRow>
        <div className="border-t py-4">
          <Switch
            label="Learn from your ratings"
            description="Targets seed searches for the directions they fit, and companies you said Not for me aren’t found again. What you turned down, and why, weighs against similar companies and roles, never as a limit. About 1 Apollo credit a search for every 5 targets; from the next search and check."
            checked={data.learn}
            onChange={(on) => void setLearn({ on }).then(() => saved(on ? "Learning from your ratings" : "Not learning from your ratings", () => void setLearn({ on: !on })))}
          />
        </div>
        <div className="border-t py-4">
          <Switch
            label="Job postings from Apollo"
            description="When a company has no public job board, ask Apollo for its postings. About 1 Apollo credit per company, while automated Apollo work is on."
            checked={data.apolloJobs}
            onChange={(on) => void setApolloJobs({ on }).then(() => saved(on ? "Job postings from Apollo on" : "Job postings from Apollo off", () => void setApolloJobs({ on: !on })))}
          />
        </div>
      </Rows>
    </SettingsPane>
  );
}
