import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { answer } from "../../storyConvex";
import { itemId, recordFixture, ROLE } from "../fixtures";
import { RecordStory } from "../RecordStory";
import { Breaks } from "./Breaks";

// The Breaks screen with the fixture record: the Jan – Jun 2015 break open (with its ⋯), adding a break, removing one
// (the Why? field, then removed with Undo), a record with a gap between two roles (and that gap being added), and an
// empty record. Clicks, J and K, B, E, Enter and Esc work as in the app; resize the window for medium (768 to 1279)
// and the phone (under 768).

type Item = Doc<"items">;

// The record, answering breaks.add and breaks.edit too. `gap`: Production Planning Lead at Kettle & Crane ends in
// Sep 2019, leaving Oct 2019 – Jan 2020 before Ironbridge.
function fixture({ empty = false, gap = false }: { empty?: boolean; gap?: boolean } = {}) {
  const fx = recordFixture({ empty });
  const { state } = fx;
  if (!empty) state.presentation = { ...state.presentation, roles: [...state.presentation.roles, { roleKey: ROLE.break2015, showReason: true }] };
  if (gap) state.items = state.items.map((i) => (i._id === itemId("role-kcPlan") && i.kind === "role" ? { ...i, data: { ...i.data, end: "2019-09" } } : i));
  return {
    ...fx.answers,
    ...answer(api.breaks.add, ({ start, end, reason }) => {
      const taken = new Set(state.items.map((i) => i.roleKey));
      let roleKey = `break-${start}`;
      for (let n = 2; taken.has(roleKey); n++) roleKey = `break-${start}-${n}`;
      const id = itemId(`role-${roleKey}`);
      const data = { key: roleKey, title: "Career break", break: true, start, end: end || null, ...(reason?.trim() ? { reason: reason.trim() } : {}) };
      state.items = [...state.items, { _id: id, _creationTime: Date.now(), workspaceId: "ws-owner", status: "approved", at: Date.now(), kind: "role", roleKey, data, sources: [] } as unknown as Item];
      return id;
    }),
    ...answer(api.breaks.edit, ({ id, start, end, reason }) => {
      state.items = state.items.map((i) => {
        if (i._id !== id || i.kind !== "role") return i;
        const { reason: _was, ...rest } = i.data;
        void _was;
        return { ...i, data: { ...rest, start, end: end || null, ...(reason?.trim() ? { reason: reason.trim() } : {}) } };
      });
    }),
  };
}

function Fixture({ query, empty, gap }: { query?: string; empty?: boolean; gap?: boolean }) {
  const [answers] = useState(() => fixture({ empty, gap }));
  return (
    <RecordStory path="/record/breaks" query={query} answers={answers}>
      <Breaks />
    </RecordStory>
  );
}

const meta = { title: "Screens/Breaks", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
const open = `break=${itemId("role-break")}`;

export const Break: Story = { render: () => <Fixture query={open} /> };

export const BreakMenu: Story = {
  name: "Break ⋯",
  render: () => <Fixture query={open} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Career break" }));
  },
};

export const AddABreak: Story = { name: "Add a break", render: () => <Fixture query="add=1" /> };

export const Remove: Story = {
  render: () => <Fixture query={open} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Remove" }));
  },
};

export const Removed: Story = {
  render: () => <Fixture query={open} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Remove" }));
    await userEvent.click(await page().findByRole("button", { name: /^2 Dates are wrong|Dates are wrong/ }));
    await userEvent.keyboard("{Enter}");
  },
};

export const Gap: Story = { name: "A gap between roles", render: () => <Fixture query={open} gap /> };

export const AddTheGap: Story = { name: "Adding the gap", render: () => <Fixture query="add=1&start=2019-10&end=2020-01" gap /> };

export const Empty: Story = { render: () => <Fixture empty /> };
