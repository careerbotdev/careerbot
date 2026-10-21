"use client";

import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import type { Lens } from "../../../convex/lens";
import { Button } from "@/components/Button";
import { CompanyLine, CompanyPicker, PasteButton } from "@/components/CompanyPicker";
import { listText } from "@/components/companyText";
import { Dialog } from "@/components/Dialog";
import { Menu } from "@/components/Menu";
import { PasteList } from "@/components/PasteList";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Switch } from "@/components/Switch";
import { Heading, Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { FINDING_LABEL } from "../settings/finding";
import { Rows, SettingRow } from "../settings/ui";
import { type CompaniesData, useCompaniesEnv } from "./env";
import { likeWords } from "./likes";

// Search settings: what searches for companies look for and how found companies are sorted. Companies you like (one
// list: each is added to your companies and found more like, unless its ⋯ turns that off; a direction adds its own on
// its Criteria), the industries you want, checking companies against your goals (with Check all again) and learning
// from your ratings. Every change saves at once with Undo. A dialog on wide screens; on a phone the screen shows it full
// screen with Back to Companies (SearchSettingsScreen).

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

// Companies you like: one list. Type a name (free suggestions as you type) or a website, or paste a list; each one is
// added to your companies and every direction's search finds more like it, unless its ⋯ says Don't use to find more
// like it (a muted tag on its row). The list's ⋯ pastes a list or copies the websites. Each change saves the whole list,
// with Undo.
function Likes({ data, small }: { data: CompaniesData; small: boolean }) {
  const env = useCompaniesEnv();
  const act = env.useAct();
  const lookup = env.useLookup();
  const setup = env.useFindSetup();
  const [pasting, setPasting] = useState<{ text?: string } | null>(null);
  const words = setup && likeWords(setup.finding);
  const list = data.likes.map((l) => ({ domain: l.domain, ...(l.name ? { name: l.name } : {}), like: l.like }));
  const save = (likes: typeof list, message: string) =>
    act.setLikes({ likes }).then(() => toast({ message, action: { label: "Undo", key: "U", run: () => void act.setLikes({ likes: list }).catch(failed) } }));
  // The picker shows a failure's own words (a ConvexError's), else the fallback.
  const plainly = (e: unknown, fallback: string): never => {
    throw new Error(problem(e, fallback));
  };
  const suggest = (q: string) => lookup.suggest(q).catch((e: unknown) => plainly(e, "Couldn’t look that up. Type its website instead."));
  const website = (site: string) => lookup.website(site).catch((e: unknown) => plainly(e, "Couldn’t read that website. Try again."));
  const adding = data.searchable.filter((d) => d.ownSeeds?.some((s) => !list.some((l) => l.like && l.domain === s.domain)));
  const copy = () =>
    void navigator.clipboard.writeText(listText(list.map((l) => l.domain))).then(
      () => toast({ message: `Copied ${list.length} ${list.length === 1 ? "website" : "websites"}` }),
      () => toast({ message: "Couldn’t copy the list.", icon: "failed" }),
    );
  const listMenu = (
    <Menu
      label="More for Companies you like"
      title="Companies you like"
      items={[
        { label: "Paste a list", icon: "paste", detail: "Adds several at once: names or websites, one per line or separated by commas. You check each one before they’re added.", note: "Free", onSelect: () => setPasting({}) },
        { label: "Copy list", icon: "copy", detail: "Copies the websites of the companies you like, one per line.", note: "Free", disabled: !list.length, reason: "None yet", onSelect: copy },
      ]}
    />
  );

  return (
    <SettingRow
      title={
        <span className="flex items-start justify-between gap-3">
          Companies you like
          <span className="-my-1">{listMenu}</span>
        </span>
      }
      line="Each one is added to your companies, and searches find more like it."
    >
      {words &&
        (pasting ? (
          <PasteList
            small={small}
            initial={pasting.text}
            have={list.map((l) => l.domain)}
            resolve={(lines) => lookup.resolve(lines).catch((e: unknown) => plainly(e, "Couldn’t look those up. Try again."))}
            suggest={suggest}
            website={website}
            addDetail={(n) => `Adds ${n === 1 ? "this one" : `these ${n}`} to Companies you like: each one is added to your companies, and searches find more like it.`}
            addNote={words.addNote}
            onAdd={(companies) =>
              save([...list, ...companies.filter((c) => !list.some((l) => l.domain === c.domain)).map((c) => ({ ...c, like: true }))], `Added ${companies.length} ${companies.length === 1 ? "company" : "companies"}`).catch((e: unknown) =>
                plainly(e, "Couldn’t add those."),
              )
            }
            onClose={() => setPasting(null)}
          />
        ) : (
          <CompanyPicker
            label="Add a company you like"
            small={small}
            // The dialog opens on the search box, ready to type (not on a phone, where it would raise the keyboard).
            autoFocus={!small}
            suggest={suggest}
            website={website}
            addDetail={(name) =>
              name ? `Adds ${name} to Companies you like: it’s added to your companies, and searches find more like it.` : "Adds this website to Companies you like. Its name comes from its own site."
            }
            addNote={words.addNote}
            onList={(text) => setPasting({ text })}
            after={<PasteButton small={small} onClick={() => setPasting({})} />}
            onAdd={(c) => {
              const next = list.some((l) => l.domain === c.domain) ? list : [...list, { ...c, like: true }];
              return save(next, `Added ${c.name ?? c.domain}`).catch((e: unknown) => plainly(e, "Couldn’t add that."));
            }}
          />
        ))}
      {pasting ? null : list.length > 0 ? (
        <ul aria-label="Companies you like" className="flex flex-col">
          {data.likes.map((l) => {
            const called = l.name ?? l.domain;
            const set = (next: typeof list, message: string) => void save(next, message).catch(failed);
            return (
              <CompanyLine
                key={l.domain}
                name={l.name}
                domain={l.domain}
                tag={!l.like ? "Not used to find more like it" : l.lookup?.apolloId === null ? "Not in Apollo" : undefined}
                small={small}
                menu={[
                  l.like
                    ? {
                        label: "Don’t use to find more like it",
                        icon: "hide",
                        detail: `Searches stop looking for companies like ${called}. It stays on your companies.`,
                        note: "Free · Undo with U",
                        onSelect: () => set(list.map((x) => (x.domain === l.domain ? { ...x, like: false } : x)), `Not finding more like ${called}`),
                      }
                    : {
                        label: "Use to find more like it",
                        icon: "search",
                        detail: `Every direction’s next ${words?.likeVerb ?? "search"} also looks for companies like ${called}.`,
                        note: words?.likeNote,
                        onSelect: () => set(list.map((x) => (x.domain === l.domain ? { ...x, like: true } : x)), `Finding more like ${called}`),
                      },
                  "separator",
                  {
                    label: "Remove",
                    icon: "delete",
                    tone: "danger",
                    detail: `Takes ${called} off Companies you like. Companies already found stay where they are.`,
                    note: "Free · Undo with U",
                    onSelect: () => set(list.filter((x) => x.domain !== l.domain), `Removed ${called}`),
                  },
                ]}
              />
            );
          })}
        </ul>
      ) : (
        <Text size="sm" muted>
          None yet. Type a company you like, or paste a list.
        </Text>
      )}
      {!pasting && adding.length > 0 && (
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
