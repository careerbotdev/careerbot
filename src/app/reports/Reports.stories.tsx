import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { ShellProvider } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { reportsFixtures } from "./fixtures";
import { Reports } from "./Reports";

// The Reports screen with fixture data, one story per board of the Reports page: each view this month, Search over all
// time, Outcomes over all time (with every kind of suggestion), Spending this quarter (the medium board), the list alone
// (the phone board), and a workspace with nothing yet.
// Clicks, the period switch, arrow keys within a chart and J/K in the list work as in the app; hover, focus or
// long-press any number for its explainer. Resize the window for medium (768 to 1279) and the phone (under 768).

function Fixture({ query, state = "full" }: { query: string; state?: "full" | "empty" | "loading" }) {
  const [answers] = useState(() => reportsFixtures(state));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/reports" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <Reports />
          </div>
        </StoryRouter>
      </StoryConvex>
    </ShellProvider>
  );
}

const meta = { title: "Screens/Reports", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = { render: () => <Fixture query="view=overview" /> };
export const Spending: Story = { render: () => <Fixture query="view=spending" /> };
export const SpendingThisQuarter: Story = { name: "Spending, this quarter", render: () => <Fixture query="view=spending&period=quarter" /> };
export const SearchAllTime: Story = { name: "Search, all time", render: () => <Fixture query="view=search&period=all" /> };
export const Outcomes: Story = { render: () => <Fixture query="view=outcomes" /> };
export const OutcomesAllTime: Story = { name: "Outcomes, all time", render: () => <Fixture query="view=outcomes&period=all" /> };
export const OutcomesNothingYet: Story = { name: "Outcomes, nothing yet", render: () => <Fixture query="view=outcomes" state="empty" /> };
export const Record: Story = { render: () => <Fixture query="view=record" /> };
export const Activity: Story = { render: () => <Fixture query="view=activity" /> };
export const List: Story = { name: "List (phone)", render: () => <Fixture query="" /> };
export const NothingYet: Story = { name: "Nothing yet", render: () => <Fixture query="view=spending" state="empty" /> };
export const Loading: Story = { render: () => <Fixture query="view=overview" state="loading" /> };
