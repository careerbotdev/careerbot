"use client";

import { ConvexError } from "convex/values";
import Link from "next/link";
import type { Lens } from "../../../convex/lens";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { CompanyLine, CompanyPicker } from "@/components/CompanyPicker";
import { Dialog } from "@/components/Dialog";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Switch } from "@/components/Switch";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { FINDING_LABEL } from "../settings/finding";
import { Rows, SettingRow } from "../settings/ui";
import { type CompaniesData, useCompaniesEnv } from "./env";
import { findWords } from "./likes";

// Search settings: what searches for companies look for and how found companies are sorted. Companies you like (each
// added to your companies, found more like, or both; a direction adds its own on its Criteria), the industries you
// want, checking companies against your goals (with Check all again) and learning from your ratings. Every change saves
// at once with Undo. A dialog on wide screens; on a phone the screen shows it full screen with Back to Companies
// (SearchSettingsScreen).

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

// The summary Find companies shows beside Change: how many companies they like, how industry steers and whether
// ratings teach it.
export function searchSummary(data: CompaniesData) {
  const n = data.likes.length;
  const likes = n ? `${n} ${n === 1 ? "company" : "companies"} you like` : "No companies you like yet";
  const industries = { steer: "steer by industry", only: "only your industries", ignore: "any industry" }[data.lens.industries];
  return `${likes} · ${industries} · ${data.learn ? "learning from your ratings" : "not learning from your ratings"}`;
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

  return (
    <Rows>
      <Likes data={data} small={small} />
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
          description="Finds more like your targets for the directions they fit, and companies you said Not for me aren’t found again. What you turned down, and why, weighs against similar companies and roles, never as a limit. About 1 Apollo credit a search for every 5 targets; from the next search and check."
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

// Companies you like: Find by name (or a website), and each one's two choices, both on when it's added: Add to my
// companies (put on the list at every search) and Find more like it (every direction's search looks for companies like
// it). Each change saves the whole list, with Undo.
function Likes({ data, small }: { data: CompaniesData; small: boolean }) {
  const env = useCompaniesEnv();
  const act = env.useAct();
  const lookup = env.useLookup();
  const setup = env.useFindSetup();
  const words = setup && findWords(setup);
  const list = data.likes.map((l) => ({ domain: l.domain, ...(l.name ? { name: l.name } : {}), add: l.add, like: l.like }));
  const save = (likes: typeof list, message: string) =>
    act.setLikes({ likes }).then(() => toast({ message, action: { label: "Undo", key: "U", run: () => void act.setLikes({ likes: list }).catch(failed) } }));
  // The picker shows a failure's own words (a ConvexError's), else the fallback.
  const plainly = (e: unknown, fallback: string): never => {
    throw new Error(problem(e, fallback));
  };
  const adding = data.searchable.filter((d) => d.ownSeeds?.some((s) => !list.some((l) => l.like && l.domain === s.domain)));

  return (
    <SettingRow title="Companies you like" line="Add them to your companies, find more like them, or both.">
      {words && (
        <CompanyPicker
          label="Add a company you like"
          small={small}
          findNote={words.note}
          findDetail={words.detail}
          addDetail={(name) =>
            name
              ? `Adds ${name} to Companies you like, set to add it to your companies and to find more like it.`
              : "Adds this website to Companies you like with no search, set to add it to your companies and to find more like it. Its name comes from its own site."
          }
          find={(name) => lookup.find(name).then((r) => ({ companies: r.companies, source: words.source(r.source, r.costUsd) }), (e: unknown) => plainly(e, "Couldn’t search. Try again."))}
          website={(site) => lookup.website(site).catch((e: unknown) => plainly(e, "Couldn’t read that website. Try again."))}
          onAdd={(c) => {
            const added = { ...c, add: true, like: true };
            const next = list.some((l) => l.domain === c.domain) ? list.map((l) => (l.domain === c.domain ? { ...l, ...added } : l)) : [...list, added];
            return save(next, `Added ${c.name ?? c.domain}`).catch((e: unknown) => plainly(e, "Couldn’t add that."));
          }}
        />
      )}
      {list.length > 0 ? (
        <ul aria-label="Companies you like" className="flex flex-col">
          {data.likes.map((l) => {
            const called = l.name ?? l.domain;
            const set = (next: { add?: boolean; like?: boolean }, message: string) => void save(list.map((x) => (x.domain === l.domain ? { ...x, ...next } : x)), message).catch(failed);
            return (
              <CompanyLine
                key={l.domain}
                name={l.name}
                domain={l.domain}
                note={l.like && l.lookup?.apolloId === null ? "not in Apollo" : undefined}
                small={small}
                removeDetail={`Takes ${called} off Companies you like. Companies already found stay where they are.`}
                onRemove={() => void save(list.filter((x) => x.domain !== l.domain), `Removed ${called}`).catch(failed)}
              >
                <Tooltip content="Add to my companies" detail={`Puts ${called} on your list at the next search, whatever your directions look for. Off takes it off; companies already found stay.`} note={words?.addNote}>
                  <span className="flex items-center max-md:h-10">
                    <Checkbox label="Add to my companies" checked={l.add} onChange={(add) => set({ add }, add ? `Adding ${called} to your companies` : `Not adding ${called} to your companies`)} />
                  </span>
                </Tooltip>
                <Tooltip content="Find more like it" detail={`Every direction’s next ${words?.likeVerb ?? "search"} also looks for companies like ${called}. A direction can add its own on its Criteria.`} note={words?.likeNote}>
                  <span className="flex items-center max-md:h-10">
                    <Checkbox label="Find more like it" checked={l.like} onChange={(like) => set({ like }, like ? `Finding more like ${called}` : `Not finding more like ${called}`)} />
                  </span>
                </Tooltip>
              </CompanyLine>
            );
          })}
        </ul>
      ) : (
        <Text size="sm" muted>
          None yet. Type one you like and press Find.
        </Text>
      )}
      {adding.length > 0 && (
        <Text size="sm" muted>
          {adding.map((d) => `${d.name} also finds more like ${andList(d.ownSeeds!.filter((s) => !list.some((l) => l.like && l.domain === s.domain)).map((s) => s.name ?? s.domain))}`).join(". ")}.
        </Text>
      )}
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
