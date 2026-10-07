import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "./Button";
import { Input } from "./Field";
import { Menu } from "./Menu";
import { Popover } from "./Popover";
import { SegmentedControl } from "./SegmentedControl";

const meta = { title: "Components/Popover", component: Popover } satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

// A small decision next to what it's about: rating a company, with a reason if you have one. "Open" holds it open, as
// on the board (both themes at once would otherwise close each other); "Closed" is the live one: the trigger opens it,
// Esc or a click outside closes it. Below 768px it is the bottom sheet.
function RateCompany({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [rating, setRating] = useState<"target" | "maybe" | "no">("target");
  const label = { target: "Target", maybe: "Maybe", no: "Not for me" }[rating];
  return (
    <Popover
      title="Rate Loadstar Systems"
      showTitle
      width={272}
      open={open}
      onOpenChange={startOpen ? undefined : setOpen}
      trigger={
        <Button iconEnd="expand" aria-label={`Rate Loadstar Systems: ${label}`} className="data-[state=open]:bg-border">
          {label}
        </Button>
      }
    >
      <SegmentedControl
        label="Rating"
        hideLabel
        value={rating}
        onChange={setRating}
        options={[
          { value: "target", label: "Target" },
          { value: "maybe", label: "Maybe" },
          { value: "no", label: "Not for me" },
        ]}
      />
      <Input aria-label="Why?" placeholder="Why? Optional" />
    </Popover>
  );
}

export const Open: Story = {
  args: { title: "Rate Loadstar Systems", trigger: <button type="button" />, children: null },
  render: () => (
    <div className="h-48">
      <RateCompany startOpen />
    </div>
  ),
};

// A popover that is a short list of choices is a Menu, with each choice's date as words at the right.
export const RemindMe: Story = {
  name: "Remind me",
  args: Open.args,
  render: () => (
    <div className="h-52">
      <Menu
        label="Remind me"
        align="start"
        defaultOpen
        trigger={
          <Button icon="reminder" className="data-[state=open]:bg-subtle-active">
            Remind me
          </Button>
        }
        items={[
          { label: "Tomorrow morning", hint: "Tue" },
          { label: "Next week", hint: "Mon Oct 5" },
          { label: "After the panel", hint: "Thu Oct 1" },
          "separator",
          { label: "Pick a date", icon: "date" },
        ]}
      />
    </div>
  ),
};

// Closed: the trigger alone. Opening it moves focus inside; Esc closes it and focus returns here.
export const Closed: Story = { args: Open.args, render: () => <RateCompany startOpen={false} /> };
