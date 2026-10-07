"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { UpdateStatus } from "../../../convex/updates";
import { ExternalLink } from "@/components/ExternalLink";
import type { ScreenSize } from "@/components/Panes";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Switch } from "@/components/Switch";
import { Markdown } from "../changelog/Markdown";
import { type Release, releaseDate } from "../changelog/releases";
import { GroupHead, Rows, saved, SettingsPane } from "./ui";

// Updates, on a self-hosted copy for its owner only (the Releases boards in Paper): whether a newer version is out,
// with Read before updating when any release between this copy and the newest has steps for a self-hoster, each newer
// release's notes, how to update for the way the copy runs, and the switch for the daily check (convex/updates.ts).

const DOCS = "https://careerbot.dev/docs/self-hosting/updates#updating";

const SETUPS = [
  { value: "compose", label: "Docker Compose" },
  { value: "coolify", label: "Coolify" },
  { value: "dokploy", label: "Dokploy" },
  { value: "cloudflare", label: "Cloudflare" },
] as const;
type Setup = (typeof SETUPS)[number]["value"];

// The steps for each way of running a copy, to `version` (Markdown).
function steps(setup: Setup, version: string) {
  const pin = (where: string) => `If ${where} sets \`CAREERBOT_VERSION\`, change it to \`${version}\`.`;
  switch (setup) {
    case "compose":
      return ["Back up your data.", "In the folder you installed from, run `git pull`.", pin("`.env`"), "Run `docker compose pull && docker compose up -d`."];
    case "coolify":
      return ["Back up your data.", pin("the resource’s Environment Variables"), "Deploy again: Actions, then Redeploy."];
    case "dokploy":
      return ["Back up your data.", pin("the compose service’s Environment"), "Deploy again: General, then Deploy."];
    case "cloudflare":
      return ["Back up your data.", "In the folder you deploy from, run `git pull` and `pnpm install`.", "Run `npx convex deploy -y`.", "Build and deploy the Worker again: `pnpm cf:build`, then `pnpm cf:deploy`."];
  }
}

const listWords = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// When the list was last read: "today at 9:02", "yesterday at 9:02", "Oct 14".
function checked(at: number) {
  const time = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(at))) / 86_400_000);
  return days === 0 ? `today at ${time}` : days === 1 ? `yesterday at ${time}` : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The line under Updates in the list of sections. Until a check has read the list, nothing says it's up to date.
export function updatesLine(status: UpdateStatus) {
  if (status.off) return "Not checking";
  if (status.newer.length) return `CareerBot ${status.newer[0].version} is out`;
  return status.checkedAt ? "Up to date" : "Not checked yet";
}

function Notes({ release: r }: { release: Release }) {
  const group = (title: string, items: string[]) =>
    items.length > 0 && (
      <div className="flex flex-col gap-1.5">
        <h4 className="text-label leading-label font-medium text-muted">{title}</h4>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-body-sm leading-body-sm marker:text-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="flex flex-col gap-4 border-t pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body-md leading-body-md font-medium text-text">{r.version}</h3>
        <p className="text-body-sm leading-body-sm text-muted">
          <time dateTime={r.date}>{releaseDate(r.date)}</time>
        </p>
      </div>
      <p className="text-body-md leading-body-md text-text">{r.summary}</p>
      {group("New", r.new)}
      {group("Better", r.better)}
      {group("Fixed", r.fixed)}
      {r.selfHost.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-sm border px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-body-sm leading-body-sm font-medium text-text">If you host your own copy</h4>
            {r.needsAction && <span className="flex h-5 items-center rounded-sm bg-caution-subtle px-1.5 text-label leading-label font-medium text-caution-text">Read before updating</span>}
          </div>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-body-sm leading-body-sm marker:text-muted">
            {r.selfHost.map((step) => (
              <li key={step}>
                <Markdown text={step} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// The pane itself, from the copy's update status; `onCheck` turns the daily check on or off.
export function UpdatesView({ status, size, onCheck }: { status: UpdateStatus; size: ScreenSize; onCheck: (on: boolean) => void }) {
  const [setup, setSetup] = useState<Setup>("compose");
  const latest = status.newer[0];
  const toRead = status.newer.filter((r) => r.needsAction).map((r) => r.version);
  const when = status.checkedAt ? `Checked ${checked(status.checkedAt)}.` : status.off ? "" : "Not checked yet.";
  const current = status.off ? "Checking for new versions is off." : status.checkedAt ? `This is the newest version. ${when}` : when;
  return (
    <SettingsPane title="Updates" size={size}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-title-md leading-title-md font-semibold text-text">{latest ? `CareerBot ${latest.version} is out` : `CareerBot ${status.current}`}</h3>
          <p className="text-body-sm leading-body-sm text-muted">
            {latest ? `You have ${status.current}. ${when}` : current}
          </p>
        </div>
        {toRead.length > 0 && (
          <div className="flex flex-col gap-0.5 rounded-sm bg-caution-subtle px-3.5 py-3">
            <p className="text-body-sm leading-body-sm font-medium text-caution-text">Read before updating</p>
            <p className="text-body-sm leading-body-sm text-text">
              {listWords(toRead)} {toRead.length === 1 ? "has" : "have"} steps for a copy you run yourself, under If you host your own copy.
            </p>
          </div>
        )}
      </div>
      {latest && (
        <>
          <div className="flex flex-col gap-6">
            {status.newer.map((r) => (
              <Notes key={r.version} release={r} />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <GroupHead label="How to update" />
              <ExternalLink href={DOCS} label="How to update, in the docs">
                Docs
              </ExternalLink>
            </div>
            <SegmentedControl label="How this copy runs" hideLabel value={setup} onChange={setSetup} options={SETUPS} />
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-body-sm leading-body-sm marker:text-muted">
              {steps(setup, latest.version).map((step) => (
                <li key={step}>
                  <Markdown text={step} />
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      <Rows>
        <div className="border-t py-4">
          <Switch
            label="Check for updates"
            description={
              status.offByEnv
                ? "Off: UPDATE_CHECK=off is set where this copy runs."
                : "Once a day, asks careerbot.dev for the newest version. Nothing about you or this copy is sent, but like any web request it shows careerbot.dev this server’s IP address."
            }
            checked={!status.off}
            disabled={status.offByEnv}
            onChange={onCheck}
          />
        </div>
      </Rows>
    </SettingsPane>
  );
}

export function Updates({ size }: { size: ScreenSize }) {
  const status = useQuery(api.updates.status);
  const set = useMutation(api.updates.setCheck);
  if (!status) return null;
  return <UpdatesView status={status} size={size} onCheck={(on) => void set({ on }).then(() => saved(`Check for updates: ${on ? "on" : "off"}`, () => void set({ on: !on })))} />;
}
