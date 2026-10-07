import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { goalsFixtures } from "./fixtures";
import { Goals } from "./Goals";

// The Goals screen with fixture data, one story per board of the Goals page: the goals story (hover a paragraph for
// what it produced), what it produced, a read under way, an earlier version, editing, and no goals yet. Resize the
// window for medium (768 to 1279) and the phone (under 768), where the versions are a third tab.

function Fixture({ query = "", empty = false, reading = false }: { query?: string; empty?: boolean; reading?: boolean }) {
  const [answers] = useState(() => goalsFixtures({ empty, reading }));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/goals" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Goals />
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

const meta = { title: "Screens/Goals", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);

export const GoalsStory: Story = { name: "Goals story", render: () => <Fixture /> };

export const Produced: Story = { name: "What it produced", render: () => <Fixture query="tab=produced" /> };

export const Reading: Story = { render: () => <Fixture reading /> };

export const EarlierVersion: Story = { name: "Earlier version", render: () => <Fixture query="version=2" /> };

export const Editing: Story = {
  render: () => <Fixture />,
  play: async () => {
    await page().findAllByRole("heading", { name: "Goals" });
    await userEvent.keyboard("e");
  },
};

export const NoGoals: Story = { name: "No goals yet", render: () => <Fixture empty /> };
