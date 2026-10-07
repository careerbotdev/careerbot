import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { RadioGroup } from "./RadioGroup";

const meta = { title: "Components/RadioGroup" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Off, on and disabled. Point at a radio to see its hover; Tab to the group to see focus, then arrows move.
export const States: Story = {
  render: () => (
    <div className="flex items-start gap-7">
      <RadioGroup label="Off" hideLabel value={null} onChange={() => {}} options={[{ value: "off", label: "Off" }]} />
      <RadioGroup label="On" hideLabel value="on" onChange={() => {}} options={[{ value: "on", label: "On" }]} />
      <RadioGroup label="Disabled" hideLabel disabled value="on" onChange={() => {}} options={[{ value: "on", label: "Disabled" }]} />
    </div>
  ),
};

export const WithLabels: Story = {
  render: function WithLabels() {
    const [value, setValue] = useState<"unknown" | "apollo">("apollo");
    return (
      <RadioGroup
        label="When a company has no public job board"
        value={value}
        onChange={setValue}
        options={[
          { value: "unknown", label: "Leave its roles unknown" },
          { value: "apollo", label: "Ask Apollo", description: "About 1 Apollo credit per company, within your monthly budget." },
        ]}
      />
    );
  },
};
