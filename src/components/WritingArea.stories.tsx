import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { WritingArea } from "./WritingArea";

const meta = { title: "Components/WritingArea", component: WritingArea } satisfies Meta<typeof WritingArea>;
export default meta;
type Story = StoryObj<typeof meta>;

function Page({ title: startTitle, body: startBody }: { title: string; body: string }) {
  const [title, setTitle] = useState(startTitle);
  const [body, setBody] = useState(startBody);
  return (
    <div className="flex max-w-[600px] flex-col gap-4 border border-border bg-surface p-8">
      <WritingArea variant="title" aria-label="Title" placeholder="Employer or project" value={title} onChange={(e) => setTitle(e.target.value)} />
      <WritingArea aria-label="Story" placeholder="What happened here, in your own words." value={body} onChange={(e) => setBody(e.target.value)} />
    </div>
  );
}

// A story being written: the title, then the words, growing as they're written.
export const Writing: Story = {
  render: () => (
    <Page
      title="Brightwater Provisions"
      body={
        "Brightwater makes soups, broths and frozen meals, and my job is deciding what the two plants make each week.\n\nIn my first month I found three spreadsheets that each claimed to be the forecast. Picking one, and getting finance and sales to plan from it, took most of that first summer."
      }
    />
  ),
};

// Nothing written yet: the placeholders say what goes where.
export const Empty: Story = { render: () => <Page title="" body="" /> };
