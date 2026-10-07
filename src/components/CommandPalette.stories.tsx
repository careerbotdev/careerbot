import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "./Button";
import { CommandPalette, type Command } from "./CommandPalette";

const meta = { title: "Patterns/Command palette", component: CommandPalette } satisfies Meta<typeof CommandPalette>;
export default meta;
type Story = StoryObj<typeof meta>;

const go = () => {};
const commands: Command[] = [
  { id: "tailor-loadstar", group: "Actions", label: "Tailor a resume for Senior Product Manager, Load Planning", detail: "Loadstar Systems", icon: "resumes", onSelect: go },
  { id: "tailor-posting", group: "Actions", label: "Tailor a resume from a pasted posting", icon: "resumes", onSelect: go },
  { id: "find-roles", group: "Actions", label: "Find roles at Meridian Coldchain now", icon: "tryAgain", onSelect: go },
  { id: "role-lumen", group: "Roles", label: "Solutions Engineer, Manufacturing", detail: "Lumen Planning", score: { value: 84, level: "strong" }, onSelect: go },
  { id: "role-meridian", group: "Roles", label: "Solutions Consultant, Food & Beverage", detail: "Meridian Coldchain", score: { value: 88, level: "strong" }, onSelect: go },
  { id: "role-kestrel", group: "Roles", label: "Network Planning Manager", detail: "Kestrel Freight", score: { value: 79, level: "some" }, onSelect: go },
  { id: "company-loadstar", group: "Companies", label: "Loadstar Systems", detail: "Transportation management software", icon: "companies", onSelect: go },
  { id: "company-fernhill", group: "Companies", label: "Fernhill Foods", detail: "Packaged foods", icon: "companies", onSelect: go },
  { id: "go-today", group: "Go to", label: "Today", icon: "today", keys: "G then T", onSelect: go },
  { id: "go-review", group: "Go to", label: "Review", icon: "review", keys: "G then R", onSelect: go },
  { id: "go-pursuits", group: "Go to", label: "Pursuits", icon: "pursuits", keys: "G then P", onSelect: go },
  { id: "go-resumes", group: "Go to", label: "Resumes", icon: "resumes", keys: "G then E", keywords: ["tailored"], onSelect: go },
  { id: "go-settings", group: "Go to", label: "Settings", icon: "settings", keys: "G then S", onSelect: go },
];

function Palette({ initial }: { initial: boolean }) {
  const [open, setOpen] = useState(initial);
  const [last, setLast] = useState<string>();
  const wired = commands.map((c) => ({ ...c, onSelect: ({ beside }: { beside: boolean }) => setLast(`${c.label}${beside ? ", beside" : ""}`) }));
  return (
    <div data-overlay-root className="relative flex h-[600px] transform-gpu flex-col items-start gap-2 overflow-hidden">
      <Button keys="⌘K" onClick={() => setOpen(true)}>
        Search or jump to
      </Button>
      {last && <p className="text-body-sm leading-body-sm text-muted">Opened {last}</p>}
      <CommandPalette open={open} onOpenChange={setOpen} commands={wired} />
    </div>
  );
}

// Open. Type to narrow (try “tailor”); arrow keys move, Enter opens, ⌘↵ opens beside, Esc or ⌘K closes, ⌘K opens it
// again from anywhere. Nothing matching says so. On a phone it's a near full-height sheet with the field at the top.
export const Open: Story = {
  args: { open: true, onOpenChange: () => {}, commands },
  render: () => <Palette initial />,
};
