import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type FunctionReference, getFunctionName } from "convex/server";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { answer, type Answers } from "../../storyConvex";
import { itemId, NOW, recordFixture, type RecordState } from "../fixtures";
import { RecordStory } from "../RecordStory";
import { Projects } from "./Projects";

// The Projects screen with the fixture record, one story per board of the Projects section: a project open (with its
// ⋯), editing one, the rejected Quotewell with what was set aside, the GitHub connection (repositories in every state,
// Disconnect asking first, not connected), and coming back from GitHub. Clicks, J and K, E, R, U and Esc work as in the
// app; resize for medium (768 to 1279) and the phone (under 768).

type Item = Doc<"items">;
type Repo = { fullName: string; name: string; description: string | null; private: boolean; url: string; pushedAt: string | null; fork: boolean; archived: boolean };

const REPOS: [string, string][] = [
  ["lanebook", "Lane-by-lane freight rate benchmark from public tender data"],
  ["brewlog", "Fermentation monitor for homebrewers on a Raspberry Pi"],
  ["stoopsale", "Neighborhood yard-sale map with a Saturday route planner"],
  ["palletwise", "Packs mixed pallets into a trailer and draws the load in 3D"],
  ["shelfspan", "Expiry-date tracker that texts food-pantry volunteers"],
  ["ridgeline", "Android day-hike planner built around weather windows"],
  ["quotewell", "Lines up carrier quote emails in one rate table"],
];
const repos = (): Repo[] =>
  REPOS.map(([name, description], i) => ({
    fullName: `wrencastellano/${name}`,
    name,
    description,
    private: true,
    url: `https://github.com/wrencastellano/${name}`,
    pushedAt: new Date(NOW - i * 86_400_000).toISOString(),
    fork: false,
    archived: false,
  }));

// What this screen's saves, reads and decisions do to the fixtures, as the real mutations do (simplified).
function projectAnswers(state: RecordState, base: Answers): Answers {
  const patch = (id: string, change: (i: Item) => Item) => {
    state.items = state.items.map((i) => (i._id === id ? change(i) : i));
  };
  const keyOf = (id: string) => state.items.find((i) => i._id === id)?.projectKey;
  const baseReview = base[getFunctionName(api.extract.review as FunctionReference<"mutation">)] as (args: unknown) => unknown;
  return {
    ...answer(api.github.repos, () => repos()),
    ...answer(api.github.connect, () => "#"),
    ...answer(api.github.disconnect, () => {
      state.github = { ...state.github, connected: null };
    }),
    ...answer(api.projects.read, ({ repos: names }) => {
      state.jobs = [...names.map((repo) => ({ kind: "project" as const, args: { repo }, status: "queued" as const })), ...state.jobs];
      return names.length;
    }),
    ...answer(api.projects.link, ({ id, roleKey }) => patch(id, (i) => ({ ...i, roleKey: roleKey ?? undefined }))),
    ...answer(api.projects.edit, ({ id, name, summary, start, end }) =>
      patch(id, (i) =>
        i.kind === "project"
          ? { ...i, status: "approved", data: { ...i.data, edited: true, ...(name?.trim() ? { name: name.trim() } : {}), summary: summary?.trim() || undefined, start: start?.trim() || null, end: end?.trim() || null } }
          : i,
      ),
    ),
    ...answer(api.projects.setAside, ({ id }) => {
      const key = keyOf(id);
      return state.items.flatMap((f) => (f.kind === "fact" && f.status === "setAside" && f.projectKey === key ? [{ id: f._id, text: f.data.text }] : []));
    }),
    ...answer(api.sameWork.start, ({ id }) => {
      state.jobs = [{ kind: "sameWork", args: { projectKey: keyOf(id) }, status: "running" }, ...state.jobs];
      return `job-${state.jobs.length}` as Id<"jobs">;
    }),
    ...answer(api.sources.readAgain, ({ source }) => {
      const p = "projectId" in source ? state.items.find((i) => i._id === source.projectId) : undefined;
      if (p?.kind === "project") state.jobs = [{ kind: "project", args: { repo: p.data.repo }, status: "running" }, ...state.jobs];
      return `job-${state.jobs.length}` as Id<"jobs">;
    }),
    // Rejecting a project sets its unreviewed facts aside; restoring it brings them back.
    ...answer(api.extract.review, (args) => {
      const item = state.items.find((i) => i._id === args.id);
      if (item?.kind === "project" && args.status === "rejected")
        state.items = state.items.map((i) => (i.kind === "fact" && i.projectKey === item.projectKey && i.status === "proposed" ? { ...i, status: "setAside" } : i));
      if (item?.kind === "project" && item.status === "rejected" && args.status === "proposed")
        state.items = state.items.map((i) => (i.kind === "fact" && i.projectKey === item.projectKey && i.status === "setAside" ? { ...i, status: "proposed" } : i));
      baseReview(args);
    }),
  };
}

// The boards' record: Quotewell's five set-aside facts; for the GitHub boards, a read going, one failed and one paused.
function boardState(state: RecordState, { github = false, connected = true }: { github?: boolean; connected?: boolean }) {
  const quotewell = state.items.find((i) => i._id === itemId("f-quotewell-parse"));
  if (quotewell?.kind === "fact")
    state.items.push(
      ...[
        "Matched each quote to its lane by origin and destination ZIP, so a reply to an old thread still lands on the right row.",
        "Flagged quotes whose fuel surcharge was missing or older than the week’s diesel index.",
        "Took Quotewell from an empty repository to a working inbox in a weekend: parser, SQLite store and a comparison page.",
        "Wrote the forwarding address setup so a planner can send quotes in without sharing their mailbox.",
      ].map((text, n): Item => ({ ...quotewell, _id: itemId(`f-quotewell-${n}`), data: { ...quotewell.data, text } })),
    );
  if (github)
    state.jobs = [
      { kind: "project", args: { repo: "wrencastellano/lanebook" }, status: "running" },
      { kind: "project", args: { repo: "wrencastellano/shelfspan" }, status: "failed", error: "GitHub stopped responding. Select to retry." },
      { kind: "project", args: { repo: "wrencastellano/ridgeline" }, status: "paused" },
      ...state.jobs,
    ];
  if (!connected) state.github = { ...state.github, connected: null };
}

function Fixture({ query, github, connected, empty = false }: { query: string; github?: boolean; connected?: boolean; empty?: boolean }) {
  const [answers] = useState(() => {
    const fx = recordFixture({ empty });
    if (!empty) boardState(fx.state, { github, connected });
    return { ...fx.answers, ...projectAnswers(fx.state, fx.answers) };
  });
  return (
    <RecordStory path="/record/projects" query={query} answers={answers}>
      <Projects />
    </RecordStory>
  );
}

const meta = { title: "Screens/Projects", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
const palletwise = `project=${itemId("p-palletwise")}`;

export const Project: Story = { render: () => <Fixture query={palletwise} /> };

export const ProjectMenu: Story = {
  name: "Project ⋯",
  render: () => <Fixture query={palletwise} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Palletwise" }));
  },
};

export const Edit: Story = {
  name: "Edit",
  render: () => <Fixture query={`project=${itemId("p-brewlog")}`} />,
  play: async () => {
    await page().findByRole("heading", { name: "Brewlog" });
    await userEvent.keyboard("e");
  },
};

export const Reject: Story = {
  name: "Reject, why",
  render: () => <Fixture query={`project=${itemId("p-shelfspan")}`} />,
  play: async () => {
    await page().findByRole("heading", { name: "Shelfspan" });
    await userEvent.keyboard("r");
  },
};

export const Rejected: Story = { render: () => <Fixture query={`tab=rejected&project=${itemId("p-quotewell")}`} /> };

export const GitHub: Story = {
  render: () => <Fixture query="github=1" github />,
  play: async () => {
    await userEvent.click(await page().findByRole("checkbox", { name: "wrencastellano/brewlog" }));
    await userEvent.click(await page().findByRole("checkbox", { name: "wrencastellano/stoopsale" }));
  },
};

export const GitHubDisconnect: Story = {
  name: "GitHub, disconnect",
  render: () => <Fixture query="github=1" github />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Disconnect" }));
  },
};

export const GitHubNotConnected: Story = { name: "GitHub, not connected", render: () => <Fixture query="github=1" connected={false} /> };

export const BackFromGitHub: Story = { name: "Back from GitHub", render: () => <Fixture query="github=connected" github /> };

export const List: Story = { render: () => <Fixture query="" /> };

export const Empty: Story = { name: "No projects yet", render: () => <Fixture query="" empty /> };
