import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { answer, type Answers } from "../storyConvex";

// Fixture data for Compare models (Settings, AI): two career stories and a goals one, and three past comparisons, newest
// first: the base resume by DeepSeek v4.1 Flash and Claude Sonnet 5.5; insights by three models, one still running;
// and a read of "Kettle & Crane Brewing" where one model's reply couldn't be read. Compare adds one, running.

type Comparison = NonNullable<FunctionReturnType<typeof api.compare.get>>;
type Story = FunctionReturnType<typeof api.narratives.list>[number];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const story = (id: string, title: string, kind: Story["kind"], words: number): Story => ({
  id: id as Id<"narratives">,
  kind,
  title,
  version: 3,
  updatedAt: NOW - 9 * DAY,
  rejected: false,
  rejectedBecause: null,
  words,
  roleKey: null,
});

const STORIES: Story[] = [story("n-kettle", "Kettle & Crane Brewing", "career", 1840), story("n-ironbridge", "Ironbridge Logistics", "career", 920), story("n-goals", "What I want next", "goals", 410)];

const resumeDoc = (summary: string, bullets: string[][]) => ({
  summary,
  experience: [
    { roleKey: "bw", title: "Senior Supply Planning Manager", employer: "Brightwater Provisions", start: "2023-04", location: "Pittsburgh, PA", bullets: bullets[0].map((text) => ({ text, factIds: [] })) },
    { roleKey: "ib", title: "Network Operations Manager", employer: "Ironbridge Logistics", start: "2020-02", end: "2023-04", location: "Pittsburgh, PA", bullets: bullets[1].map((text) => ({ text, factIds: [] })) },
  ],
  skills: [{ group: "Tools", items: ["NetSuite", "SAP IBP", "Power BI", "Python"] }],
});

const COMPARISONS: Comparison[] = [
  {
    id: "c-resume" as Id<"comparisons">,
    task: "resume",
    narrativeTitle: null,
    narrativeVersion: null,
    at: NOW - 2 * DAY,
    contenders: [
      {
        model: "deepseek/deepseek-v4.1-flash",
        reasoning: "high",
        status: "done",
        costUsd: 0.0061,
        seconds: 38.2,
        inputTokens: 18_420,
        outputTokens: 2_310,
        output: {
          doc: resumeDoc("Supply planning leader who runs S&OP for a 640-SKU food maker after years running freight networks. Freed about $9 million in working capital at Brightwater Provisions.", [
            ["Lead supply planning for 640 SKUs across two plants and two co-packers.", "Took inventory from 41 to 29 days of supply, freeing about $9 million.", "Raised forecast accuracy from 61% to 74% with a Python model."],
            ["Moved about 180 dispatchers and planners at four terminals onto a new TMS.", "Cut empty miles by 11% by matching backhauls between terminals."],
          ]),
        },
      },
      {
        model: "anthropic/claude-sonnet-5.5",
        reasoning: "high",
        status: "done",
        costUsd: 0.0842,
        seconds: 61.7,
        inputTokens: 18_390,
        outputTokens: 2_870,
        output: {
          doc: resumeDoc("Supply planning leader who keeps grocery shelves full on less inventory, with a freight background that makes plans hold up on the dock.", [
            ["Plan 640 SKUs across two plants and two co-packers, about $210 million a year in cost of goods.", "Freed about $9 million in working capital by cutting inventory from 41 to 29 days of supply with no drop in service.", "Replaced a 40-tab spreadsheet forecast with a Python model, lifting accuracy from 61% to 74%."],
            ["Took about 180 dispatchers and planners at four terminals onto a new TMS over one weekend.", "Cut empty miles 11% by planning backhauls across terminals instead of one at a time."],
          ]),
        },
      },
    ],
  },
  {
    id: "c-insights" as Id<"comparisons">,
    task: "insights",
    narrativeTitle: null,
    narrativeVersion: null,
    at: NOW - 5 * DAY,
    contenders: [
      {
        model: "deepseek/deepseek-v4.1-flash",
        status: "done",
        costUsd: 0.0034,
        seconds: 21.4,
        inputTokens: 14_200,
        outputTokens: 610,
        output: {
          insights: [
            { text: "You move whole operations onto new systems, from a brewery’s first MRP to a freight network’s TMS.", facts: ["Moved about 180 dispatchers and planners at four terminals onto a new TMS.", "Set up the brewery’s first MRP in NetSuite."] },
            { text: "You find where stock or miles are wasted and rebuild that step of the plan.", facts: ["Took inventory from 41 to 29 days of supply, freeing about $9 million.", "Cut empty miles by 11% by matching backhauls between terminals."] },
          ],
        },
      },
      {
        model: "google/gemini-3.8-flash",
        reasoning: "medium",
        status: "done",
        costUsd: 0.0118,
        seconds: 17.9,
        inputTokens: 14_180,
        outputTokens: 840,
        output: {
          insights: [
            { text: "You take a problem from the floor to a working tool, then teach the people who use it.", facts: ["Moved about 180 dispatchers and planners at four terminals onto a new TMS.", "Raised forecast accuracy from 61% to 74% with a Python model."] },
          ],
        },
      },
      { model: "openai/gpt-6-luna", status: "running" },
    ],
  },
  {
    id: "c-read" as Id<"comparisons">,
    task: "extract",
    narrativeTitle: "Kettle & Crane Brewing",
    narrativeVersion: 3,
    at: NOW - 12 * DAY,
    contenders: [
      {
        model: "deepseek/deepseek-v4.1-flash",
        reasoning: "high",
        status: "done",
        costUsd: 0.0049,
        seconds: 71.0,
        inputTokens: 9_870,
        outputTokens: 3_120,
        output: {
          roles: [
            { key: "r1", employer: "Kettle & Crane Brewing", title: "Production Planning Lead", start: "2017-03", end: "2020-01", location: "Milwaukee, WI" },
            { key: "r2", employer: "Kettle & Crane Brewing", title: "Packaging Line Supervisor", start: "2015-06", end: "2017-03", location: "Milwaukee, WI" },
          ],
          facts: [
            { roleKey: "r1", text: "Planned capacity for a second brewhouse that took output from 38,000 to 70,000 barrels." },
            { roleKey: "r1", text: "Started a weekly forecast shared with 22 distributors." },
            { roleKey: "r2", text: "Raised canning line efficiency from 58% to 81%." },
          ],
          context: [{ text: "Kettle & Crane is a regional craft brewery in Milwaukee." }],
        },
      },
      {
        model: "mistralai/mistral-medium-4",
        status: "failed",
        error: "The model’s reply wasn’t readable JSON.",
        output: { raw: '{"roles": [{"key": "r1", "employer": "Kettle & Crane Brewing", "title": "Production Planning Lead"' },
      },
    ],
  },
];

export function compareFixtures(): Answers {
  const comparisons = [...COMPARISONS];
  return {
    ...answer(api.narratives.list, () => STORIES),
    ...answer(api.compare.list, () =>
      comparisons.map((c) => ({ id: c.id, task: c.task, narrativeTitle: c.narrativeTitle, at: c.at, models: c.contenders.map((x) => x.model), running: c.contenders.some((x) => x.status === "running") })),
    ),
    ...answer(api.compare.get, ({ id }) => comparisons.find((c) => c.id === id) ?? null),
    ...answer(api.compare.estimate, ({ task }) => (task === "resume" ? { inputTokens: 18_400, outputTokens: 2_600 } : task === "insights" ? { inputTokens: 14_200, outputTokens: 700 } : { inputTokens: 9_870, outputTokens: 3_100 })),
    ...answer(api.compare.start, ({ task, narrativeId, contenders }) => {
      const id = `c-${comparisons.length}` as Id<"comparisons">;
      const read = STORIES.find((s) => s.id === narrativeId);
      comparisons.unshift({ id, task, narrativeTitle: read?.title ?? null, narrativeVersion: read?.version ?? null, at: Date.now(), contenders: contenders.map((c) => ({ ...c, status: "running" as const })) });
      return id;
    }),
  };
}
