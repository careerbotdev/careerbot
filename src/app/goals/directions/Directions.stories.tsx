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
// being edited, the phone list rejecting a direction with a note, and a direction on the phone with its positioning to
// review. Clicks, J and K, A, E, R, T, "." and Esc work as in the app; resize the window for medium (768 to 1279) and the
// phone (under 768).

function Fixture({ query, merged }: { query: string; merged?: boolean }) {
  const [answers] = useState(() => directionsFixtures({ merged }));
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

// Find more like, on the Criteria: Search settings' for every direction, Loadstar Systems for this one only, and the
// same free search as Companies you like, adding for this direction only. "Tidew" brings two companies as it's typed.
export const CriteriaFindMoreLike: Story = {
  name: "Criteria, find more like a company",
  render: () => <Fixture query="direction=dir-product&tab=criteria" />,
  play: async ({ canvasElement }) => {
    const pane = firstPane(canvasElement);
    await userEvent.type(await pane.findByRole("combobox", { name: "Find more like a company, for Supply Chain Product" }), "Tidew");
    await pane.findByRole("option", { name: /Tidewell Systems/ });
  },
};

export const PhoneListReject: Story = {
  name: "Phone list, reject with a note",
  render: () => <Fixture query="list=proposed" />,
  play: async () => {
    fireEvent.contextMenu(await page().findByRole("button", { name: /Demand Planning/ }));
    // A sheet of buttons on the phone, a menu beside the pointer on wider screens.
    const reject = await page().findAllByText("Reject with a note");
    await userEvent.click(reject.at(-1)!);
  },
};

export const PhoneDirection: Story = { name: "Phone direction, positioning to review", render: () => <Fixture query="direction=dir-planning" /> };

// In Storybook's view with both themes, the light pane comes first; the menu and sheet open over the whole page.
const firstPane = (canvas: HTMLElement) => within(canvas.querySelector<HTMLElement>("[data-theme]") ?? canvas);

// ⋯ > Merge into…: the other approved directions, each with what it would gain, and what moves with it (a sheet on the phone).
const openMergeInto = async (canvas: HTMLElement) => {
  await userEvent.click(await firstPane(canvas).findByRole("button", { name: "More for Logistics Operations" }));
  await userEvent.click((await page().findAllByText("Merge into…")).at(-1)!);
  await page().findByText("Merge Logistics Operations into");
};

export const MergeInto: Story = {
  name: "Merge into",
  render: () => <Fixture query="direction=dir-logistics" />,
  play: async ({ canvasElement }) => openMergeInto(canvasElement),
};

// Merging at once, with Undo; its records still moving, so the kept direction says Merging… and waits to merge or rank.
export const Merging: Story = {
  name: "Merging, with Undo",
  render: () => <Fixture query="direction=dir-logistics" />,
  play: async ({ canvasElement }) => {
    await openMergeInto(canvasElement);
    // The submenu on wider screens, the sheet on a phone.
    const picker = page().queryAllByRole("menu").at(-1) ?? page().getByRole("dialog");
    await userEvent.click(within(picker).getByText("Supply Chain Product"));
    await page().findByText("Merged Logistics Operations into Supply Chain Product");
  },
};

// The merge done: the kept direction's roles ranked before the merge, with Rank again.
export const Merged: Story = { name: "Merged", render: () => <Fixture query="direction=dir-product" merged /> };

// Undo from the toast: the merged direction is back at once, and both say so while its records move back.
export const UndoingMerge: Story = {
  name: "Undoing the merge",
  render: () => <Fixture query="direction=dir-logistics" />,
  play: async ({ canvasElement }) => {
    await openMergeInto(canvasElement);
    const picker = page().queryAllByRole("menu").at(-1) ?? page().getByRole("dialog");
    await userEvent.click(within(picker).getByText("Supply Chain Product"));
    // The toast's own Undo, once the merge is done (on a phone the closing sheet still has Undo approval).
    const toast = (await page().findByText("Merged Logistics Operations into Supply Chain Product")).parentElement!;
    await userEvent.click(within(toast).getByRole("button", { name: /^Undo/ }));
    await firstPane(canvasElement).findAllByText("Undoing the merge…");
  },
};
