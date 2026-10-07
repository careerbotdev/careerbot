import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "./BottomBar";
import { Button } from "./Button";
import { List } from "./ListRow";
import { NoteBlock, type Note } from "./NoteBlock";
import { ReasonField } from "./ReasonField";
import { RejectedRow } from "./RejectedRow";
import { ScoreBadge } from "./ScoreBadge";
import { toast } from "./Toast";

// After any negative decision a Why? field takes focus in place. Notes are your own words on any item, short and dated.
const meta = { title: "Components/Reason and note", component: ReasonField } satisfies Meta<typeof ReasonField>;
export default meta;
type Story = StoryObj<typeof meta>;

const rolePicks = ["Pay", "Location", "Seniority", "Not the work", "Company"];
const factPicks = ["Overstates my part", "Wrong role", "Not true"];

// Focus held still for the specimen, on the field's box (desktop) or the field itself (phone).
const heldBox =
  "[&_.border:has(>input)]:border-steel! [&_.border:has(>input)]:ring-1 [&_.border:has(>input)]:ring-steel [&_input.border]:border-steel! [&_input.border]:ring-1 [&_input.border]:ring-steel";
const heldField = "[&_input]:border-steel! [&_input]:ring-1 [&_input]:ring-steel";

// Quick picks where the reasons are common; free text always. Empty, a pick then typed words, and a fact's picks.
export const ReasonFieldStates: Story = {
  name: "Reason field",
  args: { onDone: () => {} },
  render: () => (
    <div className="flex w-141.5 max-w-full flex-col gap-5">
      <ReasonField picks={rolePicks} onDone={() => {}} autoFocus={false} className={heldBox} />
      <ReasonField picks={rolePicks} defaultPick="Pay" defaultValue="Base under $135k" onDone={() => {}} autoFocus={false} className={heldBox} />
      <ReasonField picks={factPicks} onDone={() => {}} autoFocus={false} className={heldBox} />
    </div>
  ),
};

// Live: R (or the button) opens the field. Type, or press 1–5 while it's empty, then Enter; Esc skips. One toast per
// decision, with its reason when there is one.
function LiveReason() {
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div
      className="flex w-141.5 max-w-full flex-col gap-3"
      onKeyDown={(e) => {
        if (asking || e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest("input")) return;
        e.preventDefault();
        setAsking(true);
      }}
    >
      <div tabIndex={-1} className="flex items-center gap-3 rounded-sm border px-4 py-3 outline-none">
        <ScoreBadge score={72} level="some" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-row-title leading-row-title font-medium">Distribution Operations Manager</span>
          <span className="text-body-sm leading-body-sm text-muted">{saved ?? "Northgate Grocers · Cleveland, OH"}</span>
        </div>
        {!asking && (
          <Button keys="R" onClick={() => setAsking(true)}>
            Not for me
          </Button>
        )}
      </div>
      {asking && (
        <ReasonField
          picks={rolePicks}
          onDone={({ reason }) => {
            setAsking(false);
            setSaved(reason ? `Not for me · ${reason}` : "Not for me");
            toast({ message: reason ? `Not for me · ${reason}` : "Not for me", icon: "reject", action: { label: "Undo", key: "U", run: () => setSaved(null) } });
          }}
        />
      )}
    </div>
  );
}
export const ReasonFieldLive: Story = { name: "Reason field, live", args: { onDone: () => {} }, render: () => <LiveReason /> };

// On a phone the field sits in the bottom bar, above the keyboard: bigger picks without numbers, Skip and Save reason.
export const ReasonFieldOnAPhone: Story = {
  name: "Reason field, on a phone",
  args: { onDone: () => {} },
  render: () => (
    <div data-overlay-root className={`relative flex h-[420px] w-[390px] transform-gpu flex-col overflow-hidden border bg-surface ${heldField}`}>
      <div className="min-h-0 flex-1" />
      <BottomBar mode={{ kind: "reason", decision: "Not for me", picks: ["Not the work", "Company", "Size", "Location", "Industry"], onDone: () => {} }} />
    </div>
  ),
};

const day = (d: number) => new Date(2026, 8, d).getTime();
const notes: Note[] = [
  { id: "rafael", text: "Rafael ran routing at a freight broker before Loadstar. Ask how they test new features with dispatchers.", at: day(27) },
  { id: "panel", text: "Recruiter said the panel cares most about how I work with engineers.", at: day(28) },
];

// Hover held on the second note for the specimen.
const heldHover = "[&_li:nth-child(2)]:bg-subtle [&_li:nth-child(2)>div:last-child]:opacity-100! [&_div:has(>textarea)]:border-steel! [&_div:has(>textarea)]:ring-1 [&_div:has(>textarea)]:ring-steel";

// Viewing, hovered (Edit and Delete), editing a new note, and Add a note (N).
export const NoteStates: Story = {
  name: "Note",
  args: { onDone: () => {} },
  render: () => <NoteBlock notes={notes} onAdd={() => {}} onEdit={() => {}} onDelete={() => {}} className={`w-141.5 max-w-full ${heldHover}`} />,
  play: async ({ canvasElement }) => {
    for (const add of within(canvasElement).getAllByRole("button", { name: "Add a note" })) {
      await userEvent.click(add);
      await userEvent.keyboard("Bring the Palletwise 3D load plan");
    }
  },
};

// Live: N adds a note, Edit and Delete on hover or focus; ⌘↵ saves, Esc cancels. Deleting asks first.
function LiveNotes({ initial }: { initial: Note[] }) {
  const [list, setList] = useState(initial);
  return (
    <NoteBlock
      notes={list}
      onAdd={(text) => setList((l) => [...l, { id: String(Date.now()), text, at: day(28) }])}
      onEdit={(id, text) => setList((l) => l.map((n) => (n.id === id ? { ...n, text } : n)))}
      onDelete={(id) => setList((l) => l.filter((n) => n.id !== id))}
      className="w-141.5 max-w-full"
    />
  );
}
export const NoteLive: Story = { name: "Note, live", args: { onDone: () => {} }, render: () => <LiveNotes initial={notes} /> };
export const NoteEmpty: Story = { name: "Note, empty", args: { onDone: () => {} }, render: () => <LiveNotes initial={[]} /> };

// The reason stays visible on the row; Restore takes its place on hover.
function Rejected() {
  const [restored, setRestored] = useState<string[]>([]);
  const restore = (title: string) => {
    setRestored((r) => [...r, title]);
    toast({ message: `Moved ${title} back`, icon: "undo", action: { label: "Undo", key: "U", run: () => setRestored((r) => r.filter((t) => t !== title)) } });
  };
  const rows = [
    { title: "Distribution Operations Manager", line: "Northgate Grocers · Cleveland, OH", lead: <ScoreBadge score={72} level="some" />, decision: "Not for me", reason: "Pay below my floor" },
    { title: "Freight Operations Manager, Europe", line: "Kestrel Freight · Rotterdam", lead: <ScoreBadge score={58} level="weak" />, decision: "Not for me", reason: "Location" },
    { title: "Owned the Ironbridge TMS budget", line: "Network Operations Manager, Ironbridge Logistics", decision: "Rejected", reason: "Overstates my part" },
  ];
  return (
    <List label="Turned down" className="w-141.5 max-w-full">
      {rows
        .filter((r) => !restored.includes(r.title))
        .map((r) => (
          <RejectedRow key={r.title} {...r} onRestore={() => restore(r.title)} />
        ))}
    </List>
  );
}
export const RejectedRows: Story = { name: "Rejected row", args: { onDone: () => {} }, render: () => <Rejected /> };
