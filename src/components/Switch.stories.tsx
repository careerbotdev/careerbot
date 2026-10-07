import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { Switch } from "./Switch";

function State({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="text-label leading-label text-muted">{note}</span>
    </div>
  );
}

function Row({ label, description, initial, disabled }: { label: string; description: string; initial: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="border-t py-3">
      <Switch label={label} description={description} checked={on} onChange={setOn} disabled={disabled} />
    </div>
  );
}

const meta = { title: "Components/Switch" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Off, on and disabled. Tab to a switch to see focus.
export const States: Story = {
  render: () => (
    <div className="flex items-center gap-7">
      <State note="Off">
        <Switch label="Off" hideLabel checked={false} onChange={() => {}} />
      </State>
      <State note="On">
        <Switch label="On" hideLabel checked onChange={() => {}} />
      </State>
      <State note="Disabled">
        <Switch label="Disabled" hideLabel checked={false} disabled onChange={() => {}} />
      </State>
    </div>
  ),
};

// Settings rows: a switch acts at once, with no Save.
export const SettingsRows: Story = {
  render: () => (
    <div className="flex max-w-142 flex-col">
      <Row label="Follow up when an application or outreach goes quiet" description="A reminder after 7 days without a reply; for outreach, then the next contact." initial />
      <Row label="Prepare before an interview" description="The day before, with your stories for that role." initial />
      <Row label="Automated Apollo work" description="Add an Apollo key in Settings first." initial={false} disabled />
    </div>
  ),
};
