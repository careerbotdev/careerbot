import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { REVIEW_KINDS, type ReviewKind } from "../../../convex/reviewKinds";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import type { Card, Decide, Declined, Items } from "./decisions";
import { type ReviewEnv, ReviewEnvContext, type Summary } from "./env";
import { Review } from "./Review";

// The Review screen with fixture data: deciding a card takes it out (with its reason under Turned down), and Undo or
// Restore brings it back, as the real mutations do. Resize the window for medium and the phone.

const id = (s: string) => s as Id<"items">;
const side = { kind: "quote" as const, text: "By the end of 2021 we were running forty lanes out of the Ohio Valley cross-dock, up from none that spring.", from: "Ironbridge story", at: Date.UTC(2026, 8, 8) };
const goals = { kind: "quote" as const, text: "I want to help build the planning software I’ve spent years working around, for companies that sell it to food makers and shippers.", from: "Goals", at: Date.UTC(2026, 8, 20) };

type Group = { label: string; unlocks: boolean; preview: string; cards: Card[]; declined: Declined[] };
type Groups = Partial<Record<ReviewKind, Group>>;

const full: Groups = {
  limits: {
    label: "Limits",
    unlocks: true,
    preview: "Base pay at least $135k",
    declined: [],
    cards: [{ type: "limit", key: "l1", id: id("l1"), title: "Base pay at least $135k", line: "Base pay", context: "Base pay", value: "Base pay at least $135k", firm: true, note: null, clash: false, sources: [goals] }],
  },
  criteria: {
    label: "Direction criteria",
    unlocks: true,
    preview: "Supply Chain Product, Solutions Consulting",
    declined: [],
    cards: [
      {
        type: "criteria",
        key: "c1",
        id: id("c1"),
        title: "Where Supply Chain Product looks",
        line: "US, remote or Pittsburgh · 200 to 5,000 people",
        context: "Supply Chain Product",
        name: "Supply Chain Product",
        criteria: { seeds: ["meridian.example.com"], industries: ["Supply chain software", "Logistics technology", "Food manufacturing"], sizes: ["201-500", "501-1000", "1001-5000"], stages: [], titles: ["Product Manager, Supply Planning", "Senior Product Manager", "Group Product Manager", "Head of Product, Planning"], keywords: [] },
        sources: [goals],
      },
      {
        type: "criteria",
        key: "c2",
        id: id("c2"),
        title: "Where Solutions Consulting looks",
        line: "Supply chain software · 51 to 500 people",
        context: "Solutions Consulting",
        name: "Solutions Consulting",
        criteria: { seeds: [], industries: ["Supply chain software"], sizes: ["51-200", "201-500"], stages: ["Series B"], titles: ["Solutions Consultant", "Solutions Engineer"], keywords: [] },
        sources: [goals],
      },
    ],
  },
  companies: {
    label: "Companies to rate",
    unlocks: false,
    preview: "Meridian Coldchain, Loadstar Systems, Kestrel Freight",
    declined: [{ key: "z0", title: "Tidewell Medical Supply", line: "Medical supply distributor", decision: "Not for me", reason: "I want to stay close to food", restore: { via: "rate", id: "z0" as Id<"companies"> } }],
    cards: [
      { type: "company", key: "co1", id: "co1" as Id<"companies">, title: "Meridian Coldchain", line: "Cold-chain logistics software · Founded 2016", context: "Found for Supply Chain Product", name: "Meridian Coldchain", about: null, website: "https://meridian.example.com", openRoles: 42, fit: { tone: "good", title: "Fits your goals", text: "Builds planning software for food makers and their carriers." }, misfit: false, rating: null, sources: [] },
      { type: "company", key: "co2", id: "co2" as Id<"companies">, title: "Loadstar Systems", line: "Transportation management software · Founded 2019", context: "Found for Supply Chain Product", name: "Loadstar Systems", about: null, website: "https://loadstar.example.com", openRoles: 18, fit: null, misfit: false, rating: null, sources: [] },
      { type: "company", key: "co3", id: "co3" as Id<"companies">, title: "Kestrel Freight", line: "Digital freight brokerage · 600 people", context: "Found for Supply Chain Product", name: "Kestrel Freight", about: null, website: null, openRoles: null, fit: { tone: "caution", title: "Partly fits your goals", text: "Its product team builds for brokers, not planners; you said you’d rather not go back to booking freight." }, misfit: true, rating: null, sources: [] },
    ],
  },
  facts: {
    label: "Facts",
    unlocks: false,
    preview: "From your Ironbridge story",
    declined: [{ key: "f0", title: "Ran every terminal in the Midwest", line: "Network Operations Manager, Ironbridge Logistics", decision: "Rejected", reason: "Overstates my part", restore: { via: "review", id: id("f0") } }],
    cards: [
      { type: "fact", key: "f1", id: id("f1"), status: "proposed", title: "Opened the Ohio Valley cross-dock and planned its first 40 lanes in under a year.", line: "Network Operations Manager, Ironbridge Logistics", context: "Network Operations Manager, Ironbridge Logistics", text: "Opened the Ohio Valley cross-dock and planned its first 40 lanes in under a year.", orphan: null, sources: [side] },
      { type: "fact", key: "f2", id: id("f2"), status: "proposed", title: "Set the cross-dock’s appointment windows so inbound and outbound trucks never shared a door.", line: "Network Operations Manager, Ironbridge Logistics", context: "Network Operations Manager, Ironbridge Logistics", text: "Set the cross-dock’s appointment windows so inbound and outbound trucks never shared a door.", orphan: null, sources: [side] },
      { type: "fact", key: "f3", id: id("f3"), status: "approved", title: "Trained 30 dock leads on the new yard-check process.", line: "Network Operations Manager, Ironbridge Logistics", context: "No longer in your story", text: "Trained 30 dock leads on the new yard-check process.", orphan: { noLongerSaid: "The new version doesn’t mention training.", sourceDeleted: null }, sources: [side] },
    ],
  },
  rewrites: {
    label: "Rewrites",
    unlocks: false,
    preview: "On Brightwater Provisions",
    declined: [],
    cards: [{ type: "rewrite", key: "r1", id: id("r1"), status: "approved", title: "Took finished-goods inventory from 41 to 29 days of supply, freeing about $9M in working capital", line: "Senior Supply Planning Manager, Brightwater Provisions", context: "Senior Supply Planning Manager, Brightwater Provisions", now: "Lowered finished-goods inventory.", proposed: "Took finished-goods inventory from 41 to 29 days of supply, freeing about $9M in working capital", asked: "Add the days of supply", sources: [] }],
  },
  questions: {
    label: "Questions",
    unlocks: false,
    preview: "About Kettle & Crane Brewing",
    declined: [{ key: "q0", title: "How many distributors ordered off the shared forecast?", line: "Production Planning Lead, Kettle & Crane Brewing", decision: "Not now", reason: "Don’t remember", restore: { via: "followup", id: id("q0") } }],
    cards: [
      { type: "followup", key: "q1", id: id("q1"), title: "What changed after you set up MRP at Kettle & Crane?", line: "A result would make this line", context: "Production Planning Lead, Kettle & Crane Brewing", question: "What changed after you set up MRP at Kettle & Crane?", why: "A result would make this line stand out.", sources: [] },
      { type: "conflict", key: "q2", id: id("q2"), title: "Did you start at Ironbridge in 2019 or 2020?", line: "Network Operations Manager, Ironbridge Logistics", context: "Network Operations Manager, Ironbridge Logistics", question: "Did you start at Ironbridge in 2019 or 2020?", recordSays: "Started February 2020", narrativeSays: "Started November 2019", narrativeValue: "2019-11", field: "start", overlap: null, sources: [side] },
      {
        type: "conflict",
        key: "q3",
        id: id("q3"),
        title: "Your Ironbridge Logistics job ends Apr 2023 but your Three Rivers Pantry Network job starts Sep 2021. Which is right?",
        line: "Ironbridge Logistics and Three Rivers Pantry Network",
        context: "Ironbridge Logistics and Three Rivers Pantry Network",
        question: "Your Ironbridge Logistics job ends Apr 2023 but your Three Rivers Pantry Network job starts Sep 2021. Which is right?",
        recordSays: "Feb 2020 – Apr 2023",
        narrativeSays: "Sep 2021 – Mar 2023",
        narrativeValue: null,
        field: null,
        overlap: { ends: { roleKey: "ironbridge-logistics-network-operations-manager", employer: "Ironbridge Logistics" }, starts: { roleKey: "three-rivers-pantry-network-volunteer-logistics-lead", employer: "Three Rivers Pantry Network" } },
        sources: [],
      },
    ],
  },
  sameWork: {
    label: "Same work",
    unlocks: false,
    preview: "Ironbridge Logistics",
    declined: [],
    cards: [{ type: "duplicate", key: "d1:d2", id: id("d1"), other: id("d2"), title: "Cut empty miles 11%", line: "Same as “Matched backhauls between terminals”", context: "Network Operations Manager, Ironbridge Logistics", text: "Cut empty miles 11%", otherText: "Matched backhauls between terminals", sources: [side] }],
  },
};

function createStore(initial: Groups) {
  let groups = initial;
  let params = { kind: null as ReviewKind | null, item: null as string | null };
  const taken: { kind: ReviewKind; card: Card; at: number }[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const change = (kind: ReviewKind, g: Group) => {
    groups = { ...groups, [kind]: g };
    emit();
  };
  // Any decision on a card that's waiting takes it out; any call naming a card taken out (Undo, Restore) puts it back.
  const decide = async (args: { id?: string; other?: string; reason?: string; note?: string; status?: string }) => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 120);
    await promise;
    for (const kind of REVIEW_KINDS) {
      const g = groups[kind];
      const at = g?.cards.findIndex((c) => c.id === args.id) ?? -1;
      if (g && at >= 0 && args.status !== "proposed") {
        const card = g.cards[at];
        taken.push({ kind, card, at });
        const reason = args.reason ?? args.note;
        const declined: Declined[] = reason ? [{ key: card.key, title: card.title, line: card.line, decision: "Rejected", reason, restore: { via: "review", id: id(String(card.id)) } }] : [];
        return change(kind, { ...g, cards: g.cards.filter((_, i) => i !== at), declined: [...declined, ...g.declined] });
      }
    }
    const i = taken.findLastIndex((t) => t.card.id === args.id || ("other" in t.card && t.card.other === args.id));
    if (i >= 0) {
      const [t] = taken.splice(i, 1);
      const g = groups[t.kind]!;
      const cards = [...g.cards];
      cards.splice(t.at, 0, t.card);
      return change(t.kind, { ...g, cards, declined: g.declined.filter((d) => d.key !== t.card.key) });
    }
    for (const kind of REVIEW_KINDS) {
      const g = groups[kind];
      if (g?.declined.some((d) => d.restore.id === args.id)) return change(kind, { ...g, declined: g.declined.filter((d) => d.restore.id !== args.id) });
    }
  };
  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    groups: () => groups,
    params: () => params,
    setParams: (next: { kind?: ReviewKind | null; item?: string | null }) => {
      params = { kind: next.kind === undefined ? params.kind : next.kind, item: next.item === undefined ? params.item : next.item };
      emit();
    },
    decide: new Proxy({}, { get: () => decide }) as Decide,
  };
}

function Fixture({ groups }: { groups: Groups }) {
  const [store] = useState(() => createStore(groups));
  const env = useMemo((): ReviewEnv => {
    const useGroups = () => useSyncExternalStore(store.subscribe, store.groups, store.groups);
    return {
      useSummary: () => {
        const g = useGroups();
        return useMemo((): Summary => {
          const list = REVIEW_KINDS.flatMap((kind) => {
            const x = g[kind];
            return x && x.cards.length ? [{ kind, label: x.label, count: x.cards.length, preview: x.preview, unlocks: x.unlocks }] : [];
          });
          return { total: list.reduce((n, x) => n + x.count, 0), groups: list };
        }, [g]);
      },
      useItems: (kind) => {
        const g = useGroups()[kind];
        return useMemo(() => (g ? ({ kind, label: g.label, cards: g.cards, declined: g.declined } as Items) : undefined), [g, kind]);
      },
      useParams: () => ({ ...useSyncExternalStore(store.subscribe, store.params, store.params), set: store.setParams }),
      useDecide: () => store.decide,
    };
  }, [store]);
  return (
    <ShellProvider>
      <ReviewEnvContext.Provider value={env}>
        <Frame />
      </ReviewEnvContext.Provider>
    </ShellProvider>
  );
}

// The app's frame, reduced to what Review uses: the screen, and the phone's bottom bar. The bar is its own part, as in
// the shell, so showing a new mode doesn't render the screen again.
function Frame() {
  return (
    <div className="-m-6 flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <Review />
      </div>
      <Bar />
    </div>
  );
}

function Bar() {
  const small = useScreenSize() === "small";
  const { bar } = useShellState();
  return small && bar ? <BottomBar mode={bar} /> : null;
}

const meta = { title: "Screens/Review", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Waiting: Story = { render: () => <Fixture groups={full} /> };
export const Empty: Story = { render: () => <Fixture groups={{}} /> };
