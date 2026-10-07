import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { Field, Input } from "./Field";
import { NumberField } from "./NumberField";

const meta = { title: "Components/NumberField", component: NumberField, args: { label: "Apollo credits you set aside", value: 500, onChange: () => {} } } satisfies Meta<typeof NumberField>;
export default meta;
type Story = StoryObj<typeof meta>;

function Amount(props: Omit<Parameters<typeof NumberField>[0], "value" | "onChange"> & { initial: number | null }) {
  const [n, setN] = useState(props.initial);
  return <NumberField {...props} value={n} onChange={setN} className="w-62" />;
}

// Autofill keeps our field; numbers have no spinners and step with ↑ ↓; our error line replaces the browser's bubble.
export const AutofillNumbersAndValidation: Story = {
  name: "Autofill, numbers and validation",
  render: () => (
    <div className="flex max-w-[544px] flex-wrap gap-x-6 gap-y-5">
      <Field label="Email" hint="Autofilled: no browser tint" className="w-62">
        {(p) => <Input type="email" autoComplete="email" defaultValue="wren@example.com" {...p} />}
      </Field>
      <Amount label="Apollo credits you set aside" initial={500} step={50} min={0} unit="credits" hint="No spinners; ↑ ↓ step by 50" />
      <Amount label="AI budget" initial={null} min={0} example={25} currency />
      <Amount label="Pay floor" initial={135000} step={5000} min={0} currency hint="Checked when you leave the field" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const field of within(canvasElement).getAllByRole("spinbutton", { name: "AI budget" })) {
      await userEvent.type(field, "25 dollars a month");
      await userEvent.tab();
    }
    (document.activeElement as HTMLElement | null)?.blur();
  },
};
