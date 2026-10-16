"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import type { ScreenSize } from "@/components/Panes";
import { Switch } from "@/components/Switch";
import { Text } from "@/components/Text";
import { useDemo } from "../demo/demo";
import { Drive } from "./Drive";
import { FindingCompanies } from "./FindingCompanies";
import { CompanyKeys, OpenRouterKey } from "./Keys";
import { GroupHead, Rows, saved, SettingRow, SettingsPane } from "./ui";

// Settings, Connections: the accounts and keys CareerBot works through, in three groups. AI: the OpenRouter key.
// Companies: how companies are found (Finding companies), the Apollo and Brave Search keys and Job postings
// from Apollo. Resumes and projects: Google Drive and GitHub. The demo carries no keys and calls out to nothing, which
// is all its key rows say.
export function Connections({ size }: { size: ScreenSize }) {
  const demo = useDemo();
  const noKeys = <Text size="sm" className="border-t py-4">The demo has no keys: nothing in it calls OpenRouter, Apollo or Brave Search.</Text>;
  return (
    <SettingsPane title="Connections" size={size}>
      <section aria-label="AI">
        <GroupHead label="AI" />
        <Rows>{demo ? noKeys : <OpenRouterKey size={size} />}</Rows>
      </section>
      <section aria-label="Companies">
        <GroupHead label="Companies" />
        <Rows>
          <FindingCompanies />
          {demo ? noKeys : <CompanyKeys size={size} />}
          <ApolloJobs />
        </Rows>
      </section>
      <section aria-label="Resumes and projects">
        <GroupHead label="Resumes and projects" />
        <Rows>
          <Drive size={size} />
          <GitHub size={size} />
        </Rows>
      </section>
    </SettingsPane>
  );
}

function ApolloJobs() {
  const data = useQuery(api.discovery.companySettings);
  const setApolloJobs = useMutation(api.enrich.setApolloJobs);
  if (!data) return null;
  return (
    <div className="border-t py-4">
      <Switch
        label="Job postings from Apollo"
        description="When a company has no public job board, ask Apollo for its postings. About 1 Apollo credit per company, while automated Apollo work is on."
        checked={data.apolloJobs}
        onChange={(on) => void setApolloJobs({ on }).then(() => saved(on ? "Job postings from Apollo on" : "Job postings from Apollo off", () => void setApolloJobs({ on: !on })))}
      />
    </div>
  );
}

// GitHub is connected in Record, Projects, where its repositories are chosen; this row says how it stands and goes there.
function GitHub({ size }: { size: ScreenSize }) {
  const github = useQuery(api.github.status);
  const connected = github?.connected;
  const go = (className: string) => (
    <Link href="/record/projects?github=1" className={buttonLook("secondary", className, size === "small" ? "lg" : "sm")}>
      <Icons.openElsewhere aria-hidden="true" />
      Open Projects
    </Link>
  );
  return (
    <SettingRow title="GitHub" line="Connected in Projects, where you choose which repositories CareerBot reads." control={go("hidden @lg:inline-flex")}>
      {github !== undefined && <Text size="sm">{connected ? `Connected as ${connected.account} · ${connected.selection === "all" ? "all repositories" : "repositories you chose"}` : "Not connected."}</Text>}
      {go("self-start @lg:hidden")}
    </SettingRow>
  );
}
