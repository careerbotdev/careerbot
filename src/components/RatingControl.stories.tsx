import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { RatingControl } from "./RatingControl";

const meta = { title: "Components/RatingControl" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

type Rating = "target" | "maybe" | "no";
const options = [
  { value: "target", label: "Target", keys: "T", good: true, detail: "Its roles are read and ranked first." },
  { value: "maybe", label: "Maybe", keys: "M", detail: "Its roles are read too." },
  { value: "no", label: "Not for me", keys: "R", detail: "Moves it to Set aside, with your reason." },
] as const;

function Specimen({ initial }: { initial: Rating | null }) {
  const [value, setValue] = useState<Rating | null>(initial);
  return <RatingControl label="Your rating" value={value} onChange={setValue} options={options} />;
}

// Choose one; choosing it again takes the rating off.
export const Unrated: Story = { render: () => <Specimen initial={null} /> };
export const Target: Story = { render: () => <Specimen initial="target" /> };
export const Maybe: Story = { render: () => <Specimen initial="maybe" /> };
