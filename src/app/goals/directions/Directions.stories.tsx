import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fireEvent, userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../../storyConvex";
import { Directions } from "./Directions";
import { directionsFixtures } from "./fixtures";

// The Directions screen with fixture data from the fixture persona's record, one story per board of the Goals page: a
// direction (and its ⋯), its resume beside it, Tailor a resume with a posting pasted, a proposed direction, criteria
// being edited, the phone list rejecting a direction with why, and a direction on the phone with its positioning to
// review. Clicks, J and K, A, E, R, T, "." and Esc work as in the app; resize the window for medium (768 to 1279) and the
// phone (under 768).

function Fixture({ query }: { query: string }) {
  const [answers] = useState(directionsFixtures);
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/goals/directions" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Directions />
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

const meta = { title: "Screens/Directions", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);

export const Direction: Story = { render: () => <Fixture query="direction=dir-product" /> };

export const DirectionMenu: Story = {
  name: "Direction ⋯",
  render: () => <Fixture query="direction=dir-product" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Supply Chain Product" }));
  },
};

export const Resume: Story = { name: "Resume beside", render: () => <Fixture query="direction=dir-product&tab=criteria&pane=resume" /> };

export const Tailor: Story = {
  name: "Tailor a resume",
  render: () => <Fixture query="direction=dir-product&tab=titles&pane=tailor" />,
  play: async () => {
    const field = await page().findByRole("textbox", { name: "Posting" });
    await userEvent.click(field);
    await userEvent.paste("Senior Product Manager, Planning at Meridian Coldchain · Chicago\n\nABOUT THE TEAM\n\nMeridian Coldchain’s planning team builds the tools that keep temperature-controlled freight on schedule.");
  },
};

export const Proposed: Story = { name: "Proposed direction", render: () => <Fixture query="list=proposed&direction=dir-network" /> };

export const CriteriaEditing: Story = {
  name: "Criteria, editing",
  render: () => <Fixture query="direction=dir-planning&tab=criteria" />,
  play: async () => {
    // The criteria's own Edit (on a phone the bar has one too, for the part under review).
    const criteria = await page().findByRole("region", { name: "Criteria" });
    await userEvent.click(within(criteria).getByRole("button", { name: "Edit" }));
  },
};

export const PhoneListReject: Story = {
  name: "Phone list, reject with why",
  render: () => <Fixture query="list=proposed" />,
  play: async () => {
    fireEvent.contextMenu(await page().findByRole("button", { name: /Demand Planning/ }));
    // A sheet of buttons on the phone, a menu beside the pointer on wider screens.
    const reject = await page().findAllByText("Reject");
    await userEvent.click(reject.at(-1)!);
  },
};

export const PhoneDirection: Story = { name: "Phone direction, positioning to review", render: () => <Fixture query="direction=dir-planning" /> };
