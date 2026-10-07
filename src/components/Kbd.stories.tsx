import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Kbd, Keys } from "./Kbd";

const meta = { title: "Components/Kbd", component: Kbd } satisfies Meta<typeof Kbd>;
export default meta;
type Story = StoryObj<typeof meta>;

function Row({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="flex items-center gap-3">
      {children}
      <span className="text-body-sm leading-body-sm text-muted">{caption}</span>
    </div>
  );
}

export const KeyHint: Story = {
  name: "Key hint",
  args: { children: "A" },
  render: () => (
    <div className="flex flex-col gap-4">
      <Row caption="Single keys">
        {["A", "Esc", "↵", "↑", "↓", "?"].map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </Row>
      <Row caption="Chords: joined, or one cap">
        <Keys keys="⌘+K" />
        <Keys keys="⌘K" />
      </Row>
      <Row caption="Sequences">
        <Keys keys="G then T" />
      </Row>
      <Row caption="On primary, secondary and inverse">
        <Button variant="primary" keys="A">
          Approve
        </Button>
        <Button keys="E">Edit</Button>
        <span className="inline-flex h-8 items-center gap-2 rounded-sm border border-inverse bg-inverse px-2.5 text-label leading-label font-medium text-inverse-text dark:border-border">
          Undo
          <Kbd on="inverse">U</Kbd>
        </span>
      </Row>
    </div>
  ),
};
