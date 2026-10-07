import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { DateField } from "./DateField";

const meta = { title: "Components/DateField", component: DateField, args: { label: "Interview", value: null, onChange: () => {} } } satisfies Meta<typeof DateField>;
export default meta;
type Story = StoryObj<typeof meta>;

function Day({ label, initial }: { label: string; initial: string | null }) {
  const [day, setDay] = useState(initial);
  return <DateField label={label} value={day} onChange={setDay} />;
}

// Type ‘oct 1’ or ‘next thu’, or pick from the calendar. A day that doesn't exist says why when you leave the field.
export const States: Story = {
  render: () => (
    <div className="flex w-50 flex-col gap-5">
      <Day label="Applied" initial="2026-09-24" />
      <Day label="Follow up" initial={null} />
      <Day label="Started" initial={null} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const field of within(canvasElement).getAllByRole("textbox", { name: "Started" })) {
      await userEvent.type(field, "Sep 31, 2026");
      await userEvent.tab();
    }
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

// The chosen day is steel. Arrows move by day and week, Page Up and Page Down by month, Enter picks, Esc closes.
export const Calendar: Story = {
  render: () => (
    <div className="h-80 w-60">
      <Day label="Interview" initial="2026-10-01" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // One at a time: opening a second popover closes the first.
    const [button] = within(canvasElement).getAllByRole("button", { name: "Choose interview" });
    await userEvent.click(button);
  },
};

// Below 768px the calendar opens in the sheet.
export const OnAPhone: Story = {
  name: "On a phone",
  globals: { viewport: { value: "mobile2" }, theme: "light" },
  render: () => (
    <div className="flex flex-col gap-5">
      <Day label="Interview" initial="2026-10-01" />
      <Day label="Follow up" initial={null} />
    </div>
  ),
};
