import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ShellProvider } from "../shell/ShellContext";
import { answer, StoryConvex, StoryRouter } from "../storyConvex";
import { Admin, type Costs, type LogEntry, type People } from "./Admin";

// careerbot.dev's Admin screen (Admin in Paper), large and on a phone: People (inviting someone, everyone with their
// status, last active and AI this month against their allowance; a person's ⋯ menu), Cost by step and Log; and with
// nobody yet. Every name, email and figure is made up.

const meta = {
  title: "Screens/Admin",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: "mobile2" } };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 13, 15);
const user = (n: number) => `user${n}` as Id<"users">;
const platform = (allowanceUsd = 5, override = false) => ({ source: "platform" as const, allowanceUsd, override });

const PEOPLE: People = [
  { key: "1", userId: user(1), name: "Priya Raman", email: "priya@raman.example", status: "active", invitedAt: NOW - 20 * DAY, expiresAt: null, link: null, lastActive: NOW - 2 * 3_600_000, spentUsd: 3.42, plan: platform() },
  { key: "2", userId: user(2), name: "Marcus Hale", email: "marcus.hale@example.com", status: "active", invitedAt: NOW - 18 * DAY, expiresAt: null, link: null, lastActive: NOW - DAY, spentUsd: 9.8, plan: platform(10, true) },
  { key: "3", userId: user(3), name: "Lena Okafor", email: "lena@okafor.example", status: "active", invitedAt: NOW - 16 * DAY, expiresAt: null, link: null, lastActive: NOW - 3 * DAY, spentUsd: 1.15, plan: { source: "own key", allowanceUsd: 5, override: false } },
  { key: "4", userId: user(4), name: "Tomás Ferreira", email: "tomas@ferreira.example", status: "suspended", invitedAt: NOW - 25 * DAY, expiresAt: null, link: null, lastActive: NOW - 9 * DAY, spentUsd: 0.4, plan: platform(0) },
  { key: "5", userId: null, name: null, email: "ana.silva@example.com", status: "invited", invitedAt: NOW - 2 * DAY, expiresAt: NOW + 12 * DAY, link: "/invite/abc", lastActive: null, spentUsd: null, plan: null },
  { key: "6", userId: null, name: null, email: "jordan.kim@example.com", status: "expired", invitedAt: NOW - 20 * DAY, expiresAt: NOW - 6 * DAY, link: null, lastActive: null, spentUsd: null, plan: null },
];

const COSTS: Costs = {
  month: Date.UTC(2026, 9, 1),
  person: { people: 4, medianUsd: 2.29, p95Usd: 9.8, totalUsd: 14.77 },
  steps: [
    { step: "write a resume", people: 4, medianUsd: 0.92, p95Usd: 3.1, totalUsd: 5.84 },
    { step: "read a story", people: 4, medianUsd: 0.61, p95Usd: 2.4, totalUsd: 4.02 },
    { step: "rank roles", people: 3, medianUsd: 0.48, p95Usd: 2.2, totalUsd: 3.11 },
    { step: "cover letter", people: 2, medianUsd: 0.45, p95Usd: 1.35, totalUsd: 1.8 },
  ],
};

const LOG: LogEntry[] = [
  { id: "l1", at: NOW - 3_600_000, action: "invited", email: "ana.silva@example.com", amountUsd: null, by: "Olive Operator" },
  { id: "l2", at: NOW - 5 * 3_600_000, action: "allowanceSet", email: "marcus.hale@example.com", amountUsd: 10, by: "Olive Operator" },
  { id: "l3", at: NOW - 2 * DAY, action: "suspended", email: "tomas@ferreira.example", amountUsd: null, by: "Olive Operator" },
  { id: "l4", at: NOW - 20 * DAY, action: "allowlistCarried", email: "priya@raman.example", amountUsd: null, by: null },
] as LogEntry[];

function Screen({ section = "people", empty = false }: { section?: string; empty?: boolean }) {
  const [answers] = useState(() => ({
    ...answer(api.adminPeople.people, () => (empty ? [] : PEOPLE)),
    ...answer(api.adminPeople.costByStep, () => (empty ? { ...COSTS, person: { people: 0, medianUsd: 0, p95Usd: 0, totalUsd: 0 }, steps: [] } : COSTS)),
    ...answer(api.adminPeople.log, () => (empty ? [] : LOG)),
    ...answer(api.adminPeople.invite, () => ({ link: "/invite/7f3a9c" })),
  }));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/admin" query={section ? `section=${section}` : ""}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <Admin />
          </div>
        </StoryRouter>
      </StoryConvex>
    </ShellProvider>
  );
}

export const PeopleSection: Story = { name: "People", render: () => <Screen /> };
export const PeoplePhone: Story = { name: "People, phone", globals: phone, render: () => <Screen /> };
export const Invited: Story = {
  name: "Invited someone",
  render: () => <Screen />,
  play: async () => {
    const page = within(document.body);
    await userEvent.type(await page.findByRole("textbox", { name: "Email" }), "sam.rivera@example.com");
    await userEvent.click(page.getByRole("button", { name: "Invite" }));
    await page.findByText(/^Invite link for/);
  },
};
export const CostSection: Story = { name: "Cost by step", render: () => <Screen section="cost" /> };
export const CostPhone: Story = { name: "Cost by step, phone", globals: phone, render: () => <Screen section="cost" /> };
export const LogSection: Story = { name: "Log", render: () => <Screen section="log" /> };
export const LogPhone: Story = { name: "Log, phone", globals: phone, render: () => <Screen section="log" /> };
export const Sections: Story = { name: "Sections, phone", globals: phone, render: () => <Screen section="" /> };
export const Empty: Story = { name: "Nobody yet", render: () => <Screen empty /> };
