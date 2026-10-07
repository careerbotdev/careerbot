import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { SegmentedControl } from "./SegmentedControl";

function Pick<T extends string>({ label, options, initial, disabled }: { label: string; options: readonly { value: T; label: string }[]; initial: T; disabled?: boolean }) {
  const [value, setValue] = useState<T>(initial);
  return <SegmentedControl label={label} hideLabel value={value} onChange={setValue} options={options} disabled={disabled} />;
}

function State({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      {children}
      <span className="text-body-sm leading-body-sm text-muted">{note}</span>
    </div>
  );
}

const ranking = [
  { value: "off", label: "Off" },
  { value: "rank", label: "Rank" },
  { value: "hide", label: "Rank and hide" },
] as const;

const meta = { title: "Components/SegmentedControl" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Point at a segment to see its hover; Tab to the control to see focus, then arrows move.
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4.5">
      <State note="Default">
        <Pick label="Ranking" options={ranking} initial="rank" />
      </State>
      <State note="Disabled">
        <Pick
          label="Automated Apollo work"
          options={[
            { value: "on", label: "On" },
            { value: "ask", label: "Only when I ask" },
            { value: "paused", label: "Paused" },
          ]}
          initial="ask"
          disabled
        />
      </State>
      <State note="As a view switch">
        <Pick
          label="Show"
          options={[
            { value: "all", label: "All roles" },
            { value: "interested", label: "Interested" },
            { value: "pursuing", label: "Pursuing" },
            { value: "closed", label: "Closed" },
          ]}
          initial="pursuing"
        />
      </State>
    </div>
  ),
};

export const WithLabel: Story = {
  render: function WithLabel() {
    const [value, setValue] = useState<"short" | "standard" | "full">("standard");
    return (
      <SegmentedControl
        label="Resume length"
        value={value}
        onChange={setValue}
        options={[
          { value: "short", label: "One page" },
          { value: "standard", label: "Two pages" },
          { value: "full", label: "Everything" },
        ]}
      />
    );
  },
};

// A setting row: the label and what the choice means on the left, the control beside it.
export const Theme: Story = {
  render: function Theme() {
    const [value, setValue] = useState<"system" | "light" | "dark">("system");
    const says = { system: "Follows your system", light: "Always light", dark: "Always dark" }[value];
    return (
      <div className="flex items-center gap-4 border-t pt-3.5">
        <div className="flex w-45 flex-col gap-0.5 text-body-sm leading-body-sm">
          <span className="font-medium text-text">Theme</span>
          <span className="text-muted">{says}</span>
        </div>
        <SegmentedControl
          label="Theme"
          hideLabel
          value={value}
          onChange={setValue}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
    );
  },
};
