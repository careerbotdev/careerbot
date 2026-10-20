"use client";

import { ConvexError } from "convex/values";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { CostEstimate } from "@/components/CostEstimate";
import { ErrorLine } from "@/components/Field";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { type Balance, type CompaniesData, useCompaniesEnv } from "./env";
import { aiLeftLine, credits, findEstimate, type FindResult, lastSearch, searchCost, totalCost } from "./findPlan";
import { searchSummary } from "./SearchSettings";

const problem = (e: unknown, fallback: string) => (e instanceof ConvexError ? String(e.data) : fallback);

// Find companies, on the way companies are found (Settings): each search and what it costs (Apollo credits, dollars
// from the AI budget, or both), the job-board searches with a Brave key (or that there are none without one), the
// directions that can't be searched yet, the estimate and what's left, and the one action. Under it, what the last
// search found, and what the web search couldn't do. What Search settings set sits above the action, with Change to open it.
export function FindCompanies({ data, onSettings }: { data: CompaniesData; onSettings: () => void }) {
  const env = useCompaniesEnv();
  const act = env.useAct();
  const setup = env.useFindSetup();
  const readBalance = env.useBalance();
  const [balance, setBalance] = useState<Balance | undefined>();
  const [error, setError] = useState<string | null>(null);
  const apollo = setup ? setup.finding !== "web" : false;
  useEffect(() => {
    if (!apollo) return;
    let live = true;
    readBalance()
      .then((b) => live && setBalance(b))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
    };
  }, [readBalance, apollo]);
  if (!setup) return null;
  const busy = data.last?.status === "queued" || data.last?.status === "running";
  const est = findEstimate(data, setup);
  const total = totalCost(est);
  const result = data.last?.status === "done" ? lastSearch(data.last.result as FindResult) : null;
  const row = "flex min-h-7.5 items-center gap-3 border-t text-body-sm leading-body-sm";
  const link = "tap shrink-0 font-medium text-text underline decoration-border underline-offset-3 hover:decoration-text";
  const searching = [est.apollo ? "Apollo" : null, est.web ? "the web" : null, est.boardSearches ? "job boards" : null].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <span className="pb-1.5 text-label leading-label font-medium text-muted">Searches</span>
        {est.searches.map((s) => (
          <div key={s.name} className={row}>
            <span className="min-w-0 flex-1 truncate text-text">{s.name}</span>
            <span className="text-muted tabular-nums">{searchCost(s)}</span>
          </div>
        ))}
        {est.boardSearches > 0 && (
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-text">Job boards for ones hiring now</span>
            <span className="text-muted tabular-nums">
              {est.boardSearches} Brave {est.boardSearches === 1 ? "search" : "searches"}
            </span>
          </div>
        )}
        {est.web && !setup.braveKey && (
          <div className={`${row} py-1.5`}>
            <span className="min-w-0 flex-1 text-muted">Job boards aren’t searched without a Brave Search key.</span>
            <Link href="/settings?section=connections" className={link}>
              Add key
            </Link>
          </div>
        )}
        {est.seeds > 0 && (
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-text">Like the companies you like</span>
            <span className="text-muted tabular-nums">{credits(est.seeds)}</span>
          </div>
        )}
        {est.named > 0 && (
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-text">Companies you added</span>
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
          <span className="min-w-0 flex-1 text-muted">{searchSummary(data)}</span>
          <Button variant="ghost" size="sm" detail="Opens the companies you like, industries, goals check and ratings these searches use." note="Free" onClick={onSettings}>
            Change
          </Button>
        </div>
        {data.needCriteria.filling && (
          <div className={`${row} py-1.5`}>
            <span className="min-w-0 flex-1 text-text">
              Filling in your directions ({data.needCriteria.filling.done} of {data.needCriteria.filling.total})
            </span>
          </div>
        )}
        {data.needCriteria.rows
          .filter((d) => d.state !== "filling")
          .map((d) =>
            d.state === "review" ? (
              <div key={d.id} className={`${row} py-1.5`}>
                <span className="min-w-0 flex-1 text-muted">{d.name}: criteria to review</span>
                <Link href={`/goals/directions?direction=${d.id}&tab=criteria`} className={link}>
                  Review
                </Link>
              </div>
            ) : (
              <div key={d.id} className={`${row} py-1.5`}>
                <span className="min-w-0 flex-1 text-muted">{d.name}: {d.state === "failed" ? "couldn’t fill in, try again" : "not filled in yet"}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  detail={`Proposes the positioning, titles and search criteria for ${d.name}, from your approved record.`}
                  note="Uses your AI budget · Nothing changes until you approve it"
                  onClick={() => void act.fillInDirections({ id: d.id }).then(() => toast({ message: `Filling in ${d.name}`, icon: "running" }), (e: unknown) => setError(problem(e, "Couldn’t start.")))}
                >
                  Fill in
                </Button>
              </div>
            ),
          )}
      </div>
      <div className="flex items-center gap-3 border-t pt-3">
        <Button
          variant="primary"
          icon="search"
          loading={busy}
          loadingLabel="Searching"
          reason={data.searchable.length ? undefined : "Approve a direction’s search criteria first."}
          detail={`Searches ${searching.length < 2 ? searching.join("") : `${searching.slice(0, -1).join(", ")} and ${searching.at(-1)}`} for companies for each direction${est.apollo ? `, and ones like the companies you like${data.learn ? " and your targets" : ""}` : ""}. Your past employers never come back${data.learn ? ", nor do companies you said Not for me" : ""}.`}
          note={`${total}.`}
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
          <CostEstimate amount={total} className="whitespace-normal! text-text" />
          {est.apollo
            ? balance && (
                <span className="text-label leading-label text-muted tabular-nums">
                  {balance.left.toLocaleString("en-US")} of {balance.limit.toLocaleString("en-US")} credits left this cycle
                </span>
              )
            : setup.aiLeft && <span className="text-label leading-label text-muted tabular-nums">{aiLeftLine(setup.aiLeft)}</span>}
        </span>
      </div>
      {(error || data.last?.status === "failed" || data.last?.status === "paused") && <ErrorLine>{error ?? data.last?.error ?? "The last search stopped."}</ErrorLine>}
      {result && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <span className="text-label leading-label font-medium text-muted">Last search</span>
          {result.lines.map((line) => (
            <Text key={line} size="sm" muted>
              {line}
            </Text>
          ))}
          {result.notes.map((note) => (
            <Text key={note} size="sm" className="text-caution-text">
              {note}
            </Text>
          ))}
        </div>
      )}
    </div>
  );
}
