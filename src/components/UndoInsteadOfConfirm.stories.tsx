import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialog";
import { Menu } from "./Menu";
import { StatusTag } from "./StatusTag";
import { toast, ToastView } from "./Toast";

// Reversible actions happen at once and offer Undo. Only destructive ones ask first.
const meta = { title: "Patterns/Undo instead of confirm" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

type Line = { text: string; where: string; approved: boolean };
const lines: Line[] = [
  { text: "Opened the Ohio Valley cross-dock and its first 40 lanes", where: "Network Operations Manager, Ironbridge Logistics", approved: true },
  { text: "Kept case fill rate above 98% for eight quarters", where: "Senior Supply Planning Manager, Brightwater Provisions", approved: false },
];

function Row({ line, onApprove }: { line: Line; onApprove?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-row-title leading-row-title font-medium">{line.text}</span>
        <span className="text-body-sm leading-body-sm text-muted">{line.where}</span>
      </div>
      {line.approved ? (
        <StatusTag tone="good">Approved</StatusTag>
      ) : onApprove ? (
        <Button size="sm" variant="primary" onClick={onApprove}>
          Approve
        </Button>
      ) : (
        <StatusTag tone="caution">Needs a look</StatusTag>
      )}
    </div>
  );
}

// Reversible: at once, with Undo. Approving doesn't ask; the toast confirms it and carries Undo on U.
export const Reversible: Story = {
  name: "Reversible: at once, with Undo",
  render: () => (
    <div className="flex w-141.5 max-w-full flex-col gap-4">
      <div className="flex flex-col border py-1">
        {lines.map((l) => (
          <Row key={l.text} line={l} />
        ))}
      </div>
      <ToastView toast={{ message: "Approved ‘Opened the Ohio Valley cross-dock and its first 40 lanes’", icon: "approve", action: { label: "Undo", run: () => {}, key: "U" } }} />
    </div>
  ),
};

// The same, live: approve the second line, then press U (now, or after the toast has gone) to take it back.
function LiveList() {
  const [approved, setApproved] = useState<Record<string, boolean>>(Object.fromEntries(lines.map((l) => [l.text, l.approved])));
  const set = (text: string, value: boolean) => setApproved((a) => ({ ...a, [text]: value }));
  return (
    <div className="flex w-141.5 max-w-full flex-col border py-1">
      {lines.map((l) => (
        <Row
          key={l.text}
          line={{ ...l, approved: approved[l.text] }}
          onApprove={() => {
            set(l.text, true);
            toast({ message: `Approved ‘${l.text}’`, icon: "approve", action: { label: "Undo", key: "U", run: () => set(l.text, false) } });
          }}
        />
      ))}
    </div>
  );
}
export const ReversibleLive: Story = { name: "Reversible, live", render: () => <LiveList /> };

// Later: undo from the item. Once the toast has been replaced, the line's own ⋯ menu still offers Undo approval.
export const Later: Story = {
  name: "Later: undo from the item",
  render: () => (
    <div className="flex h-44 items-start gap-2">
      <div className="flex w-84 items-center gap-3 rounded-sm border bg-subtle py-2.5 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-row-title leading-row-title font-medium">Opened the Ohio Valley cross-dock and its first 40 lanes</span>
          <span className="text-body-sm leading-body-sm text-muted">Network Operations Manager, Ironbridge Logistics</span>
        </div>
        <StatusTag tone="good">Approved</StatusTag>
        <Menu
          label="More for Opened the Ohio Valley cross-dock and its first 40 lanes"
          align="start"
          defaultOpen
          items={[
            { label: "Edit", icon: "edit", keys: "E" },
            { label: "Undo approval", icon: "undo" },
            { label: "Built on", icon: "builtOn" },
          ]}
        />
      </div>
    </div>
  ),
};

// Destructive: asks first. Cutting off a source can't be undone from a toast, so it asks, with Cancel first and focused.
function Disconnect() {
  const [open, setOpen] = useState(true);
  return (
    <div data-overlay-root className="relative h-60 w-141.5 max-w-full overflow-hidden border p-4 [transform:translateZ(0)]">
      <Button icon="link" onClick={() => setOpen(true)}>
        Disconnect GitHub
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Disconnect GitHub?"
        body="Palletwise, Brewlog and Lanebook stay in your record. New work on GitHub won’t be read until you connect again."
        confirmLabel="Disconnect"
        onConfirm={() => {}}
      />
    </div>
  );
}
export const Destructive: Story = { name: "Destructive: asks first", render: () => <Disconnect /> };
