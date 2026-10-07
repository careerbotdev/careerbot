import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { pursuitsFixtures } from "./fixtures";
import { Pursuits } from "./Pursuits";

// The Pursuits screen with fixture data, one story per board of the Pursuits page: a role not started (with its ⋯,
// Not for me and the filters open), the list's ⋯, a pursuit with its follow-up and the resume beside it, choosing a
// path, a pursuit contacted on the Outreach path, an outreach message gone quiet (follow up), the next contact after a
// follow-up, outreach to a company with no open role, a pursuit's Role tab (with and without an open role), answers
// with Ask, contacts with a message, adding a contact, a
// closed pursuit, and By direction. Clicks, J and K, Enter and Esc work as in the app; resize the window for medium
// (768 to 1279) and the phone (under 768).

function Fixture({ query, empty = false }: { query: string; empty?: boolean }) {
  const [answers] = useState(() => pursuitsFixtures({ empty }));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/pursuits" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Pursuits />
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

const meta = { title: "Screens/Pursuits", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
const role = "status=all&role=post-sc-demand&direction=dir-solutions";

export const Role: Story = { render: () => <Fixture query={role} /> };

export const RoleMenu: Story = {
  name: "Role ⋯",
  render: () => <Fixture query={role} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Solutions Consultant, Demand Planning" }));
  },
};

export const NotForMe: Story = {
  name: "Not for me",
  render: () => <Fixture query={role} />,
  play: async () => {
    await page().findByRole("heading", { name: "Solutions Consultant, Demand Planning" });
    await userEvent.keyboard("r");
  },
};

export const Filters: Story = {
  render: () => <Fixture query={role} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Filter" }));
  },
};

export const ListMenu: Story = {
  name: "List ⋯",
  render: () => <Fixture query={role} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Pursuits" }));
  },
};

export const Pursuit: Story = {
  name: "Pursuit, follow-up due",
  render: () => <Fixture query="status=pursuing&role=post-sc-coldchain" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Tailored resume" }));
  },
};

export const ChoosePath: Story = { name: "Choose a path", render: () => <Fixture query="status=pursuing&role=post-se-lumen" /> };

export const Contacted: Story = { name: "Contacted, Outreach path", render: () => <Fixture query="status=pursuing&role=post-planning-dir" /> };

export const OutreachFollowUp: Story = { name: "Outreach, follow-up due", render: () => <Fixture query="status=pursuing&role=post-fulfillment-head" /> };

export const NoOpenRole: Story = { name: "Outreach, no open role", render: () => <Fixture query="status=pursuing&pursuit=pur-outreach-copperline&tab=people" /> };

// A pursuit's Role tab: the role as it showed before it was started, its details beside (under it on smaller screens).
export const PursuitRole: Story = { name: "Pursuit, Role", render: () => <Fixture query="status=pursuing&role=post-pm-load&tab=role" /> };

// With no open role, the Role tab holds what the company does and the direction it's for.
export const NoOpenRoleRole: Story = { name: "Outreach, no open role, Role", render: () => <Fixture query="status=pursuing&pursuit=pur-outreach-copperline&tab=role" /> };

export const NextContact: Story = {
  name: "Next contact",
  render: () => <Fixture query="status=pursuing&role=post-planning-dir-2" />,
  play: async () => {
    await userEvent.click(await page().findByRole("tab", { name: /People/ }));
  },
};

export const AnswersAndAsk: Story = {
  name: "Answers and Ask",
  render: () => <Fixture query="status=pursuing&role=post-se-lumen" />,
  play: async () => {
    await userEvent.click(await page().findByRole("tab", { name: /Answers/ }));
    await userEvent.click(await page().findByRole("button", { name: "Ask about this role" }));
  },
};

export const People: Story = {
  render: () => <Fixture query="status=pursuing&role=post-pm-load" />,
  play: async () => {
    await userEvent.click(await page().findByRole("tab", { name: /People/ }));
    await userEvent.click(await page().findByRole("button", { name: /^Rafael Duarte/ }));
  },
};

export const AddContact: Story = {
  name: "Add a contact",
  render: () => <Fixture query="status=pursuing&role=post-pm-load" />,
  play: async () => {
    await userEvent.click(await page().findByRole("tab", { name: /People/ }));
    await userEvent.click(await page().findByRole("button", { name: "Add a contact" }));
  },
};

export const Closed: Story = { render: () => <Fixture query="status=closed&role=post-systems-dir" /> };

export const ByDirection: Story = { name: "By direction", render: () => <Fixture query="status=pursuing" /> };

export const NoDirections: Story = { name: "No directions yet", render: () => <Fixture query="status=all" empty /> };
