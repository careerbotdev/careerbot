import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Checkbox } from "./Checkbox";
import { CompanyLine, CompanyPicker, type FoundCompany, type Picked } from "./CompanyPicker";

// Choosing a company by its name (Companies you like, a direction's Criteria). Fictional companies throughout.

const meta = { title: "Components/CompanyPicker" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const KESTRELS: FoundCompany[] = [
  { name: "Kestrel Freight", domain: "kestrelfreight.example.com", line: "Freight brokerage software for regional carriers." },
  { name: "Kestrel Analytics", domain: "kestrel-analytics.example.com", line: "Demand forecasting for grocery chains." },
  { name: "Kestrel Labs", domain: "kestrellabs.example.com", line: null },
];

// The first [data-theme] pane: plays act on one copy of the story.
const pane = (canvas: HTMLElement) => within(canvas.querySelector<HTMLElement>("[data-theme]") ?? canvas);

function Picker({ findNote = "1 Apollo credit", source = "From Apollo · 1 credit used", small = false }: { findNote?: string; source?: string; small?: boolean }) {
  const [added, setAdded] = useState<Picked[]>([]);
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <CompanyPicker
        label="Add a company you like"
        small={small}
        findNote={findNote}
        findDetail="Looks up companies with this name, so you can pick the right one. Nothing is added until you do."
        addDetail={(name) => (name ? `Adds ${name} to Companies you like.` : "Adds this website to Companies you like with no search.")}
        find={async (name) => ({ companies: /kestrel/i.test(name) ? KESTRELS : [], source })}
        website={async (site) => ({ domain: site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(), name: /harborline/i.test(site) ? "Harborline" : null })}
        onAdd={async (c) => setAdded((xs) => [...xs.filter((x) => x.domain !== c.domain), c])}
      />
      {added.length > 0 && (
        <ul aria-label="Companies you like" className="flex flex-col">
          {added.map((c) => (
            <CompanyLine key={c.domain} name={c.name ?? null} domain={c.domain} small={small} removeDetail="Takes it off Companies you like." onRemove={() => setAdded((xs) => xs.filter((x) => x.domain !== c.domain))}>
              <Checkbox label="Add to my companies" checked onChange={() => {}} />
              <Checkbox label="Find more like it" checked onChange={() => {}} />
            </CompanyLine>
          ))}
        </ul>
      )}
    </div>
  );
}

// Empty: what Find costs, beside it.
export const Empty: Story = { render: () => <Picker /> };
// A name with several companies: each with its website and what it does, and where they came from.
export const Found: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    const c = pane(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "Add a company you like" }), "Kestrel");
    await userEvent.click(c.getByRole("button", { name: "Find" }));
    await c.findByText("3 companies named Kestrel");
    await expect(c.getByText("From Apollo · 1 credit used")).toBeVisible();
  },
};
// Added: the line with its two choices.
export const Added: Story = {
  render: () => <Picker />,
  play: async (ctx) => {
    await Found.play!(ctx);
    const c = pane(ctx.canvasElement);
    await userEvent.click(c.getAllByRole("button", { name: "Add" })[0]);
    await c.findByRole("button", { name: "Remove Kestrel Freight" });
  },
};
// Nobody by that name: Use a website instead.
export const NoneFound: Story = {
  name: "None found",
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    const c = pane(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "Add a company you like" }), "Quillfeather");
    await userEvent.click(c.getByRole("button", { name: "Find" }));
    await c.findByText("No company named Quillfeather found.");
  },
};
// A typed website: Find becomes Add, free.
export const Website: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    const c = pane(canvasElement);
    await userEvent.type(c.getByRole("textbox", { name: "Add a company you like" }), "harborline.example.com");
    await c.findByRole("button", { name: "Add" });
  },
};
// AI only, no Brave key: Find comes from the AI budget.
export const AiOnly: Story = { name: "AI only", render: () => <Picker findNote="Under $0.01" source="From a web search · under $0.01" /> };
export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Picker small />, play: Found.play };
