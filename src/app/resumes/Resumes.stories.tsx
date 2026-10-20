import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { resumesFixtures } from "./fixtures";
import { factChangeAnswers } from "./factChangeFixtures";
import { Resumes } from "./Resumes";

// The Resumes screen with fixture data, one story per board of the Resumes page: the base resume, a line's Built on,
// Layout, Export, a direction resume changed since it was written, a tailored one with its posting, History, side by
// side (the new version keeping a pin, a hidden line and an order), Add what's new, Add a line, moving a line, and
// lines resting on changed facts (offered Update lines, then the new lines to apply). Clicks, J and K and Esc work as
// in the app; resize the window for medium (768 to 1279) and the phone (under 768).

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
// The first theme's pane, where a play's clicks go when the themes show side by side.
const pane = () => within(document.querySelector<HTMLElement>("[data-theme]") ?? document.body);

export const Base: Story = { render: () => <Fixture query="resume=base" /> };

export const List: Story = { name: "List (phone)", render: () => <Fixture query="" /> };

export const LineBuiltOn: Story = {
  name: "Line, Built on",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    // Focus on the line shows its actions, as pointing at it does.
    const words = (await page().findByText(/^Lead supply planning for 640 SKUs/)).closest<HTMLElement>("[role=button]")!;
    words.focus();
    await userEvent.click(within(words.closest("li")!).getByRole("button", { name: /Built on 1: show sources/ }));
  },
};

export const Layout: Story = {
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Layout" }));
  },
};

// Layout on a resume that places a role differently from the record: the role row shows this resume's setting (used)
// beside the record's, with Use your record's; the resume is marked changed, naming the new placement.
export const LayoutPlacement: Story = {
  name: "Layout, placed here and in your record",
  globals: { viewport: { value: "desktop" } },
  render: () => <Fixture query="resume=base" placement />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Layout" }));
    await expect(await page().findByText("Fold, leave its lines out")).toBeVisible();
    await expect(page().getByText("Fold, keep its lines")).toBeVisible();
    await expect(page().getByRole("button", { name: "Use your record’s" })).toBeVisible();
  },
};

// The same on a phone, where Layout is in the resume's ⋯.
export const LayoutPlacementPhone: Story = {
  name: "Layout, placed here and in your record (phone)",
  globals: { viewport: { value: "mobile2" } },
  render: () => <Fixture query="resume=base" placement />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Base resume" }));
    await userEvent.click(await page().findByRole("button", { name: /^Layout/ }));
    await expect(await page().findByText("Fold, leave its lines out")).toBeVisible();
    await userEvent.click(page().getByRole("button", { name: "Use your record’s" }));
    await waitFor(() => expect(page().queryByRole("button", { name: "Use your record’s" })).toBeNull());
  },
};

// Built on a line, then Rewrite this fact…: the line as it reads here beside the fact in the record, and the comment.
export const RewriteFact: Story = {
  name: "Line, rewrite its fact",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    // Focus on the line shows its actions, as pointing at it does.
    const words = (await page().findByText(/^Lead supply planning for 640 SKUs/)).closest<HTMLElement>("[role=button]")!;
    words.focus();
    await userEvent.click(within(words.closest("li")!).getByRole("button", { name: /Built on 1: show sources/ }));
    await userEvent.click(await page().findByRole("button", { name: "Rewrite this fact…" }));
    await userEvent.type(await page().findByRole("textbox", { name: /Rewrite this fact/ }), "Lead with the $210 million");
    await waitFor(() => expect(page().getByRole("button", { name: /Ask for a rewrite/ })).toBeEnabled());
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

// Opens Layout or History: the header's button on wider screens, the ⋯ menu's item on a phone.
async function openPane(name: "Layout" | "History") {
  const more = await pane().findByRole("button", { name: /^More for/ });
  const button = pane().queryByRole("button", { name });
  if (button) return userEvent.click(button);
  await userEvent.click(more);
  // On a phone the menu is a sheet; its item is the last one with that name.
  await userEvent.click((await page().findAllByText(name, { selector: "button *, [role=menuitem] *, button, [role=menuitem]" })).at(-1)!);
}

// Write again with a note on what should change (Resumes — large, write again with guidance).
export const WriteAgainWithNote: Story = {
  name: "Write again with a note",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    const [button] = await pane().findAllByRole("button", { name: /^Write again/ });
    await userEvent.click(button);
    await userEvent.type(await pane().findByRole("textbox", { name: /What should change/ }), "Lead with the Palletwise launch and the forecast model");
  },
};

// History with the note each version was asked for, and Use again on older ones (Resumes — large, history with notes).
export const HistoryWithNotes: Story = {
  name: "History with notes",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await openPane("History");
  },
};

// Tailor again with a note (Resumes — small, tailor again with guidance, on a phone).
export const TailorAgainWithNote: Story = {
  name: "Tailor again with a note",
  render: () => <Fixture query="resume=t-meridian" />,
  play: async () => {
    const [button] = await pane().findAllByRole("button", { name: /^Tailor again/ });
    await userEvent.click(button);
  },
};

// Layout's Voice with the example from the record (Resumes — large, layout, voice).
export const LayoutVoice: Story = {
  name: "Layout, voice",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    await openPane("Layout");
    await pane().findByText("Example from your record");
  },
};

// The record's voice changed since they were written (Resumes — large, voice changed).
export const VoiceChanged: Story = { name: "Voice changed", render: () => <Fixture query="resume=base&tab=update" voiceChanged /> };
// Add a line under Brightwater Provisions: its approved facts not on the resume, the first with Add as written and
// Write it for this resume, and the note that one more line fills the page.
export const AddALine: Story = {
  name: "Add a line",
  render: () => <Fixture query="resume=base" length="one" extra={5} />,
  play: async () => {
    await userEvent.click(await pane().findByRole("button", { name: /Add a line/ }));
  },
};

export const LineAdded: Story = {
  name: "Add a line, added",
  render: () => <Fixture query="resume=base" length="one" extra={5} writing={["f13"]} />,
  play: async () => {
    await userEvent.click(await pane().findByRole("button", { name: /Add a line/ }));
    await userEvent.click(await page().findByRole("button", { name: /Add as written/ }));
  },
};

// A line's ⋯ menu: Edit, Pin, Hide, Move up and Move down.
export const MoveLine: Story = {
  name: "Move a line",
  render: () => <Fixture query="resume=base" />,
  play: async () => {
    // Focus on the line's words shows its actions, as pointing at it does.
    (await pane().findByRole("button", { name: /^Edit: Took finished-goods inventory/ })).focus();
    await userEvent.click(await pane().findByRole("button", { name: "More for this line" }));
  },
};

// Past its length: 17 lines on a one-page resume.
export const OverLength: Story = { name: "Past its length", render: () => <Fixture query="resume=base" length="one" extra={8} /> };
