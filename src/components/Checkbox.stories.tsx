import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { Checkbox } from "./Checkbox";

function State({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="text-label leading-label text-muted">{note}</span>
    </div>
  );
}

function Toggle({ label, initial, description }: { label: string; initial: boolean; description?: string }) {
  const [on, setOn] = useState(initial);
  return <Checkbox label={label} checked={on} onChange={setOn} description={description} />;
}

const meta = { title: "Components/Checkbox" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Off, on, some and disabled. Point at a box to see its hover; Tab to it to see focus.
export const States: Story = {
  render: () => (
    <div className="flex items-center gap-7">
      <State note="Off">
        <Checkbox label="Off" hideLabel checked={false} onChange={() => {}} />
      </State>
      <State note="On">
        <Checkbox label="On" hideLabel checked onChange={() => {}} />
      </State>
      <State note="Some">
        <Checkbox label="Some" hideLabel checked="some" onChange={() => {}} />
      </State>
      <State note="Disabled">
        <Checkbox label="Disabled" hideLabel checked disabled onChange={() => {}} />
      </State>
    </div>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <div className="flex flex-col gap-5">
      <Toggle label="Include projects from GitHub" initial description="Palletwise, Brewlog and Lanebook appear beside the story they belong to." />
      <Toggle label="Include breaks in the roles timeline" initial={false} />
    </div>
  ),
};

// "Select all" shows some when part of the list is ticked. In dark mode an unticked box on a hovered or selected row
// (a `group/row`) turns muted so it stays visible on the row's fill.
export const InAList: Story = {
  render: function InAList() {
    const companies = ["Loadstar Systems", "Meridian Coldchain", "Orchard Forecasting"];
    const [picked, setPicked] = useState(new Set(["Meridian Coldchain"]));
    const all = picked.size === companies.length ? true : picked.size ? "some" : false;
    return (
      <div className="flex w-80 flex-col">
        <div className="flex h-9 items-center gap-2.5 border-b px-3">
          <Checkbox label="Select all" checked={all} onChange={(on) => setPicked(new Set(on ? companies : []))} />
        </div>
        {companies.map((c) => (
          <div key={c} data-selected={picked.has(c)} className="group/row flex h-11 items-center gap-2.5 border-b px-3 text-body-md leading-body-md hover:bg-hover data-[selected=true]:bg-steel-subtle">
            <Checkbox
              label={`Select ${c}`}
              hideLabel
              checked={picked.has(c)}
              onChange={(on) => setPicked((p) => new Set(on ? [...p, c] : [...p].filter((x) => x !== c)))}
            />
            {c}
          </div>
        ))}
      </div>
    );
  },
};
