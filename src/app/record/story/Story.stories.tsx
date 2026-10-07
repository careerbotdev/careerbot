import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { installTalkFake, talkFake } from "@/components/talkFake";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { answer } from "../../storyConvex";
import { NOW, ROLE, recordFixture, type RecordState, storyId } from "../fixtures";
import { RecordStory } from "../RecordStory";
import { Story } from "./Story";

// The Story screen with the fixture record, one story per board of the Story section: a story open (with its ⋯), its
// versions compared, what its read proposed, a quick note linked to a role, a new workspace, and on a phone the list,
// writing, versions after a restore, Read again and Delete; then Talk, one story per Voice board. Clicks, J and K, N,
// R, ⇧V, ⇧T and Esc work as in the app; resize for medium (768 to 1279) and the phone (under 768).

type Narrative = Doc<"narratives">;
const WS = "ws-owner" as Id<"workspaces">;

// What the saves, reads and decisions on this screen do to the fixtures, as the real mutations do (simplified).
function storyAnswers(state: RecordState) {
  const find = (id: string) => state.narratives.find((n) => n._id === id);
  const snapshot = (n: Narrative) =>
    state.versions.push({ _id: `v-${n._id}-${n.version}` as Id<"narrativeVersions">, _creationTime: Date.now(), workspaceId: WS, narrativeId: n._id, version: n.version, title: n.title, body: n.body, at: Date.now() });
  const change = (id: string, patch: Partial<Narrative>) => {
    state.narratives = state.narratives.map((n) => (n._id === id ? { ...n, ...patch } : n));
    return find(id)!;
  };
  return {
    ...answer(api.narratives.create, ({ kind, title, body }) => {
      const id = storyId(`new-${state.narratives.length}-${Date.now()}`);
      const n: Narrative = { _id: id, _creationTime: Date.now(), workspaceId: WS, kind, title: title.trim() || "Untitled", body, version: 1, updatedAt: Date.now() };
      state.narratives = [n, ...state.narratives];
      snapshot(n);
      return id;
    }),
    ...answer(api.narratives.save, ({ id, title, body }) => {
      const n = find(id)!;
      const t = title.trim() || n.title;
      if (t === n.title && body === n.body) return n.version;
      snapshot(change(id, { title: t, body, version: n.version + 1, updatedAt: Date.now() }));
      return n.version + 1;
    }),
    ...answer(api.narratives.restore, ({ id, version }) => {
      const n = find(id)!;
      const old = state.versions.find((v) => v.narrativeId === id && v.version === version)!;
      snapshot(change(id, { title: old.title, body: old.body, version: n.version + 1, updatedAt: Date.now() }));
      return n.version + 1;
    }),
    ...answer(api.narratives.remove, ({ id }) => {
      const n = find(id)!;
      state.narratives = state.narratives.filter((x) => x._id !== id);
      state.versions = state.versions.filter((v) => v.narrativeId !== id);
      state.notes = state.notes.filter((x) => !(x.subject.kind === "narrative" && x.subject.id === id));
      state.items = state.items.map((i) => (i.kind === "fact" && i.sources.some((s) => s.narrativeId === id) ? { ...i, data: { ...i.data, sourceDeleted: n.title } } : i));
    }),
    ...answer(api.narratives.link, ({ id, roleKey }) => void change(id, { roleKey: roleKey ?? undefined })),
    ...answer(api.extract.start, ({ narrativeId }) => {
      state.jobs = [{ kind: "extract", args: { narrativeId, version: find(narrativeId)!.version }, status: "running" }, ...state.jobs];
      return `job-${state.jobs.length}` as Id<"jobs">;
    }),
    ...answer(api.sources.readAgain, ({ source }) => {
      const narrativeId = "narrativeId" in source ? source.narrativeId : null;
      state.jobs = [{ kind: "extract", args: { narrativeId, version: narrativeId ? find(narrativeId)!.version : 0, again: true }, status: "running" }, ...state.jobs];
      return `job-${state.jobs.length}` as Id<"jobs">;
    }),
    ...answer(api.sources.reject, ({ source, reason }) => {
      if ("narrativeId" in source) change(source.narrativeId, { rejectedAt: Date.now(), rejectedBecause: reason?.trim() || undefined });
    }),
    ...answer(api.sources.restore, ({ source }) => {
      if ("narrativeId" in source) change(source.narrativeId, { rejectedAt: undefined, rejectedBecause: undefined });
    }),
  };
}

// The fixture record as the boards show it: a "The plant closure" note on the Brightwater role, and a note on the
// Brightwater story. `unread`: Brightwater's version 3 not read yet (version 2 was).
function boardState(state: RecordState, { unread = false }: { unread?: boolean } = {}) {
  if (!state.narratives.length) return;
  const closure = storyId("closure");
  const at = NOW - 2 * 86_400_000;
  state.narratives.push({ _id: closure, _creationTime: at, workspaceId: WS, kind: "note", title: "The plant closure", body: "When our oldest plant closed, I moved its 120 SKUs to the two remaining plants and a co-packer over three weekends, and no retail order went out short.", version: 1, updatedAt: at, roleKey: ROLE.bw });
  state.versions.push({ _id: "v-closure-1" as Id<"narrativeVersions">, _creationTime: at, workspaceId: WS, narrativeId: closure, version: 1, title: "The plant closure", body: "When our oldest plant closed, I moved its 120 SKUs to the two remaining plants and a co-packer over three weekends, and no retail order went out short.", at });
  state.notes.push({ _id: "note-bw-story" as Id<"notes">, _creationTime: NOW - 4 * 86_400_000, workspaceId: WS, subject: { kind: "narrative", id: storyId("bw") }, text: "The demand team reruns the forecast before every S&OP meeting now. Put that in.", at: NOW - 4 * 86_400_000 });
  state.narratives = state.narratives.map((n) => (n._id === storyId("linkedin") ? { ...n, rejectedBecause: "Not my words" } : n));
  if (unread) {
    state.jobs = state.jobs.map((j) => (j.kind === "extract" && j.args.narrativeId === storyId("bw") ? { ...j, args: { ...j.args, version: 2 } } : j));
    state.items = state.items.map((i) => ({ ...i, sources: i.sources.map((s) => (s.narrativeId === storyId("bw") ? { ...s, version: 2 } : s)) }));
  }
}

function Screen({ query, empty = false, unread = false }: { query?: string; empty?: boolean; unread?: boolean }) {
  const [answers] = useState(() => {
    const fx = recordFixture({ empty });
    boardState(fx.state, { unread });
    return { ...fx.answers, ...storyAnswers(fx.state) };
  });
  return (
    <RecordStory path="/record/story" query={query} answers={answers}>
      <Story />
    </RecordStory>
  );
}

const meta = { title: "Screens/Story", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type S = StoryObj<typeof meta>;

const page = () => within(document.body);
// A sheet slides up for 240ms; its rows take clicks once it's there.
const settle = () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 400);
  return promise;
};
const bw = `story=${storyId("bw")}`;
const phone = { viewport: { value: "mobile2" } };

export const Narrative: S = { render: () => <Screen query={bw} unread /> };

export const NarrativeMenu: S = {
  name: "Narrative ⋯",
  render: () => <Screen query={bw} unread />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Brightwater Provisions" }));
  },
};

export const Versions: S = {
  render: () => <Screen query={bw} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Versions" }));
  },
};

export const ReadResults: S = { name: "Read results", render: () => <Screen query={`${bw}&tab=proposals`} /> };

export const NewNote: S = {
  name: "New note",
  render: () => <Screen query={`show=notes&story=${storyId("ibNote")}`} />,
};

export const Empty: S = {
  name: "Empty",
  render: () => <Screen empty />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "New story or note" }));
  },
};

export const PhoneList: S = { name: "Phone, list", globals: phone, render: () => <Screen /> };

export const PhoneWriting: S = { name: "Phone, writing", globals: phone, render: () => <Screen query={bw} unread /> };

export const PhoneVersions: S = {
  name: "Phone, versions",
  globals: phone,
  render: () => <Screen query={bw} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Versions" }));
    const restore = await page().findAllByRole("button", { name: "Restore" });
    await userEvent.click(restore[0]);
  },
};

export const PhoneReadAgain: S = {
  name: "Phone, read again",
  globals: phone,
  render: () => <Screen query={bw} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Brightwater Provisions" }));
    await settle();
    await userEvent.click(await page().findByRole("button", { name: /Read again/ }));
  },
};

export const PhoneDelete: S = {
  name: "Phone, delete",
  globals: phone,
  render: () => <Screen query={bw} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for Brightwater Provisions" }));
    await settle();
    await userEvent.click(await page().findByRole("button", { name: /Delete story/ }));
  },
};

// Talk, with a stand-in for the browser's speech recognition (talkFake): idle, listening (finished words, then words
// still being heard), stopped, and where the browser can't listen, the line for a Mac's, Windows' or a phone's own
// dictation.
function TalkScreen({ supported = true, device }: { supported?: boolean; device?: "mac" | "windows" | "phone" }) {
  useState(() => installTalkFake(supported, device));
  return <Screen query={bw} />;
}
const talkAndHear = async () => {
  await userEvent.click((await page().findAllByRole("button", { name: "Talk" }))[0]);
  talkFake.hear("one more thing about the forecast");
  talkFake.hear("one more thing about the forecast. The demand team ran it from a forty-tab spreadsheet, and by spring nobody in sales trusted a number in it.", true);
  talkFake.hear("so I rebuilt it as a Python model the demand team reruns every Monday, and we tested it against last year.", true);
  talkFake.hear("forecast accuracy went from 61% to 74%, and now the");
};
const stopTalking = async () => {
  await userEvent.click((await page().findAllByRole("button", { name: "Stop" }))[0]);
  await page().findAllByText(/^Stopped\./);
};

export const Talk: S = { render: () => <TalkScreen /> };
export const TalkListening: S = { name: "Talk, listening", render: () => <TalkScreen />, play: talkAndHear };
export const TalkStopped: S = {
  name: "Talk, stopped",
  render: () => <TalkScreen />,
  play: async () => {
    await talkAndHear();
    await stopTalking();
  },
};
export const TalkUnsupportedMac: S = { name: "Talk, unsupported browser (Mac)", render: () => <TalkScreen supported={false} device="mac" /> };
export const TalkUnsupportedWindows: S = { name: "Talk, unsupported browser (Windows)", render: () => <TalkScreen supported={false} device="windows" /> };
export const PhoneTalk: S = { name: "Phone, talk", globals: phone, render: () => <TalkScreen /> };
export const PhoneTalkListening: S = { name: "Phone, talk, listening", globals: phone, render: () => <TalkScreen />, play: talkAndHear };
export const PhoneTalkStopped: S = {
  name: "Phone, talk, stopped",
  globals: phone,
  render: () => <TalkScreen />,
  play: async () => {
    await talkAndHear();
    await stopTalking();
  },
};
export const PhoneTalkUnsupported: S = { name: "Phone, talk, unsupported browser", globals: phone, render: () => <TalkScreen supported={false} device="phone" /> };
