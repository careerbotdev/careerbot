import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { RecordStory } from "../RecordStory";
import { SKILL_IDS, skillsFixture } from "./fixtures";
import { Skills } from "./Skills";

// The Skills screen with the fixture record: a near-duplicate to merge or keep apart, several selected for the bulk
// bar, an approved one being edited (PostgreSQL left out of resumes), one proposed one reviewed on its own (and
// rejected with why), the rejected tab, and a record with none yet. Clicks, J and K, A, E, R, M, X, Enter and Esc
// work as in the app; resize the window for medium (768 to 1279) and the phone (under 768).

function Fixture({ query, leftOut, empty }: { query?: string; leftOut?: string[]; empty?: boolean }) {
  const [{ answers }] = useState(() => skillsFixture({ leftOut, empty }));
  return (
    <RecordStory path="/record/skills" query={query} answers={answers}>
      <Skills kind="skill" />
    </RecordStory>
  );
}

const meta = { title: "Screens/Skills", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
// Checks a row from the keyboard, as X does.
const check = async (name: RegExp) => {
  (await page().findByRole("button", { name })).focus();
  await userEvent.keyboard("x");
};

export const Duplicate: Story = { name: "Looks like a duplicate", render: () => <Fixture query={`item=${SKILL_IDS.negotiationTwo}`} /> };

export const SeveralSelected: Story = {
  name: "Several selected",
  render: () => <Fixture />,
  play: async () => {
    await check(/^Route design/);
    await check(/^Inventory optimization/);
    await check(/^Capacity planning/);
  },
};

export const Review: Story = { name: "One at a time", render: () => <Fixture query={`item=${SKILL_IDS.recall}`} /> };

export const Reject: Story = {
  name: "Reject, with why",
  render: () => <Fixture query={`item=${SKILL_IDS.recall}`} />,
  play: async () => {
    await page().findByRole("heading", { name: "Lot traceability and recalls" });
    await userEvent.keyboard("r");
  },
};

export const Edit: Story = {
  name: "Approved, editing",
  render: () => <Fixture query={`tab=approved&item=${SKILL_IDS.sop}`} leftOut={[SKILL_IDS.postgres]} />,
  play: async () => {
    await page().findByRole("heading", { name: "Sales and operations planning" });
    await userEvent.keyboard("e");
  },
};

export const Approved: Story = { render: () => <Fixture query={`tab=approved&item=${SKILL_IDS.postgres}`} leftOut={[SKILL_IDS.postgres]} /> };

export const ItemMenu: Story = {
  name: "Skill ⋯",
  render: () => <Fixture query={`tab=approved&item=${SKILL_IDS.sop}`} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Sales and operations planning" }));
  },
};

export const Rejected: Story = { render: () => <Fixture query="tab=rejected" /> };

export const Empty: Story = { name: "None yet", render: () => <Fixture empty /> };
