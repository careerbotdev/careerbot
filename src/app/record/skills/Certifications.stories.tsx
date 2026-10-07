import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { RecordStory } from "../RecordStory";
import { SKILL_IDS, skillsFixture } from "./fixtures";
import { Skills } from "./Skills";

// The Certifications screen with the record's one certification: reviewed (with who issued it and no date yet), edited
// with its issuer and date, gathered again with nothing new, and the Approved tab still empty. Resize the window for
// medium (768 to 1279) and the phone (under 768).

function Fixture({ query }: { query?: string }) {
  const [{ answers }] = useState(() => skillsFixture());
  return (
    <RecordStory path="/record/certifications" query={query} answers={answers}>
      <Skills kind="certification" />
    </RecordStory>
  );
}

const meta = { title: "Screens/Certifications", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
const open = `item=${SKILL_IDS.cpim}`;

export const Review: Story = { render: () => <Fixture query={open} /> };

export const Edit: Story = {
  render: () => <Fixture query={open} />,
  play: async () => {
    await page().findByRole("heading", { name: "ASCM CPIM Certification" });
    await userEvent.keyboard("e");
  },
};

export const GatheredAgain: Story = {
  name: "Gathered again, nothing new",
  render: () => <Fixture query={open} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Gather again" }));
  },
};

export const ApprovedEmpty: Story = { name: "Approved, none yet", render: () => <Fixture query="tab=approved" /> };
