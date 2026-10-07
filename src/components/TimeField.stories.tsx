import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { TimeField } from "./TimeField";

const meta = { title: "Components/TimeField", component: TimeField, args: { label: "Interview time", value: null, onChange: () => {} } } satisfies Meta<typeof TimeField>;
export default meta;
type Story = StoryObj<typeof meta>;

function Time({ label, initial, hint }: { label: string; initial: string | null; hint?: string }) {
  const [time, setTime] = useState(initial);
  return <TimeField label={label} value={time} onChange={setTime} hint={hint} />;
}

// Type ‘2pm’ or ‘14:00’, or pick a half hour. Arrows move, Home and End jump, Enter picks, Esc closes.
export const States: Story = {
  render: () => (
    <div className="flex h-60 gap-6">
      <div className="w-50">
        <Time label="Interview time" initial="10:00" hint="" />
      </div>
      <div className="w-50">
        <Time label="Remind me at" initial={null} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // One at a time: opening a second popover closes the first.
    const [button] = within(canvasElement).getAllByRole("button", { name: "Choose interview time" });
    await userEvent.click(button);
  },
};

// A time that isn't one says so when you leave the field.
export const Invalid: Story = {
  render: () => (
    <div className="w-50">
      <Time label="Remind me at" initial={null} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const field of within(canvasElement).getAllByRole("textbox", { name: "Remind me at" })) {
      await userEvent.type(field, "25:00");
      await userEvent.tab();
    }
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

// Below 768px the list opens in the sheet.
export const OnAPhone: Story = {
  name: "On a phone",
  globals: { viewport: { value: "mobile2" }, theme: "light" },
  render: () => <Time label="Interview time" initial="10:00" />,
};
