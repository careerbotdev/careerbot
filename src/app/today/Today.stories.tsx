import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { getFunctionName } from "convex/server";
import { expect, userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { pursuitsFixtures } from "../pursuits/fixtures";
import { settingsFixtures } from "../settings/fixtures";
import { updateFixtures } from "../settings/updateFixtures";
import { DemoBanner } from "../shell/DemoBanner";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { WhatsNew } from "../shell/WhatsNew";
import { DEMO_REFUSAL } from "../site/words";
import { type Answers, answer, StoryConvex, StoryRouter } from "../storyConvex";
import type { Setup } from "./GettingStarted";
import { Today } from "./Today";
import type { TodayRole } from "./data";

// Today with fixture data, Getting started put away: Review waiting, pursuits with a reminder or an offer, new strong
// roles and a resume to update; the line chosen opens beside the list (on a phone, the list alone until a line is
// opened). Pursuits and roles are the Pursuits screen's fixtures, so the two screens show the same search. In the
// demo, the same Today and the same person (the fixtures' Wren Castellano, named by the banner too) under the demo's
// banner, where an action (Interested) shows the refusal and changes nothing. On a self-hosted copy, its owner's line
// that a new version is out; and after an update, What's new (the Releases boards).

const done = (detail: string | null = null) => ({ done: true, detail, at: null });
const SETUP: Setup = {
  workspaceId: "ws",
  hidden: true,
  storyUsdPerWord: 0.00002,
  firstStory: null,
  skipped: ["drive"],
  steps: {
    signIn: done("wren@example.com"),
    key: done("Key added · $20 a month"),
    story: done("Career story"),
    review: done("42 facts approved"),
    goals: done("3 directions · 4 limits"),
    resume: done("Written"),
    apollo: done("Key added · 400 credits a month"),
    companies: done("Roles ranked"),
    drive: done("Skipped"),
  },
  firstPursuit: null,
};

function todayFixtures({ empty }: { empty: boolean }): Answers {
  const pursuits = pursuitsFixtures({ empty });
  const settings = settingsFixtures();
  // New strong roles: the ranked roles that are strong fits and not started, best first.
  const ranked = pursuits[getFunctionName(api.roles.list)] as (args: object) => { page: TodayRole[] };
  const roles = () => ranked({ filters: {} }).page.filter((r) => r.level === "strong" && !r.pursuit);
  return {
    ...settings,
    ...pursuits,
    ...answer(api.today.setup, () => SETUP),
    ...answer(api.today.roles, () => (empty ? [] : roles())),
    ...answer(api.today.hideSetup, () => undefined),
    ...answer(api.review.summary, () =>
      empty
        ? { total: 0, groups: [] }
        : {
            total: 5,
            groups: [
              { kind: "facts" as const, label: "Facts", count: 3, preview: "From your career story", unlocks: true },
              { kind: "questions" as const, label: "Questions", count: 2, preview: "About your last role", unlocks: false },
            ],
          },
    ),
    ...answer(api.resume.updates, () => (empty ? [] : [{ target: { name: "Base resume", href: "/resumes?resume=base" }, state: "changed" as const, writing: false, summary: null }])),
    ...answer(api.factChanges.documents, () => []),
    ...answer(api.activity.list, () => []),
  };
}

// The fixtures' person (settings/fixtures.ts), whose search Today shows.
const PERSON = "Wren Castellano";

function Fixture({ query = "", empty = false, demo = false, newVersion = false, updated = false }: { query?: string; empty?: boolean; demo?: boolean; newVersion?: boolean; updated?: boolean }) {
  const [answers] = useState(() => ({
    ...todayFixtures({ empty }),
    ...(newVersion ? updateFixtures("out") : {}),
    ...(updated ? answer(api.updates.sawVersion, () => true) : {}),
    ...(demo ? answer(api.workspaces.current, () => ({ id: "ws" as never, name: PERSON, demo: true, asOf: null })) : {}),
  }));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            {demo && <DemoBanner person={PERSON} onLeave={() => {}} />}
            <div className="flex min-h-0 flex-1 flex-col">
              <Today />
            </div>
            <Bar />
            {updated && <WhatsNew version="0.8.0" />}
          </div>
        </StoryRouter>
      </StoryConvex>
    </ShellProvider>
  );
}

function Bar() {
  const small = useScreenSize() === "small";
  const { bar } = useShellState();
  return small && bar ? <BottomBar mode={bar} /> : null;
}

const meta = { title: "Screens/Today", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Lines: Story = { render: () => <Fixture /> };
export const NothingNeedsYou: Story = { name: "Nothing needs you", render: () => <Fixture empty /> };
export const NewVersion: Story = { name: "A new version, for a self-hosted copy's owner", render: () => <Fixture newVersion /> };
export const WhatsNewAfterAnUpdate: Story = { name: "What's new, after an update", render: () => <Fixture updated /> };

export const InTheDemo: Story = { name: "In the demo", render: () => <Fixture demo /> };
export const InTheDemoPhone: Story = { name: "In the demo, phone", globals: { viewport: { value: "mobile2" } }, render: () => <Fixture demo /> };
export const InTheDemoRefused: Story = {
  name: "In the demo, an action refused",
  render: () => <Fixture demo />,
  play: async () => {
    const page = within(document.body);
    const [interested] = await page.findAllByRole("button", { name: /^Interested/ });
    await userEvent.click(interested);
    const status = page.getByRole("status");
    await expect(await within(status).findByText(DEMO_REFUSAL.message)).toBeVisible();
    // The screen's own failure, a moment later, doesn't replace it.
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 300);
    await promise;
    await expect(within(status).getByText(DEMO_REFUSAL.message)).toBeVisible();
  },
};
