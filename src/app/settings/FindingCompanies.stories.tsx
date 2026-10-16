import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import type { Finding } from "../../../convex/findCompanies";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider } from "../shell/ShellContext";
import { answer, StoryConvex } from "../storyConvex";
import { FindingCompanies } from "./FindingCompanies";
import { Rows, SettingsPane } from "./ui";

// Finding companies (the Finding companies boards' Settings row), on its own until its Settings section is settled:
// with an Apollo key and Apollo + AI chosen, and without one, where only AI only can be chosen and the Apollo ways say
// why. Choosing a way changes the fixture as the real mutation would. Resize the window for the phone.

function Fixture({ apolloKey, braveKey = true, finding, firstSearch = false }: { apolloKey: boolean; braveKey?: boolean; finding: Finding; firstSearch?: boolean }) {
  const [answers] = useState(() => {
    let choice: Finding = finding;
    return {
      ...answer(api.findCompanies.settings, () => ({ choice, finding: apolloKey ? choice : "web", apolloKey, braveKey })),
      ...answer(api.findCompanies.set, ({ finding: next }) => {
        choice = next;
      }),
      ...answer(api.estimates.costs, () => ({ findRelevant: firstSearch ? null : 0.031, findHiringNow: firstSearch ? null : 0.017 }) as never),
    };
  });
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <Pane />
      </StoryConvex>
    </ShellProvider>
  );
}

function Pane() {
  const size = useScreenSize();
  return (
    <SettingsPane title="Companies" size={size}>
      <Rows>
        <FindingCompanies />
      </Rows>
    </SettingsPane>
  );
}

const meta = { title: "Screens/Settings/Finding companies", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ApolloKey: Story = { name: "Apollo key", render: () => <Fixture apolloKey finding="apolloWeb" /> };
export const ApolloKeyExplained: Story = {
  name: "Apollo key, Apollo + AI explained",
  render: () => <Fixture apolloKey finding="apolloWeb" />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(await within(canvasElement).findByRole("radio", { name: "Apollo + AI" }));
  },
};
export const NoApolloKey: Story = {
  name: "No Apollo key",
  render: () => <Fixture apolloKey={false} finding="apollo" />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(await within(canvasElement).findByRole("radio", { name: "Apollo" }));
  },
};
export const NoKeysFirstSearch: Story = { name: "No Apollo or Brave key, before the first search", render: () => <Fixture apolloKey={false} braveKey={false} finding="web" firstSearch /> };
