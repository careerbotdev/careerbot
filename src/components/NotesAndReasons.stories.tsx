import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import type { Job } from "./Activity";
import { BottomBar } from "./BottomBar";
import { Button } from "./Button";
import { FilterBar, FilterOptions } from "./FilterBar";
import { Keys } from "./Kbd";
import { List } from "./ListRow";
import { Menu, type MenuEntry } from "./Menu";
import { NoteBlock, type Note } from "./NoteBlock";
import { PaneHeader, PaneLayout, type ScreenSize } from "./Panes";
import { ReasonField } from "./ReasonField";
import { RejectedRow } from "./RejectedRow";
import { ScoreBadge, type FitLevel } from "./ScoreBadge";
import { Sidebar } from "./Sidebar";
import { StatusTag } from "./StatusTag";
import { TabPanel, Tabs } from "./Tabs";
import { toast } from "./Toast";

// The Not for me view lists every reason, so patterns show. The item keeps its reason and your notes, dated, in your
// own words.
const meta = { title: "Patterns/Notes and reasons" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const jobs: Job[] = [
  { id: "rank", label: "Ranking 38 new roles", state: "running", progress: 24 / 38, detail: "24 of 38", brief: "Ranking 24 of 38" },
  { id: "resume", label: "Writing your Solutions Consulting resume", state: "running", progress: 0.3, detail: "About a minute" },
];
const account: MenuEntry[] = [
  { label: "Profile", icon: "account" },
  { label: "Sign out", icon: "signOut" },
];

// The app around the panes: the sidebar at large, the bottom bar on a phone.
function Screen({ size, width, height, children }: { size: ScreenSize; width: number; height: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div data-overlay-root style={{ width, height }} className="relative flex transform-gpu overflow-hidden border bg-surface">
        {size !== "small" && (
          <Sidebar
            current="/pursuits"
            counts={{ review: 14, pursuits: 6 }}
            activity={{ jobs }}
            user={{ name: "Wren Castellano" }}
            account={account}
            onSearch={() => {}}
            open={["record"]}
            onToggle={() => {}}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{children}</div>
          {size === "small" && (
            <BottomBar
              mode={{
                kind: "nav",
                current: "Pursuits",
                items: [
                  { label: "Today", icon: "today", href: "/" },
                  { label: "Review", icon: "review", href: "/review", count: 14 },
                  { label: "Pursuits", icon: "pursuits", href: "/pursuits" },
                  { label: "More", icon: "more" },
                ],
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type Role = { id: string; score: number; level: FitLevel; title: string; place: string; pay: string; reason?: string; notes: Note[] };
const sep = (d: number) => new Date(2026, 8, d).getTime();
const roles: Role[] = [
  {
    id: "northgate",
    score: 72,
    level: "some",
    title: "Distribution Operations Manager",
    place: "Northgate Grocers · Cleveland, OH",
    pay: "$115k–$125k base",
    reason: "Pay below my floor",
    notes: [
      { id: "bonus", text: "Base tops out at $125k with a 10% bonus. Under my floor unless they count the relocation money as salary.", at: sep(26) },
      { id: "dc", text: "They’re building a new distribution center in Akron; worth another look if they hire a regional director for it.", at: sep(26) },
    ],
  },
  { id: "kestrel", score: 58, level: "weak", title: "Freight Operations Manager, Europe", place: "Kestrel Freight · Rotterdam", pay: "€95k–€110k base", reason: "Location", notes: [] },
  {
    id: "tidewell",
    score: 66,
    level: "some",
    title: "Director of Distribution",
    place: "Tidewell Medical Supply · Baltimore, MD",
    pay: "$150k–$175k base",
    reason: "Not the work",
    notes: [{ id: "kits", text: "Mostly hospital contract compliance, and the volume is surgical kits, not food or freight.", at: sep(22) }],
  },
  { id: "parcelpoint", score: 61, level: "some", title: "Hub Supervisor", place: "Parcelpoint · Philadelphia", pay: "$90k–$100k base", reason: "Seniority", notes: [] },
  { id: "larkspur", score: 70, level: "some", title: "Demand Planning Manager", place: "Larkspur Tobacco · Richmond, VA", pay: "$145k–$165k base", reason: "Company", notes: [] },
];
const reasons = ["Pay below my floor", "Location", "Not the work", "Seniority", "Company"];
const rolePicks = ["Pay", "Location", "Seniority", "Not the work", "Company"];

// Item padding by size (DESIGN.md, Layout): 16 on a phone, 32 at large.
const pad = { small: "px-4", medium: "px-6", large: "px-8" } as const;

function Item({ role, size, onChange, onRestore }: { role: Role; size: ScreenSize; onChange: (r: Role) => void; onRestore: () => void }) {
  const [changing, setChanging] = useState(false);
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      {size !== "small" && (
        <PaneHeader
          actions={
            <>
              <span className="text-body-sm leading-body-sm text-muted tabular-nums">1 of 41</span>
              <Keys keys="J" />
              <Keys keys="K" />
              <Menu label={`More for ${role.title}`} items={[{ label: "Copy link", icon: "link" }]} />
            </>
          }
        />
      )}
      <div tabIndex={-1} className={`flex flex-col gap-4 border-b pt-1 pb-5 outline-none ${pad[size]}`}>
        <div className="flex items-start gap-3.5">
          <ScoreBadge score={role.score} level={role.level} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-title-lg leading-title-lg font-semibold tracking-title-lg">{role.title}</h1>
            <p className="text-body-sm leading-body-sm text-muted">
              {role.place} · {role.pay}
            </p>
          </div>
        </div>
        {changing ? (
          <div className="md:pl-[54px]">
            <ReasonField
              decision="Not for me"
              picks={rolePicks}
              defaultValue={role.reason}
              onDone={({ reason }) => {
                setChanging(false);
                if (reason) onChange({ ...role, reason });
              }}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5 md:pl-[54px]">
            <StatusTag tone="neutral">Not for me</StatusTag>
            {role.reason && <span className="text-body-sm leading-body-sm text-text">{role.reason}</span>}
            <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label="Change the reason" onClick={() => setChanging(true)} />
            <span className="flex-1" />
            <Button icon="undo" onClick={onRestore} detail="It goes back to All roles with its score." note="Undo from the toast.">
              Move back to All roles
            </Button>
          </div>
        )}
      </div>
      <NoteBlock
        heading
        notes={role.notes}
        onAdd={(text) => onChange({ ...role, notes: [...role.notes, { id: String(Date.now()), text, at: sep(28) }] })}
        onEdit={(id, text) => onChange({ ...role, notes: role.notes.map((n) => (n.id === id ? { ...n, text } : n)) })}
        onDelete={(id) => onChange({ ...role, notes: role.notes.filter((n) => n.id !== id) })}
        className={`max-w-180 py-6 ${pad[size]}`}
      />
    </div>
  );
}

function NotForMe({ size, width, height }: { size: ScreenSize; width: number; height: number }) {
  const [list, setList] = useState(roles);
  const [open, setOpen] = useState<string | null>(size === "small" ? null : "northgate");
  const [tab, setTab] = useState("not-for-me");
  const [only, setOnly] = useState<string[] | null>([]);
  const shown = list.filter((r) => !only?.length || (r.reason && only.includes(r.reason)));
  const role = list.find((r) => r.id === open);

  const restore = (id: string) => {
    const before = list;
    const r = list.find((x) => x.id === id);
    setList(list.filter((x) => x.id !== id));
    if (open === id) setOpen(null);
    toast({ message: `Moved ${r?.title} back to All roles`, icon: "undo", action: { label: "Undo", key: "U", run: () => setList(before) } });
  };

  const listPane = (
    <>
      <PaneHeader
        title="Pursuits"
        actions={
          <>
            <Button variant="ghost" size={size === "small" ? "lg" : "md"} iconOnly icon="filter" aria-label="Filter" />
            <Menu label="More for Pursuits" items={[{ label: "Export", icon: "export" }]} />
          </>
        }
      />
      <Tabs
        label="Roles by status"
        value={tab}
        onValueChange={setTab}
        className="px-4"
        tabs={[
          { value: "all", label: "All roles", count: 412 },
          { value: "interested", label: "Interested", count: 9 },
          { value: "pursuing", label: "Pursuing", count: 6 },
          { value: "not-for-me", label: "Not for me", count: 41 },
        ]}
      >
        <TabPanel value={tab} className="flex min-h-0 flex-col">
          <FilterBar
            filters={[
              {
                id: "reason",
                label: "Reason",
                value: only === null ? undefined : only.length ? only.join(", ") : "Any",
                editor: <FilterOptions label="Reason" options={reasons.map((r) => ({ value: r, label: r }))} selected={only ?? []} onChange={setOnly} multiple />,
                onClear: () => setOnly(null),
              },
            ]}
            matches={{ shown: shown.length, total: list.length }}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <List label="Not for me">
              {shown.map((r) => (
                <RejectedRow
                  key={r.id}
                  title={r.title}
                  line={r.place}
                  lead={<ScoreBadge score={r.score} level={r.level} />}
                  decision="Not for me"
                  reason={r.reason}
                  selected={size !== "small" && open === r.id}
                  onOpen={() => setOpen(r.id)}
                  onRestore={() => restore(r.id)}
                />
              ))}
            </List>
          </div>
        </TabPanel>
      </Tabs>
    </>
  );

  return (
    <Screen size={size} width={width} height={height}>
      <PaneLayout
        size={size}
        list={listPane}
        item={role ? <Item key={role.id} role={role} size={size} onChange={(next) => setList((l) => l.map((x) => (x.id === next.id ? next : x)))} onRestore={() => restore(role.id)} /> : undefined}
        back={{ label: "Not for me", onBack: () => setOpen(null) }}
      />
    </Screen>
  );
}

// Large: the Not for me list with every reason, filtered by reason, and the open role with its reason (the pencil
// changes it) and your notes. N adds a note.
export const InAListAndAnItem: Story = { name: "In a list and an item", render: () => <NotForMe size="large" width={1440} height={900} /> };

// Small: the list first; a role opens full screen with its reason and notes.
export const OnAPhone: Story = { name: "On a phone", render: () => <NotForMe size="small" width={390} height={844} /> };
