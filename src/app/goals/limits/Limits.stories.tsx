import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../../storyConvex";
import { limitsFixtures } from "./fixtures";
import { Limits } from "./Limits";

// The Limits screen with fixture data, one story per board of the Limits page: a limit open (Pay), editing a rule
// (Seniority for Supply Planning and Logistics Operations, Procurement added so it clashes), a stale rule (Companies),
// the list alone (the phone board), Add a limit, the limit's ⋯, a proposed limit and a rejected one. Clicks,
// J and K, E, R, Esc and ⌘↵ work as in the app; resize the window for medium (768 to 1279) and the phone (under 768).

function Fixture({ query }: { query: string }) {
  const [answers] = useState(limitsFixtures);
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/goals/limits" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Limits />
            </div>
            <Bar />
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

const meta = { title: "Screens/Limits", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);

export const Limit: Story = { render: () => <Fixture query="limit=lim-pay" /> };

export const EditingARule: Story = {
  name: "Editing a rule",
  render: () => <Fixture query="limit=lim-seniority-planning&edit=1" />,
  play: async () => {
    const field = await page().findByRole("combobox", { name: "Applies to" });
    await userEvent.click(field);
    await userEvent.type(field, "Procurement{Enter}{Escape}");
  },
};

export const StaleRule: Story = { name: "Stale rule", render: () => <Fixture query="limit=lim-companies" /> };

export const List: Story = { name: "List (phone)", render: () => <Fixture query="" /> };

export const AddALimit: Story = { name: "Add a limit", render: () => <Fixture query="add=1" /> };

export const LimitMenu: Story = {
  name: "Limit ⋯",
  render: () => <Fixture query="limit=lim-pay" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Pay" }));
  },
};

export const Proposed: Story = { render: () => <Fixture query="limit=lim-proposed" /> };

export const Rejected: Story = { render: () => <Fixture query="limit=lim-pivot" /> };
