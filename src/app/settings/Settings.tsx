"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { List, ListRow } from "@/components/ListRow";
import { PaneHeader, PaneLayout, useScreenSize } from "@/components/Panes";
import { useDemo } from "../demo/demo";
import { modelName, useRecommended } from "../ModelChoice";
import { useCommands } from "../shell/ShellContext";
import { Account } from "./Account";
import { Ai } from "./Ai";
import { Compare } from "./Compare";
import { Budgets, usd } from "./Budgets";
import { Companies } from "./Companies";
import { Contact } from "./Contact";
import { Drive } from "./Drive";
import { Keys } from "./Keys";
import { Reminders } from "./Reminders";
import { Updates, updatesLine } from "./Updates";
import { YourData } from "./YourData";

// Settings: a list of sections, each with its current state under its name, and the chosen one open beside it
// (?section=). On a phone the list comes first and a section opens full screen, with Back to the list. Updates shows
// only to a self-hosted copy's owner.

const SECTIONS = [
  { key: "account", title: "Account" },
  { key: "ai", title: "AI" },
  { key: "budgets", title: "Budgets and spending" },
  { key: "keys", title: "Keys" },
  { key: "companies", title: "Companies" },
  { key: "reminders", title: "Reminders" },
  { key: "contact", title: "Contact and GitHub" },
  { key: "drive", title: "Google Drive" },
  { key: "updates", title: "Updates" },
  { key: "yourdata", title: "Your data" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

const listWords = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
const INDUSTRY_WORDS = { steer: "Steer by industry", only: "Only your industries", ignore: "Any industry" };
const JUDGE_WORDS = { off: "goals not checked", rank: "rank by goals", hide: "hide misfits" };

// selfHosted: a self-hosted copy's Account (mode.ts); stories set it.
export function Settings({ signOut, selfHosted }: { signOut: () => void; selfHosted?: boolean }) {
  const size = useScreenSize();
  const small = size === "small";
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const asked = params.get("section");
  const updates = useQuery(api.updates.status);
  const sections = useMemo(() => SECTIONS.filter((s) => s.key !== "updates" || !!updates), [updates]);
  const chosen: Section | null = sections.some((s) => s.key === asked) ? (asked as Section) : small ? null : "account";
  const open = (key: Section | null) => router.push(key ? `${path}?section=${key}` : path, { scroll: false });
  // Compare models: a pane of AI (?section=ai&compare=1). Back goes to AI with Advanced open, where it's reached from.
  const comparing = chosen === "ai" && params.get("compare") === "1";
  const recommended = useRecommended();
  const lines = useLines(recommended.data?.models);

  useCommands(
    useMemo(
      () => [
        ...sections.map((s) => ({ id: `settings-${s.key}`, group: "Settings", label: s.title, icon: "settings" as const, onSelect: () => router.push(`/settings?section=${s.key}`) })),
        { id: "settings-compare", group: "Settings", label: "Compare models", icon: "settings" as const, onSelect: () => router.push("/settings?section=ai&compare=1") },
      ],
      [router, sections],
    ),
  );

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Settings" />
      <List label="Settings" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sections.map((s) => (
          <ListRow key={s.key} title={s.title} line={lines[s.key] ?? " "} selected={!small && chosen === s.key} onOpen={() => open(s.key)} />
        ))}
      </List>
    </div>
  );

  const panes: Record<Section, React.ReactNode> = {
    account: <Account size={size} signOut={signOut} selfHosted={selfHosted} />,
    ai: comparing ? <Compare size={size} recommended={recommended} /> : <Ai size={size} recommended={recommended} />,
    budgets: <Budgets size={size} />,
    keys: <Keys size={size} />,
    companies: <Companies size={size} />,
    reminders: <Reminders size={size} />,
    contact: <Contact size={size} />,
    drive: <Drive size={size} />,
    updates: <Updates size={size} />,
    yourdata: <YourData size={size} />,
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLayout
        list={list}
        item={chosen ? panes[chosen] : undefined}
        back={comparing ? { label: "AI", onBack: () => router.push(`${path}?section=ai&advanced=1`, { scroll: false }) } : { label: "Settings", onBack: () => open(null) }}
      />
    </div>
  );
}

// Each section's current state, for the line under its name.
function useLines(recommended?: { id: string; name: string }[]): Partial<Record<Section, string>> {
  const me = useQuery(api.users.me);
  const main = useQuery(api.aiSettings.defaultChoice);
  const tasks = useQuery(api.aiSettings.list);
  const budgets = useQuery(api.budgets.status);
  const openrouter = useQuery(api.openrouterKey.status);
  const apollo = useQuery(api.apolloKey.status);
  const brave = useQuery(api.braveKey.status);
  const companies = useQuery(api.discovery.companySettings);
  const reminders = useQuery(api.pursuits.reminderRules);
  const drive = useQuery(api.drive.status);
  const updates = useQuery(api.updates.status);
  const demo = useDemo();

  const own = tasks?.filter((t) => !t.decision && t.own).length ?? 0;
  const keys = [openrouter?.set && "OpenRouter", apollo?.set && "Apollo", brave?.set && "Brave"].filter((k): k is string => !!k);
  const on = reminders ? Object.values(reminders).filter(Boolean).length : 0;
  const total = reminders ? Object.keys(reminders).length : 0;
  return {
    account: me?.username ?? me?.email ?? undefined,
    ai: main === undefined ? undefined : !main ? "No model chosen yet" : `${modelName(main.model, undefined, recommended)} ${own ? `· ${own} ${own === 1 ? "task" : "tasks"} with their own` : "for every task"}`,
    budgets: budgets && (budgets.aiMonthlyUsd > 0 ? `${usd(budgets.aiSpentUsd)} of ${usd(budgets.aiMonthlyUsd)} this month` : "No AI budget set"),
    keys: demo ? "None in the demo" : openrouter && apollo && brave ? (keys.length ? `${listWords(keys)} added` : "No keys yet") : undefined,
    reminders: reminders && (on === total ? `All ${total} on` : on === 0 ? "All off" : `${on} of ${total} on`),
    contact: "In your base resume and Projects",
    drive: drive && (!drive.connected ? "Not connected" : drive.connected.broken ? "Needs connecting again" : drive.connected.failed ? `${drive.connected.failed} not synced` : `Connected as ${drive.connected.account}`),
    companies: companies && `${INDUSTRY_WORDS[companies.lens.industries]} · ${JUDGE_WORDS[companies.lens.judge]}`,
    updates: updates ? updatesLine(updates) : undefined,
    yourdata: "Export or import everything",
  };
}
