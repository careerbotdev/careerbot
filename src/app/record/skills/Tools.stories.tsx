import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { RecordStory } from "../RecordStory";
import { SKILL_IDS, skillsFixture } from "./fixtures";
import { Skills } from "./Skills";

// The Tools screen with the fixture record: Samsara reviewed while a gathering runs (Postmark left out while
// Quotewell is rejected, a vague ERP flagged), an approved tool with a resume open beside it, and the last gathering
// failed. Resize the window for medium (768 to 1279) and the phone (under 768).

function Fixture({ query, gathering }: { query?: string; gathering?: "running" | "failed" }) {
  const [{ answers }] = useState(() => skillsFixture({ gathering }));
  return (
    <RecordStory path="/record/tools" query={query} answers={answers}>
      <Skills kind="tool" />
    </RecordStory>
  );
}

const meta = { title: "Screens/Tools", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);

export const Review: Story = { name: "Review while gathering", render: () => <Fixture query={`item=${SKILL_IDS.samsara}`} gathering="running" /> };

export const ResumeBeside: Story = {
  name: "Approved, a resume beside it",
  render: () => <Fixture query={`tab=approved&item=${SKILL_IDS.netsuite}`} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Base resume" }));
  },
};

export const Failed: Story = { name: "Gathering failed", render: () => <Fixture gathering="failed" /> };

export const LeftOut: Story = { name: "Left out while its project is rejected", render: () => <Fixture query={`item=${SKILL_IDS.postmark}`} /> };
