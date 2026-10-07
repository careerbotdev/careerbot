import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "./Button";
import { StatusTag } from "./StatusTag";
import { toast, ToastView } from "./Toast";

const meta = { title: "Components/Toast", component: ToastView } satisfies Meta<typeof ToastView>;
export default meta;
type Story = StoryObj<typeof meta>;

// One line, one action. The four kinds, as they look: an approval and a bulk approval with Undo on U, a finished
// export that opens, and a failure that tries again (the only red icon).
export const States: Story = {
  args: { toast: { message: "" } },
  render: () => (
    <div className="flex flex-col gap-3">
      <ToastView toast={{ message: "Approved ‘Opened the Ohio Valley cross-dock and its first 40 lanes’", icon: "approve", action: { label: "Undo", run: () => {}, key: "U" } }} />
      <ToastView toast={{ message: "Approved 3 facts", icon: "approveAll", action: { label: "Undo", run: () => {}, key: "U" } }} />
      <ToastView toast={{ message: "Exported your Supply Chain Product resume", icon: "export", action: { label: "Open", run: () => {} } }} />
      <ToastView toast={{ message: "Couldn’t read Kestrel Freight’s job board", icon: "failed", action: { label: "Try again", run: () => {} } }} />
    </div>
  ),
};

// The live toast, at the bottom centre (above the bar on a phone). Approve a line: it happens at once and the toast
// offers Undo. Press U to undo, while it shows or after it has gone (6 seconds, longer under the pointer), until
// another toast replaces it. Export shows a toast without a key, which also ends U's binding.
function Live() {
  const [approved, setApproved] = useState(false);
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex w-110 max-w-full items-center gap-3 rounded-sm border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-row-title leading-row-title font-medium">Opened the Ohio Valley cross-dock and its first 40 lanes</span>
          <span className="text-body-sm leading-body-sm text-muted">Network Operations Manager, Ironbridge Logistics</span>
        </div>
        {approved ? <StatusTag tone="good">Approved</StatusTag> : <StatusTag tone="caution">Needs a look</StatusTag>}
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={approved}
          onClick={() => {
            setApproved(true);
            toast({
              message: "Approved ‘Opened the Ohio Valley cross-dock and its first 40 lanes’",
              icon: "approve",
              action: { label: "Undo", key: "U", run: () => setApproved(false) },
            });
          }}
        >
          Approve
        </Button>
        <Button icon="export" onClick={() => toast({ message: "Exported your Supply Chain Product resume", icon: "export", action: { label: "Open", run: () => {} } })}>
          Export
        </Button>
      </div>
    </div>
  );
}
export const LiveUndo: Story = { name: "Live, with U to undo", args: States.args, render: () => <Live /> };
