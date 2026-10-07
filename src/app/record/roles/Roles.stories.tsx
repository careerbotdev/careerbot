import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { answer } from "../../storyConvex";
import { IDS, itemId, NOW, recordFixture, type RecordState, ROLE } from "../fixtures";
import { RecordStory } from "../RecordStory";
import { Roles } from "./Roles";

// Roles with the fixture record, one story per board of the Roles section of the Record page: a role, a fact's sources
// beside it (a drawer on medium screens, full screen on a phone), same work and duplicates, the Context tab with the
// role's ⋯, the rejected role with the list's ⋯, a disagreement with the details edited in place, two jobs that
// overlap, a role with no official title, the timeline, adding a role and a new workspace. Clicks, J and K, Enter and
// Esc work as in the app; resize for medium and the phone.

type Item = Doc<"items">;

// What the Roles screen asks beyond the shared record answers, acting on the same state.
function rolesAnswers(state: RecordState) {
  const patch = (id: string, change: (i: Item) => Item) => {
    state.items = state.items.map((i) => (i._id === id ? change(i) : i));
  };
  const ws = state.items[0]?.workspaceId ?? ("ws-owner" as Id<"workspaces">);
  return {
    ...answer(api.extract.addRole, ({ employer, title, alternateTitles, location, start, end }) => {
      const roleKey = `${employer}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const id = itemId(`role-${roleKey}`);
      state.items = [...state.items, { _id: id, _creationTime: Date.now(), workspaceId: ws, kind: "role", status: "approved", roleKey, data: { key: roleKey, employer, title, alternateTitles, location: location || null, start: start || null, end: end || null, edited: true }, sources: [], at: Date.now() }];
      return id;
    }),
    ...answer(api.extract.editRole, ({ id, ...fields }) =>
      patch(id, (i) => {
        if (i.kind !== "role") return i;
        const data = { ...i.data, edited: true, marketTitle: null };
        for (const [k, v] of Object.entries(fields)) if (v !== undefined) Object.assign(data, { [k]: Array.isArray(v) ? v : v.trim() || (k === "employer" || k === "title" ? undefined : null) });
        if (data.change === "none") data.change = null;
        return { ...i, status: "approved", data };
      }),
    ),
    ...answer(api.extract.removeRole, ({ id }) => {
      const role = state.items.find((i) => i._id === id);
      const gone = (i: Item) => i._id === id || (i.roleKey === role?.roleKey && !i.projectKey && (i.kind === "context" || i.kind === "conflict" || (i.kind === "fact" && i.status !== "rejected")));
      const facts = state.items.filter((i) => i.kind === "fact" && gone(i)).length;
      state.items = state.items.filter((i) => !gone(i)).map((i) => (i.kind === "project" && i.roleKey === role?.roleKey ? { ...i, roleKey: undefined } : i));
      return { facts };
    }),
    ...answer(api.extract.addContext, ({ roleKey, text, factId }) => {
      const id = itemId(`c-added-${state.items.length}`);
      state.items = [...state.items, { _id: id, _creationTime: Date.now(), workspaceId: ws, kind: "context", status: "approved", roleKey, data: { text: text.trim(), from: "your note", ...(factId ? { factId } : {}) }, sources: [], at: Date.now() }];
      return id;
    }),
    ...answer(api.conflicts.answer, ({ id, pick, value, field: fixing }) => {
      const c = state.items.find((i) => i._id === id);
      if (c?.kind !== "conflict") return;
      const next = pick === "narrative" ? c.data.narrativeValue : pick === "other" ? value : undefined;
      const o = c.data.overlap;
      const target = o ? (fixing ? { roleKey: fixing === "end" ? o.ends.roleKey : o.starts.roleKey, field: fixing } : null) : c.roleKey && c.data.field ? { roleKey: c.roleKey, field: c.data.field } : null;
      patch(id, () => ({ ...c, status: "approved", data: { ...c.data, answer: { pick, value: next ?? null, field: o ? fixing : undefined, at: Date.now() } } }));
      if (next && target)
        state.items = state.items.map((r) =>
          r.kind === "role" && r.roleKey === target.roleKey && r.status === "approved" ? { ...r, data: { ...r.data, [target.field]: next, history: [...(r.data.history ?? []), { field: target.field, from: r.data[target.field] ?? null, to: next, how: "answer" as const, at: Date.now() }] } } : r,
        );
    }),
    ...answer(api.conflicts.reopen, ({ id }) => patch(id, (c) => (c.kind === "conflict" ? { ...c, status: "proposed", data: { ...c.data, answer: undefined } } : c))),
    ...answer(api.conflicts.start, () => {
      state.jobs = [{ kind: "check", args: {}, status: "running" }, ...state.jobs];
      return "job-check" as Id<"jobs">;
    }),
    ...answer(api.duplicates.start, () => {
      state.jobs = [{ kind: "duplicates", args: {}, status: "running" }, ...state.jobs];
      return "job-duplicates" as Id<"jobs">;
    }),
    ...answer(api.sameWork.start, ({ id }) => {
      const p = state.items.find((i) => i._id === id);
      state.jobs = [{ kind: "sameWork", args: { projectKey: p?.projectKey }, status: "running" }, ...state.jobs];
      return "job-same-work" as Id<"jobs">;
    }),
    ...answer(api.sources.readAgain, ({ source }) => {
      if ("narrativeId" in source) state.jobs = [{ kind: "extract", args: { narrativeId: source.narrativeId, again: true }, status: "running" }, ...state.jobs];
      return "job-read" as Id<"jobs">;
    }),
    ...answer(api.projects.link, ({ id, roleKey }) => patch(id, (p) => ({ ...p, roleKey: roleKey ?? undefined }))),
    ...answer(api.resume.showsFact, ({ id }) => (state.items.find((i) => i._id === id)?.status === "approved" ? [{ key: "base", directionId: null, name: "Base resume" }] : [])),
  };
}

// `extra`: items added to the fixture record for one story.
function Fixture({ query, empty = false, extra = [] }: { query?: string; empty?: boolean; extra?: Item[] }) {
  const [answers] = useState(() => {
    const fx = recordFixture({ empty });
    fx.state.items = [...fx.state.items, ...extra];
    return { ...fx.answers, ...rolesAnswers(fx.state) };
  });
  return (
    <RecordStory path="/record/roles" query={query} answers={answers}>
      <Roles />
    </RecordStory>
  );
}

const meta = { title: "Screens/Roles", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);
// Once the role and its notes have loaded, so a menu opened next stays open.
const settled = async () => {
  await waitFor(() => expect([...document.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Add a note"))).toBe(true), { timeout: 10_000 });
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 300);
  await promise;
};
const bw = `role=${itemId("role-bw")}`;
const palletwiseFact = `${bw}&fact=${IDS.sameWorkRole}`;

export const Role: Story = { render: () => <Fixture query={bw} /> };

export const FactSources: Story = { name: "Fact sources", render: () => <Fixture query={palletwiseFact} /> };

export const SameWorkAndDuplicates: Story = { name: "Same work and duplicates", render: () => <Fixture query={`role=${ROLE.ib}`} /> };

export const ContextAndMenu: Story = {
  name: "Context and ⋯",
  render: () => <Fixture query={bw} />,
  play: async () => {
    await settled();
    await userEvent.click(await page().findByRole("tab", { name: /Context/ }));
    await userEvent.click(await page().findByRole("button", { name: "More for Senior Supply Planning Manager" }));
  },
};

export const RejectedAndListMenu: Story = {
  name: "Rejected and list ⋯",
  render: () => <Fixture query={`view=rejected&role=${IDS.rejectedRole}`} />,
  play: async () => {
    await settled();
    await userEvent.click(await page().findByRole("button", { name: "More for Roles" }));
  },
};

export const EditingAndDisagreement: Story = {
  name: "Editing and disagreement",
  render: () => <Fixture query={`role=${itemId("role-ib")}`} />,
  play: async () => {
    await settled();
    await userEvent.click(await page().findByRole("button", { name: "More for Network Operations Manager" }));
    await userEvent.click(await page().findByRole("menuitem", { name: "Edit details" }));
  },
};

// Two jobs whose dates overlap (volunteer work beside a job): Both are right, or one of the dates is wrong.
const overlap: Item = {
  _id: itemId("q-overlap"),
  _creationTime: NOW,
  workspaceId: "ws-owner" as Id<"workspaces">,
  kind: "conflict",
  status: "proposed",
  roleKey: ROLE.ib,
  data: {
    field: null,
    recordSays: "Feb 2020 – Apr 2023",
    narrativeSays: "Sep 2021 – Mar 2023",
    question: "Your Ironbridge Logistics job ends Apr 2023 but your Three Rivers Pantry Network job starts Sep 2021. Which is right?",
    overlap: { ends: { roleKey: ROLE.ib, employer: "Ironbridge Logistics" }, starts: { roleKey: ROLE.pantry, employer: "Three Rivers Pantry Network" } },
  },
  sources: [],
  at: NOW,
};
export const OverlappingJobs: Story = { name: "Jobs that overlap", render: () => <Fixture query={`role=${itemId("role-pantry")}`} extra={[overlap]} /> };

// A role read from a story that never says what the job was officially called: it goes on resumes under what they
// call it, and the role says so until they give the official title.
const untitled: Item = {
  _id: itemId("role-weekend"),
  _creationTime: NOW,
  workspaceId: "ws-owner" as Id<"workspaces">,
  kind: "role",
  status: "proposed",
  roleKey: "northline-weekend-dispatch",
  data: { employer: "Northline Couriers", alternateTitles: ["Weekend Dispatcher", "Dispatch Coordinator"], start: "2008-09", end: "2009-06", location: "Milwaukee, Wisconsin" },
  sources: [],
  at: NOW,
};
export const NoOfficialTitle: Story = { name: "No official title", render: () => <Fixture query={`role=${itemId("role-weekend")}`} extra={[untitled]} /> };

// A career break with a long reason: its row truncates like a role's, and a click opens it beside the list, not in
// Breaks.
const longBreak: Item = {
  _id: itemId("break-long"),
  _creationTime: NOW,
  workspaceId: "ws-owner" as Id<"workspaces">,
  kind: "role",
  status: "approved",
  roleKey: "break-long",
  data: { break: true, start: "2011-03", end: "2012-01", reason: "Caring for a parent through a long illness, then moving across the country to settle their affairs and the house" },
  sources: [],
  at: NOW,
};
export const CareerBreak: Story = {
  name: "Career break",
  render: () => <Fixture extra={[longBreak]} />,
  play: async () => {
    const [list] = await page().findAllByRole("list", { name: "Roles" });
    const row = await within(list!).findByRole("button", { name: /Caring for a parent/ });
    // The row stays inside the list: its text truncates instead of pushing past the pane.
    await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(list!.getBoundingClientRect().right);
    await userEvent.click(row);
    await waitFor(() => expect(row).toHaveAttribute("aria-current", "true"));
    await expect((await page().findAllByRole("heading", { name: "Career break" })).length).toBeGreaterThan(0);
  },
};

export const SourcesDrawer: Story = { name: "Sources drawer (medium)", render: () => <Fixture query={palletwiseFact} /> };

export const Timeline: Story = { name: "Timeline", render: () => <Fixture /> };

export const PhoneFact: Story = { name: "Fact (phone)", render: () => <Fixture query={`fact=${IDS.sameWorkRole}`} /> };

export const AddRole: Story = { name: "Add a role", render: () => <Fixture query="add=1" /> };

export const Empty: Story = { name: "New workspace", render: () => <Fixture empty /> };
