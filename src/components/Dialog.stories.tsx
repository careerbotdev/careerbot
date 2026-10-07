import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type ReactNode, useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog, Dialog } from "./Dialog";
import { Field, Input } from "./Field";

const meta = { title: "Components/Dialog", component: ConfirmDialog } satisfies Meta<typeof ConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

// A frame that holds its own overlays (data-overlay-root), so the dialog and its backdrop sit inside it as on the
// board. The button behind opens the dialog again after Cancel, Esc, the close button or a click on the backdrop.
function Frame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div data-overlay-root style={{ height }} className="relative w-141.5 max-w-full overflow-hidden border p-4 [transform:translateZ(0)]">
      {children}
    </div>
  );
}

// The only place a destructive button appears. The safe choice comes first and has focus, so Enter never deletes.
function DeleteStory() {
  const [open, setOpen] = useState(true);
  const [deleted, setDeleted] = useState(false);
  return (
    <Frame height={240}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" icon="delete" onClick={() => setOpen(true)} disabled={deleted}>
          Delete story
        </Button>
        {deleted && <span className="text-body-sm leading-body-sm text-muted">The Ironbridge story is deleted.</span>}
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete the Ironbridge story?"
        body="Its 14 approved facts stay in your record. Two resume lines built on it will show Changed since it was written."
        confirmLabel="Delete story"
        onConfirm={() => setDeleted(true)}
      />
    </Frame>
  );
}
export const Confirm: Story = {
  args: { open: true, onOpenChange: () => {}, title: "", confirmLabel: "", onConfirm: () => {} },
  render: () => <DeleteStory />,
};

// A short form with nowhere else to live. Its one action is amber and names its key. On a phone it is the sheet.
function AddCompany() {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("meridian.example.com");
  return (
    <Frame height={280}>
      <Button icon="add" onClick={() => setOpen(true)}>
        Add a company
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add a company"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" keys="↵" type="submit" form="add-company">
              Add company
            </Button>
          </>
        }
      >
        <form
          id="add-company"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
        >
          <Field label="Name or website" hint="Details and open roles fill in on their own.">
            {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
        </form>
      </Dialog>
    </Frame>
  );
}
export const ShortForm: Story = { args: Confirm.args, render: () => <AddCompany /> };
