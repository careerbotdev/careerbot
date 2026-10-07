import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type ReactNode, useState } from "react";
import { Button } from "./Button";
import { Input } from "./Field";
import { Icons } from "./icons";
import { MenuSheet } from "./Menu";
import { Sheet } from "./Sheet";

const meta = { title: "Components/Sheet", component: Sheet } satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

// A 390 × 844 phone that holds its own overlays (data-overlay-root), with the Pursuits list behind the sheet. Swipe the
// sheet down, tap the dimmed list or press Esc to close it; the button brings it back.
const pursuits = [
  ["Senior Product Manager, Load Planning", "Loadstar Systems · Remote, US", "Interviewing"],
  ["Solutions Consultant, Food & Beverage", "Meridian Coldchain · Chicago, IL", "Applied"],
  ["Solutions Engineer, Manufacturing", "Lumen Planning · Remote, US", "Preparing"],
  ["Network Planning Manager", "Kestrel Freight · Chicago, IL", "Preparing"],
  ["Distribution Operations Manager", "Northgate Grocers · Cleveland, OH", "Applied"],
  ["Head of Operations", "Parcelpoint · Philadelphia or remote", "Offer"],
];

function Phone({ open, onOpen, children }: { open: boolean; onOpen: () => void; children: ReactNode }) {
  return (
    <div data-overlay-root className="relative h-211 w-97.5 shrink-0 overflow-hidden border bg-surface text-text [transform:translateZ(0)]">
      <div className="flex h-13 items-center justify-between border-b px-4">
        <span className="text-title-md leading-title-md font-semibold">Pursuits</span>
        <Button variant="ghost" size="sm" onClick={onOpen} disabled={open}>
          Open the sheet
        </Button>
      </div>
      {pursuits.map(([title, where, state]) => (
        <div key={title} className="flex items-start gap-3 border-b px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-row-title leading-row-title font-medium">{title}</span>
            <span className="text-body-sm leading-body-sm text-muted">{where}</span>
          </div>
          <span className="text-body-sm leading-body-sm text-muted">{state}</span>
        </div>
      ))}
      {children}
    </div>
  );
}

function useOpen() {
  const [open, setOpen] = useState(true);
  return { open, setOpen, onOpen: () => setOpen(true) };
}

// Resting: a role's ⋯ menu, titled with the role and its company. Keys aren't shown on a phone; words at the right
// (Free) and submenus (›) are.
function Resting() {
  const { open, setOpen, onOpen } = useOpen();
  return (
    <Phone open={open} onOpen={onOpen}>
      <MenuSheet
        open={open}
        onOpenChange={setOpen}
        title="Senior Product Manager, Load Planning"
        description="Loadstar Systems"
        items={[
          { label: "Tailor a resume", icon: "resumes", keys: "T" },
          { label: "Write a letter", icon: "edit", keys: "L" },
          { label: "Ask about this role", icon: "ask", keys: "/" },
          { label: "Find people", icon: "people", hint: "Free" },
          "separator",
          {
            label: "Rate Loadstar Systems",
            icon: "companies",
            items: [
              { label: "Target", checked: true },
              { label: "Maybe", checked: false },
              { label: "Not for me", checked: false },
            ],
          },
          {
            label: "Adjust Supply Chain Product",
            icon: "directions",
            items: [
              { label: "Rank higher", icon: "sort" },
              { label: "Edit its goals", icon: "goals" },
            ],
          },
          "separator",
          { label: "Copy link", icon: "link" },
          { label: "Not for me", icon: "reject", keys: "R" },
        ]}
      />
    </Phone>
  );
}
export const RestingSheet: Story = { name: "Resting", args: { open: true, onOpenChange: () => {}, title: "", children: null }, render: () => <Resting /> };

// Scrolled, at 90% height: a long select list stops at 90% of the screen and scrolls inside; the handle and title stay.
const directions: [string, number][] = [
  ["Supply Chain Product", 212],
  ["Solutions Consulting", 146],
  ["Supply Planning", 54],
  ["Logistics Operations", 40],
  ["Startup Operations", 31],
  ["Procurement", 28],
  ["Operations Analytics", 22],
  ["Network Design", 16],
  ["Cold Chain Operations", 12],
  ["Independent Consulting", 9],
  ["Demand Planning", 7],
  ["Plant Operations", 6],
  ["Distribution Center Management", 5],
  ["Food Safety Operations", 4],
  ["Transportation Planning", 3],
  ["Materials Management", 2],
];
function Scrolled() {
  const { open, setOpen, onOpen } = useOpen();
  const [chosen, setChosen] = useState("Supply Chain Product");
  return (
    <Phone open={open} onOpen={onOpen}>
      <MenuSheet
        open={open}
        onOpenChange={setOpen}
        title="Direction"
        items={[
          { label: "All directions", checked: chosen === "All directions", onSelect: () => setChosen("All directions") },
          ...directions.map(([label, count]) => ({ label, count, checked: chosen === label, onSelect: () => setChosen(label) })),
        ]}
      />
    </Phone>
  );
}
export const ScrolledSheet: Story = { name: "Scrolled, at 90% height", args: RestingSheet.args, render: () => <Scrolled /> };

// Ending with an action: only when the content needs one, full width and 44 tall, under a rule. A second, quiet action
// can sit beside the title (Clear).
const filters = {
  Fit: ["Strong", "Some", "Weak"],
  Direction: ["Supply Chain Product", "Solutions Consulting", "Supply Planning"],
  Location: ["Remote, US", "Pittsburgh", "Chicago"],
};
const firstOn = ["Strong", "Some", "Supply Chain Product", "Remote, US"];
function WithAction() {
  const { open, setOpen, onOpen } = useOpen();
  const [on, setOn] = useState(firstOn);
  return (
    <Phone open={open} onOpen={onOpen}>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filter roles"
        action={
          <Button variant="ghost" size="sm" onClick={() => setOn([])}>
            Clear
          </Button>
        }
        footer={
          <Button variant="primary" size="lg" className="w-full" onClick={() => setOpen(false)}>
            Show 38 roles
          </Button>
        }
      >
        <div className="flex flex-col gap-4 px-2 pt-1 pb-3">
          {Object.entries(filters).map(([group, options]) => (
            <div key={group} role="group" aria-label={group} className="flex flex-col gap-2">
              <span className="text-label leading-label font-medium text-muted">{group}</span>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => {
                  const pressed = on.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => setOn(pressed ? on.filter((x) => x !== o) : [...on, o])}
                      className={`flex h-9 items-center rounded-sm border pr-3 pl-2.5 text-body-sm leading-body-sm font-medium ${pressed ? "border-steel bg-steel-subtle" : "bg-surface"}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </Phone>
  );
}
export const EndingWithAnAction: Story = { name: "Ending with an action", args: RestingSheet.args, render: () => <WithAction /> };

// A popover on a phone: the choice, a reason, and Save. Choosing an item in a list closes the sheet; a sheet that ends
// with an action waits for it.
function PopoverOnPhone() {
  const { open, setOpen, onOpen } = useOpen();
  const [rating, setRating] = useState("Target");
  return (
    <Phone open={open} onOpen={onOpen}>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Rate Loadstar Systems"
        footer={
          <Button variant="primary" size="lg" className="w-full" onClick={() => setOpen(false)}>
            Save
          </Button>
        }
      >
        <div role="radiogroup" aria-label="Rating" className="flex flex-col">
          {["Target", "Maybe", "Not for me"].map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rating === r}
              onClick={() => setRating(r)}
              className="flex h-11 items-center gap-2.5 rounded-sm px-2 text-left text-body-md leading-body-md active:bg-subtle"
            >
              <span className="flex w-5 justify-center">{rating === r && <Icons.approve aria-hidden="true" />}</span>
              {r}
            </button>
          ))}
        </div>
        <div className="px-2 pt-2 pb-2">
          <Input aria-label="Why?" placeholder="Why? Optional" />
        </div>
      </Sheet>
    </Phone>
  );
}
export const APopoverOnAPhone: Story = { name: "A popover on a phone", args: RestingSheet.args, render: () => <PopoverOnPhone /> };
