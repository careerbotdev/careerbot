import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { ToggleGroup } from "./ToggleGroup";

const setups = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

const meta = { title: "Components/ToggleGroup" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Any of the options can be on at once; each segment toggles by itself.
export const WorkSetup: Story = {
  render: function WorkSetup() {
    const [value, setValue] = useState<("remote" | "hybrid" | "onsite")[]>(["remote", "hybrid"]);
    return <ToggleGroup label="Work setup" showLabel value={value} onChange={setValue} options={setups} />;
  },
};
