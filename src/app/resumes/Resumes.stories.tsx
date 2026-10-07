import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { resumesFixtures } from "./fixtures";
import { factChangeAnswers } from "./factChangeFixtures";
import { Resumes } from "./Resumes";

// The Resumes screen with fixture data, one story per board of the Resumes page: the base resume, a line's Built on,
// Layout, Export, a direction resume changed since it was written, a tailored one with its posting, History, side by
// side, Add what's new, and lines resting on changed facts (offered Update lines, then the new lines to apply). Clicks,
// J and K and Esc work as in the app; resize the window for medium (768 to 1279) and the phone (under 768).

function Fixture({ query, facts, ...options }: { query: string; facts?: "stale" | "update" } & Parameters<typeof resumesFixtures>[0]) {
  const [answers] = useState(() => ({ ...resumesFixtures(options), ...(facts ? factChangeAnswers(facts) : {}) }));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/resumes" query={query}>
          <div className="-m-6 flex h-screen w-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Resumes />
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

const meta = { title: "Screens/Resumes", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);

export const Base: Story = { render: () => <Fixture query="resume=base" /> };

export const List: Story = { name: "List (phone)", render: () => <Fixture query="" /> };

export const LineBuiltOn: Story = {
  name: "Line, Built on",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await userEvent.hover(await page().findByText(/^Lead supply planning for 640 SKUs/));
    await userEvent.click(page().getAllByRole("button", { name: /Built on 1: show sources/ })[0]);
  },
};

export const Layout: Story = {
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Layout" }));
  },
};

export const Export: Story = {
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Export" }));
  },
};

export const EditContact: Story = {
  name: "Contact block",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Edit the contact block" }));
  },
};

export const Direction: Story = { name: "Direction, changed", render: () => <Fixture query="resume=dir-product" /> };

export const AddWhatsNew: Story = { name: "Add what’s new", render: () => <Fixture query="resume=dir-product" additions /> };

export const FactsChanged: Story = { name: "Facts changed", render: () => <Fixture query="resume=base" facts="stale" /> };

export const FactsChangedUpdate: Story = { name: "Facts changed, new lines", render: () => <Fixture query="resume=base" facts="update" /> };

export const SideBySide: Story = { name: "Side by side", render: () => <Fixture query="resume=dir-solutions&tab=update" /> };

export const History: Story = {
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "History" }));
    await userEvent.click(await page().findByRole("button", { name: /Sep 25/ }));
  },
};

export const Tailored: Story = { render: () => <Fixture query="resume=t-meridian" /> };

export const NotWritten: Story = { name: "Not written yet", render: () => <Fixture query="resume=dir-planning" /> };

export const NoContact: Story = { name: "No contact yet", render: () => <Fixture query="resume=base" noContact /> };

// Lines in their own words checked against their facts: one Supported, one going beyond with the words that do; the
// summary in their words not checked yet (hover it for Check against facts and its estimate).
export const CheckedLines: Story = { name: "Checked against facts", render: () => <Fixture query="resume=base" checked /> };

export const Empty: Story = { render: () => <Fixture query="tab=update" empty /> };
