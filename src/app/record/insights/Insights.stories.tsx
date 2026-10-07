import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { answer } from "../../storyConvex";
import { itemId, NOW, recordFixture, type RecordState } from "../fixtures";
import { RecordStory } from "../RecordStory";
import { Insights } from "./Insights";

// The Insights screen with the fixture record, one story per board of the Record page's Insights: an approved insight
// in their wording with where it's used and the direction sharing its facts; its facts with their story quotes beside;
// a rejected one with its reason; rejecting one (the reason in place); the list alone and while it looks for new ones;
// and a new record with none. Clicks, J and K, E, R, Enter and Esc work as in the app; resize the window for medium
// (768 to 1279) and the phone (under 768).

type Item = Doc<"items">;
type Of<K extends Item["kind"]> = Extract<Item, { kind: K }>;
const DAY = 86_400_000;

// What the record's shared answers don't cover: where each fact lives and the resumes an insight is in
// (insights.list), the directions whose facts it shares, and Find new insights.
function insightAnswers(state: RecordState) {
  const usedIn: Record<string, { resume: "base" | Id<"items">; name: string | null; at: number }[]> = {
    [itemId("ins-one-number")]: [{ resume: "base", name: null, at: NOW }],
    [itemId("ins-growth")]: [{ resume: "base", name: null, at: NOW }],
    [itemId("ins-tools")]: [
      { resume: "base", name: null, at: NOW },
      { resume: itemId("dir-coldchain"), name: "Cold Chain Operations", at: NOW - 2 * DAY },
    ],
  };
  const coldChain = ["pantry-truck", "bw-recall", "ib-carriers", "kcPlan-distributors"].map((k) => itemId(`f-${k}`));
  return {
    ...answer(api.insights.list, () => {
      const job = state.jobs.find((j) => j.kind === "insights");
      const facts = new Map(state.items.filter((i): i is Of<"fact"> => i.kind === "fact").map((f) => [String(f._id), f]));
      const projects = new Map(state.items.filter((i): i is Of<"project"> => i.kind === "project").map((p) => [p.projectKey, p.data.name]));
      return {
        last: job ? { status: job.status, error: job.error, added: (job.result?.insights as number | undefined) ?? null } : null,
        insights: state.items
          .filter((i): i is Of<"insight"> => i.kind === "insight" && (i.status === "proposed" || i.status === "approved" || i.status === "rejected"))
          .map((i) => ({
            id: i._id,
            status: i.status,
            data: i.data,
            basedOn: i.data.factIds.map((id) => {
              const f = facts.get(id);
              return {
                id,
                text: f?.data.text ?? "(fact removed)",
                counts: f?.status === "approved",
                project: f?.projectKey ? projects.get(f.projectKey) : undefined,
                role: f?.roleKey,
                roleKey: f?.roleKey ?? null,
                projectKey: f?.projectKey ?? null,
              };
            }),
            usedIn: i.status === "approved" ? (usedIn[i._id] ?? []) : [],
          })),
      };
    }),
    ...answer(api.directions.list, () => ({
      last: null,
      directions: [
        {
          id: itemId("dir-coldchain"),
          status: "proposed" as const,
          data: { name: "Cold Chain Operations", suggested: true, evidence: coldChain },
          sources: [],
          carriesOver: [],
          reframe: [],
          evidence: coldChain.map((id) => (state.items.find((x) => x._id === id) as Of<"fact"> | undefined)?.data.text ?? ""),
          avoided: [],
        },
      ],
    })),
    ...answer(api.insights.start, () => {
      state.jobs = [{ kind: "insights", args: { why: "request" }, status: "running" }, ...state.jobs];
      return "job-insights" as Id<"jobs">;
    }),
  };
}

function Screen({ query, empty = false, setup }: { query?: string; empty?: boolean; setup?: (state: RecordState) => void }) {
  const [answers] = useState(() => {
    const fx = recordFixture({ empty });
    setup?.(fx.state);
    return { ...fx.answers, ...insightAnswers(fx.state) };
  });
  return (
    <RecordStory path="/record/insights" query={query} answers={answers}>
      <Insights />
    </RecordStory>
  );
}

const meta = { title: "Screens/Insights", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
const oneNumber = `insight=${itemId("ins-one-number")}`;

export const Insight: Story = { render: () => <Screen query={oneNumber} /> };

export const FactsPeek: Story = {
  name: "Facts peek",
  render: () => <Screen query={oneNumber} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Built on 4: show sources" }));
  },
};

export const Rejected: Story = { render: () => <Screen query={`tab=rejected&insight=${itemId("ins-volunteer")}`} /> };

export const Rejecting: Story = {
  render: () => <Screen query={`insight=${itemId("ins-growth")}`} />,
  play: async () => {
    await page().findByRole("heading", { name: /You plan growth/ });
    await userEvent.keyboard("r");
  },
};

export const List: Story = { render: () => <Screen /> };

export const Looking: Story = {
  name: "Looking for new insights",
  render: () => <Screen setup={(s) => (s.jobs = [{ kind: "insights", args: { why: "request" }, status: "running" }, ...s.jobs])} />,
};

export const NothingNew: Story = {
  name: "Nothing new last time",
  render: () => <Screen setup={(s) => (s.jobs = [{ kind: "insights", args: { why: "request" }, status: "done", result: { insights: 0 } }, ...s.jobs])} />,
};

export const Empty: Story = { name: "No insights yet", render: () => <Screen empty /> };
