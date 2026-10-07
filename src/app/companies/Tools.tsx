"use client";

import { ConvexError } from "convex/values";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import type { Lens } from "../../../convex/lens";
import { Button } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { Dialog } from "@/components/Dialog";
import { ErrorLine, Field, Textarea } from "@/components/Field";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { type Balance, type CompaniesData, useCompaniesEnv } from "./env";

const credits = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "credit" : "credits"}`;
const problem = (e: unknown, fallback: string) => (e instanceof ConvexError ? String(e.data) : fallback);

type Report = {
  direction: string;
  large?: { found: number; added: number };
  criteria: { found: number; added: number; total: number | null };
  hiring: { found: number; added: number; total: number | null } | null;
  lookalikes: { seeds: string[]; found: number; added: number }[];
};
type Result = { named?: { found: number; added: number; missing: string[] } | null; report: Report[]; seedsNotInApollo?: string[] };

// What a search for companies would run and about what it costs in Apollo credits: two searches per direction with
// approved criteria (one more when it has titles to look for hiring companies), lookalike searches of up to five seeds
// (directions sharing seeds share them) and of up to five targets (when learning from ratings), a lookup for seeds not
// yet looked up, and the named companies by the hundred.
export function findEstimate(data: CompaniesData) {
  const lookups = data.seeds.filter((s) => !s.lookup).length + data.searchable.flatMap((d) => d.ownSeeds ?? []).length;
  const batchesOf = (sets: string[][]) => [...new Set(sets.map((s) => s.join(",")))].reduce((n, set) => n + Math.ceil((set ? set.split(",").length : 0) / 5), 0);
  const batches = batchesOf(data.searchable.map((d) => d.ownSeeds ?? data.seeds.map((x) => x.domain)));
  const targets = batchesOf(data.searchable.map((d) => d.targets));
  const searches = data.searchable.map((d) => ({ name: d.name, credits: 2 + (d.hasTitles ? 1 : 0) }));
  const seeds = batches + (lookups ? 1 : 0);
  const named = Math.ceil(data.named.length / 100);
  return { searches, seeds, targets, named, total: searches.reduce((n, s) => n + s.credits, 0) + seeds + targets + named };
}

// Which targets seed which directions' searches, or that learning from ratings is off.
function learnedLine(data: CompaniesData) {
  if (!data.learn) return "Learning from your ratings is off: targets don’t seed searches, and companies you said Not for me can be found again.";
  const by = new Map<string, string[]>();
  for (const d of data.searchable) for (const t of d.targets) by.set(t, [...(by.get(t) ?? []), d.name]);
  const seeding = [...by].map(([t, dirs]) => `${t} for ${dirs.length < 2 ? dirs.join("") : `${dirs.slice(0, -1).join(", ")} and ${dirs[dirs.length - 1]}`}`);
  return `${seeding.length ? `Your targets seed it too: ${seeding.join("; ")}.` : "Targets seed it too once they fit a direction."} Companies you said Not for me aren’t found again.`;
}

// Find companies: each search and its credits, the directions that can't be searched yet, the estimate and what's left
// this cycle, and the one action. Under it, what the last search found.
export function FindCompanies({ data }: { data: CompaniesData }) {
  const env = useCompaniesEnv();
  const act = env.useAct();
  const readBalance = env.useBalance();
  const [balance, setBalance] = useState<Balance | undefined>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    readBalance()
      .then((b) => live && setBalance(b))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
    };
  }, [readBalance]);
  const busy = data.last?.status === "queued" || data.last?.status === "running";
  const est = findEstimate(data);
  const result = data.last?.status === "done" ? (data.last.result as Result) : null;
  const row = "flex min-h-7.5 items-center gap-3 border-t text-body-sm leading-body-sm";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <span className="pb-1.5 text-label leading-label font-medium text-muted">Searches</span>
        {est.searches.map((s) => (
          <div key={s.name} className={row}>
            <span className="min-w-0 flex-1 truncate text-text">{s.name}</span>
            <span className="text-muted tabular-nums">{credits(s.credits)}</span>
          </div>
        ))}
        {est.seeds > 0 && (
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-text">Like your seed companies</span>
            <span className="text-muted tabular-nums">{credits(est.seeds)}</span>
          </div>
        )}
        {est.named > 0 && (
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-text">Companies you’d name</span>
            <span className="text-muted tabular-nums">{credits(est.named)}</span>
          </div>
        )}
        {est.targets > 0 && (
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-text">Like your targets</span>
            <span className="text-muted tabular-nums">{credits(est.targets)}</span>
          </div>
        )}
        <div className={`${row} py-1.5`}>
          <span className="min-w-0 flex-1 text-muted">{learnedLine(data)}</span>
          <Link href="/settings?section=companies" className="tap shrink-0 font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text">
            Change
          </Link>
        </div>
        {data.needCriteria.map((d) => (
          <div key={d.id} className={`${row} py-1.5`}>
            <span className="min-w-0 flex-1 text-muted">{d.name} needs search criteria first</span>
            <Link href={`/goals/directions?direction=${d.id}&tab=criteria`} className="tap shrink-0 font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text">
              Review
            </Link>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t pt-3">
        <Button
          variant="primary"
          icon="search"
          loading={busy}
          loadingLabel="Searching"
          reason={data.searchable.length ? undefined : "Approve a direction’s search criteria first."}
          detail={`Searches Apollo for companies for each direction, and ones like your seeds${data.learn ? " and targets" : ""}. Your past employers never come back${data.learn ? ", nor do companies you said Not for me" : ""}.`}
          note={`About ${est.total} Apollo ${est.total === 1 ? "credit" : "credits"}.`}
          onClick={() =>
            void act
              .find({})
              .then(() => {
                setError(null);
                toast({ message: "Finding companies", icon: "running" });
              })
              .catch((e: unknown) => setError(problem(e, "Couldn’t start.")))
          }
        >
          Find companies
        </Button>
        <span className="flex min-w-0 flex-col">
          <CostEstimate amount={`About ${est.total} Apollo ${est.total === 1 ? "credit" : "credits"}`} className="text-text" />
          {balance && (
            <span className="text-label leading-label text-muted tabular-nums">
              {balance.left.toLocaleString("en-US")} of {balance.limit.toLocaleString("en-US")} left this cycle
            </span>
          )}
        </span>
      </div>
      {(error || data.last?.status === "failed" || data.last?.status === "paused") && <ErrorLine>{error ?? data.last?.error ?? "The last search stopped."}</ErrorLine>}
      {result && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <span className="text-label leading-label font-medium text-muted">Last search</span>
          {result.report.map((r) => (
            <Text key={r.direction} size="sm" muted>
              {r.direction}: {r.criteria.found} from its criteria{r.criteria.total !== null ? ` (of ${r.criteria.total.toLocaleString("en-US")} in Apollo)` : ""}, {r.criteria.added} new
              {r.large ? `; ${r.large.found} large companies, ${r.large.added} new` : ""}
              {r.hiring ? `; ${r.hiring.found} hiring for its titles, ${r.hiring.added} new` : ""}
              {(r.lookalikes ?? []).map((l) => (l.found ? `; ${l.found} like ${l.seeds.join(", ")}` : `; none like ${l.seeds.join(", ")} in Apollo`)).join("")}
            </Text>
          ))}
          {result.named && (
            <Text size="sm" muted>
              Companies you named: {result.named.found} found, {result.named.added} new{result.named.missing.length ? `; not in Apollo: ${result.named.missing.join(", ")}` : ""}
            </Text>
          )}
          {(result.seedsNotInApollo ?? []).length > 0 && (
            <Text size="sm" muted>
              Seeds not in Apollo: {result.seedsNotInApollo!.join(", ")}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

// A list of websites edited as text, saved together.
function ListDialog({
  open,
  onOpenChange,
  title,
  label,
  hint,
  initial,
  placeholder,
  children,
  saveDetail,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  hint: string;
  initial: string[];
  placeholder: string;
  children?: ReactNode;
  // What Save does, for its explainer.
  saveDetail: string;
  onSave: (list: string[]) => Promise<unknown>;
}) {
  const [text, setText] = useState(initial.join(", "));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    onSave(text.split(/[,\n]/))
      .then(() => onOpenChange(false))
      .catch((e: unknown) => setError(problem(e, "Couldn’t save.")))
      .finally(() => setSaving(false));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} loadingLabel="Saving" keys="⌘↵" detail={saveDetail} note="Free · Edit the list again to change it" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {children}
      <Field label={label} hint={hint} error={error}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}

export function NamedDialog({ data, open, onOpenChange }: { data: CompaniesData; open: boolean; onOpenChange: (open: boolean) => void }) {
  const act = useCompaniesEnv().useAct();
  return (
    <ListDialog
      key={String(open)}
      open={open}
      onOpenChange={onOpenChange}
      title="Companies you’d name"
      label="Websites, comma-separated"
      hint="Companies you already want on the list, added to every search. About 1 Apollo credit per 100."
      initial={data.named}
      placeholder="acme.com, globex.com"
      saveDetail="Saves the list; every search adds these companies."
      onSave={(named) => act.setNamed({ named })}
    />
  );
}

export function SeedsDialog({ data, open, onOpenChange }: { data: CompaniesData; open: boolean; onOpenChange: (open: boolean) => void }) {
  const act = useCompaniesEnv().useAct();
  return (
    <ListDialog
      key={String(open)}
      open={open}
      onOpenChange={onOpenChange}
      title="Seed companies"
      label="Websites, comma-separated"
      hint="Companies you’d love to work at. Each direction also finds companies like these, unless it has its own."
      initial={data.seeds.map((s) => s.domain)}
      placeholder="initech.com, globex.com"
      saveDetail="Saves your seed companies; searches find companies like them."
      onSave={(seeds) => act.setSeeds({ seeds })}
    >
      {data.seeds.length > 0 && (
        <ul className="flex flex-col">
          {data.seeds.map((s) => (
            <li key={s.domain} className="flex min-h-7.5 items-center gap-3 border-t text-body-sm leading-body-sm">
              <span className="min-w-0 flex-1 truncate text-text">{s.lookup?.name ?? s.domain}</span>
              <span className="shrink-0 text-muted">{s.lookup === null ? "Not looked up yet" : s.lookup.apolloId === null ? "Not in Apollo" : s.domain}</span>
            </li>
          ))}
        </ul>
      )}
    </ListDialog>
  );
}

const INDUSTRIES: Record<Lens["industries"], string> = {
  steer: "Searches start with them and add related ones.",
  only: "Searches keep to them.",
  ignore: "Searches don’t look at industry.",
};
const JUDGE: Record<Lens["judge"], string> = {
  off: "Companies aren’t checked against your goals.",
  rank: "Ones that fit your goals rank higher in Found.",
  hide: "Ones that don’t fit move to Doesn’t fit your goals, where you can keep them.",
};

// How their goals shape the search and the lists. Each change takes effect at once.
export function LensDialog({ data, open, onOpenChange }: { data: CompaniesData; open: boolean; onOpenChange: (open: boolean) => void }) {
  const act = useCompaniesEnv().useAct();
  const set = (lens: Lens) =>
    void act
      .setLens(lens)
      .then(() => (lens.judge !== "off" && lens.judge !== data.lens.judge ? act.rejudge({}) : undefined))
      .catch((e: unknown) => toast({ message: problem(e, "Couldn’t save that."), icon: "failed" }));
  const row = "flex items-start gap-4 border-t pt-3.5 max-md:flex-col max-md:gap-2";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Lens"
      footer={
        <div className="flex w-full items-center gap-3">
          <Text size="sm" muted className="min-w-0 flex-1">
            Found re-sorts now; the next search uses these too.
          </Text>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      }
    >
      <div className={row}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-body-sm leading-body-sm">
          <span className="font-medium text-text">Industries you want</span>
          <span className="text-muted">{INDUSTRIES[data.lens.industries]}</span>
        </div>
        <SegmentedControl
          label="Industries you want"
          hideLabel
          value={data.lens.industries}
          onChange={(industries) => set({ ...data.lens, industries })}
          options={[
            { value: "steer", label: "Steer" },
            { value: "only", label: "Only these" },
            { value: "ignore", label: "Ignore" },
          ]}
        />
      </div>
      <div className={row}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-body-sm leading-body-sm">
          <span className="font-medium text-text">Judge companies against your goals</span>
          <span className="text-muted">
            {JUDGE[data.lens.judge]}
            {data.lens.judge === "off" ? "" : " About a cent per 40 companies when it changes."}
          </span>
        </div>
        <SegmentedControl
          label="Judge companies against your goals"
          hideLabel
          value={data.lens.judge}
          onChange={(judge) => set({ ...data.lens, judge })}
          options={[
            { value: "off", label: "Off" },
            { value: "rank", label: "Rank" },
            { value: "hide", label: "Hide" },
          ]}
        />
      </div>
    </Dialog>
  );
}
