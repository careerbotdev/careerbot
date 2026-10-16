"use client";

import { ConvexError } from "convex/values";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import type { Lens } from "../../../convex/lens";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { ErrorLine, Input } from "@/components/Field";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Switch } from "@/components/Switch";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { FINDING_LABEL } from "../settings/finding";
import { Rows, SettingRow } from "../settings/ui";
import { type CompaniesData, useCompaniesEnv } from "./env";

// Search settings: what searches for companies look for and how found companies are sorted. Seed companies (for every
// direction; a direction adds its own on its Criteria), companies you'd name, the industries you want, checking companies
// against your goals (with Check all again) and learning from your ratings. Every change saves at once with Undo. A
// dialog on wide screens; on a phone the screen shows it full screen with Back to Companies (SearchSettingsScreen).

const INDUSTRIES = [
  { value: "steer", label: "Steer", line: "Searches start with the industries in your goals and add related ones." },
  { value: "only", label: "Only these", line: "Searches stay inside the industries in your goals." },
  { value: "ignore", label: "Ignore", line: "Industry doesn’t shape searches." },
] as const;

const JUDGE = [
  { value: "off", label: "Off", line: "Companies aren’t checked against your goals." },
  { value: "rank", label: "Rank", line: "Checks companies against your goals; ones that fit rank higher in Found." },
  { value: "hide", label: "Hide", line: "Ones that don’t fit move to Doesn’t fit your goals, where you can keep them." },
] as const;

// About a cent for every 40 companies checked again.
const PER_COMPANY_USD = 0.01 / 40;

const problem = (e: unknown, fallback: string) => (e instanceof ConvexError ? String(e.data) : fallback);
const failed = (e: unknown) => toast({ message: problem(e, "Couldn’t save that."), icon: "failed" });
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The summary Find companies shows beside Change: how many seeds, how industry steers and whether ratings teach it.
export function searchSummary(data: CompaniesData) {
  const seeds = data.seeds.length ? `${data.seeds.length} seed ${data.seeds.length === 1 ? "company" : "companies"}` : "No seed companies";
  const industries = { steer: "steer by industry", only: "only your industries", ignore: "any industry" }[data.lens.industries];
  return `${seeds} · ${industries} · ${data.learn ? "learning from your ratings" : "not learning from your ratings"}`;
}

export function SearchSettingsBody({ data, small }: { data: CompaniesData; small: boolean }) {
  const act = useCompaniesEnv().useAct();
  const lens = data.lens;
  const setLens = (next: Partial<Lens>, message: string) =>
    void act
      .setLens({ ...lens, ...next })
      .then(() => {
        if (next.judge && next.judge !== "off") void act.rejudge({});
        toast({ message, action: { label: "Undo", key: "U", run: () => void act.setLens(lens).catch(failed) } });
      })
      .catch(failed);
  const estimate = data.filledIn * PER_COMPANY_USD;
  const cost = estimate < 0.01 ? "Under $0.01" : `About $${estimate.toFixed(2)}`;
  const adding = data.searchable.filter((d) => d.ownSeeds?.some((s) => !data.seeds.some((x) => x.domain === s)));

  return (
    <Rows>
      <SiteList
        title="Seed companies"
        line="Every direction’s search also finds companies like these. A direction can add its own on its Criteria."
        items={data.seeds.map((s) => ({ domain: s.domain, name: s.lookup?.name, note: s.lookup?.apolloId === null ? "not in Apollo" : undefined }))}
        addDetail="Every direction’s next search for companies also looks for ones like it. A direction can add more on its Criteria."
        addNote="Free to add · each search: about 1 Apollo credit for every 5 seeds · Undo with U"
        removeDetail="Takes it off the list for every direction. A direction that added it on its Criteria keeps it."
        save={(seeds) => act.setSeeds({ seeds })}
        small={small}
      >
        {adding.length > 0 && (
          <Text size="sm" muted>
            {adding.map((d) => `${d.name} adds ${andList(d.ownSeeds!.filter((s) => !data.seeds.some((x) => x.domain === s)))}`).join(". ")}.
          </Text>
        )}
      </SiteList>
      <SiteList
        title="Companies you’d name"
        line="Companies you already want on the list, added to every search."
        items={data.named.map((domain) => ({ domain }))}
        addDetail="Puts it on the list at the next search, whatever your directions look for."
        addNote="Free to add · each search: about 1 Apollo credit for every 100 · Undo with U"
        removeDetail="Takes it off the list. Companies already found stay where they are."
        save={(named) => act.setNamed({ named })}
        small={small}
      />
      <SettingRow
        title="Industries you want"
        line={INDUSTRIES.find((o) => o.value === lens.industries)?.line}
        control={<SegmentedControl label="Industries you want" hideLabel value={lens.industries} onChange={(industries) => setLens({ industries }, `Industries: ${INDUSTRIES.find((o) => o.value === industries)?.label}`)} options={INDUSTRIES} />}
      />
      <SettingRow
        title="Check companies against your goals"
        line={JUDGE.find((o) => o.value === lens.judge)?.line}
        control={<SegmentedControl label="Check companies against your goals" hideLabel value={lens.judge} onChange={(judge) => setLens({ judge }, `Checking against your goals: ${JUDGE.find((o) => o.value === judge)?.label}`)} options={JUDGE} />}
      >
        {lens.judge !== "off" && data.filledIn > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size={small ? "lg" : "sm"}
              icon="tryAgain"
              detail="Checks every company again against your goals and directions, after you change them."
              note={`${cost} from your AI budget`}
              onClick={() => void act.rejudge({}).then(() => toast({ message: `Checking ${data.filledIn.toLocaleString("en-US")} companies again` }), failed)}
            >
              Check all again
            </Button>
            <Text size="sm" muted>
              {cost} for {data.filledIn.toLocaleString("en-US")} {data.filledIn === 1 ? "company" : "companies"}
            </Text>
          </div>
        )}
      </SettingRow>
      <div className="border-t py-4">
        <Switch
          label="Learn from your ratings"
          description="Targets seed searches for the directions they fit, and companies you said Not for me aren’t found again. What you turned down, and why, weighs against similar companies and roles, never as a limit. About 1 Apollo credit a search for every 5 targets; from the next search and check."
          checked={data.learn}
          onChange={(on) =>
            void act
              .setLearn({ on })
              .then(() => toast({ message: on ? "Learning from your ratings" : "Not learning from your ratings", action: { label: "Undo", key: "U", run: () => void act.setLearn({ on: !on }).catch(failed) } }))
              .catch(failed)
          }
        />
      </div>
    </Rows>
  );
}

// A list of company websites as chips, each with Remove, and a field to add more. Saves the whole list at once.
function SiteList({
  title,
  line,
  items,
  addDetail,
  addNote,
  removeDetail,
  save,
  small,
  children,
}: {
  title: string;
  line: string;
  items: { domain: string; name?: string; note?: string }[];
  addDetail: string;
  addNote: string;
  removeDetail: string;
  save: (list: string[]) => Promise<unknown>;
  small: boolean;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = items.map((i) => i.domain);
  const change = (next: string[], message: string) =>
    save(next).then(() => {
      setError(null);
      toast({ message, action: { label: "Undo", key: "U", run: () => void save(list).catch(failed) } });
    });
  const add = (e: FormEvent) => {
    e.preventDefault();
    const more = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!more.length) return;
    void change([...list, ...more], `Added ${andList(more)}`).then(
      () => setText(""),
      (err: unknown) => setError(problem(err, "Couldn’t add that.")),
    );
  };
  return (
    <SettingRow title={title} line={line}>
      {items.length > 0 && (
        <ul aria-label={title} className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <li key={i.domain} className="flex h-7 max-w-full items-center gap-1 rounded-sm border bg-subtle pr-1 pl-2 text-label leading-label font-medium text-text">
              <span className="truncate">{i.name ?? i.domain}</span>
              {i.note && <span className="shrink-0 font-normal text-muted">· {i.note}</span>}
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon="close"
                aria-label={`Remove ${i.name ?? i.domain}`}
                detail={removeDetail}
                note="Free · Undo with U"
                onClick={() => void change(list.filter((d) => d !== i.domain), `Removed ${i.name ?? i.domain}`).catch(failed)}
              />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-center gap-2">
        <Input aria-label={`Add to ${title}`} className="min-w-0 flex-1" value={text} placeholder="Add a website, like acme.com" onChange={(e) => (setText(e.target.value), setError(null))} />
        <Button type="submit" size={small ? "lg" : "sm"} detail={addDetail} note={addNote} reason={text.trim() ? undefined : "Type a website first."}>
          Add
        </Button>
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      {children}
    </SettingRow>
  );
}

// The way searches find companies, and where it's chosen (Settings, Connections).
function Footer() {
  const setup = useCompaniesEnv().useFindSetup();
  return (
    <Text size="sm" muted className="min-w-0 flex-1">
      {setup ? `Searches use ${FINDING_LABEL[setup.finding]}.` : "How searches find companies is chosen in Settings."}{" "}
      <Link href="/settings?section=connections" className="tap font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text">
        Change in Settings
      </Link>
    </Text>
  );
}

export function SearchSettingsDialog({ data, open, onOpenChange }: { data: CompaniesData; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search settings"
      wide
      footer={
        <div className="flex w-full items-center gap-3">
          <Footer />
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      }
    >
      <SearchSettingsBody data={data} small={false} />
    </Dialog>
  );
}

// On a phone: full screen, under the screen's Back to Companies.
export function SearchSettingsScreen({ data }: { data: CompaniesData }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8">
      <div className="pt-1 pb-3">
        <Heading>Search settings</Heading>
      </div>
      <SearchSettingsBody data={data} small />
      <div className="flex items-center pt-4">
        <Footer />
      </div>
    </div>
  );
}
