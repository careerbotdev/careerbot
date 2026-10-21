import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { CompanyLine, CompanyPicker, type FoundCompany, PasteButton, type Picked } from "./CompanyPicker";
import { PasteList } from "./PasteList";

// Choosing a company as its name is typed (Companies you like, a direction's Criteria), and Paste a list. Every lookup
// is free. Fictional companies throughout.

const meta = { title: "Components/CompanyPicker" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const KNOWN: FoundCompany[] = [
  { name: "Northwind Logistics", domain: "northwind.example.com", yours: true },
  { name: "Northwind Health", domain: "northwindhealth.example.com" },
  { name: "Northwind Studio", domain: "northwind.example.net" },
  { name: "Northwell Freight", domain: "northwellfreight.example.com" },
  { name: "Kestrel Freight", domain: "kestrelfreight.example.com" },
  { name: "Tidewell Systems", domain: "tidewell.example.com" },
  { name: "Meridian Coldchain", domain: "meridian.example.com" },
];
const suggest = async (q: string) => KNOWN.filter((k) => k.name.toLowerCase().startsWith(q.trim().toLowerCase().slice(0, 4)) && !/quill/i.test(q));
const website = async (site: string) => ({ domain: site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(), name: /harborline/i.test(site) ? "Harborline" : null });
const resolve = async (lines: string[]) =>
  Promise.all(
    lines.map(async (line) => {
      if (/\./.test(line)) return { line, match: await website(line), check: false };
      const found = await suggest(line);
      const exact = found.find((f) => f.name.toLowerCase() === line.toLowerCase());
      return exact ? { line, match: exact, check: false } : found[0] ? { line, match: found[0], check: true } : { line, match: null, check: false };
    }),
  );

// The first [data-theme] pane: plays act on one copy of the story.
const pane = (canvas: HTMLElement) => within(canvas.querySelector<HTMLElement>("[data-theme]") ?? canvas);

function Picker({ small = false, pasted }: { small?: boolean; pasted?: string }) {
  const [added, setAdded] = useState<(Picked & { like: boolean })[]>([{ domain: "lumenplan.example.com", name: "Lumen Planning", like: true }, { domain: "parcelpoint.example.com", name: "Parcelpoint", like: false }]);
  const [pasting, setPasting] = useState<{ text?: string } | null>(pasted === undefined ? null : { text: pasted || undefined });
  const add = async (cs: Picked[]) => setAdded((xs) => [...xs, ...cs.filter((c) => !xs.some((x) => x.domain === c.domain)).map((c) => ({ ...c, like: true }))]);
  return (
    <div className="flex max-w-xl flex-col gap-3">
      {pasting ? (
        <PasteList
          small={small}
          initial={pasting.text}
          have={added.map((a) => a.domain)}
          resolve={resolve}
          suggest={suggest}
          website={website}
          addDetail={(n) => `Adds these ${n} to Companies you like.`}
          addNote="Free · Undo with U"
          onAdd={add}
          onClose={() => setPasting(null)}
        />
      ) : (
        <CompanyPicker
          label="Add a company you like"
          small={small}
          addDetail={(name) => (name ? `Adds ${name} to Companies you like.` : "Adds this website to Companies you like. Its name comes from its own site.")}
          suggest={suggest}
          website={website}
          onAdd={(c) => add([c])}
          onList={(text) => setPasting({ text })}
          after={<PasteButton small={small} onClick={() => setPasting({})} />}
        />
      )}
      {!pasting && (
        <ul aria-label="Companies you like" className="flex flex-col">
          {added.map((c) => (
            <CompanyLine
              key={c.domain}
              name={c.name ?? null}
              domain={c.domain}
              small={small}
              tag={c.like ? undefined : "Not used to find more like it"}
              menu={[
                { label: c.like ? "Don’t use to find more like it" : "Use to find more like it", icon: c.like ? "hide" : "search", onSelect: () => setAdded((xs) => xs.map((x) => (x.domain === c.domain ? { ...x, like: !x.like } : x))) },
                "separator",
                { label: "Remove", icon: "delete", tone: "danger", onSelect: () => setAdded((xs) => xs.filter((x) => x.domain !== c.domain)) },
              ]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const box = (canvas: HTMLElement) => pane(canvas).getByRole("combobox", { name: "Add a company you like" });

export const Empty: Story = { render: () => <Picker /> };
// Typing: the companies it may mean, their own first.
export const Typing: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await userEvent.type(box(canvasElement), "Northw");
    // "In your companies" beside its name; on a phone, after its website.
    await pane(canvasElement).findByText(/in your companies/i);
  },
};
// Enter adds the highlighted one.
export const Added: Story = {
  render: () => <Picker />,
  play: async (ctx) => {
    await Typing.play!(ctx);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(await pane(ctx.canvasElement).findByText("Northwind Health")).toBeVisible();
  },
};
// Nothing by that name: type its website instead.
export const NoneFound: Story = {
  name: "None found",
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await userEvent.type(box(canvasElement), "Quillfeather");
    await pane(canvasElement).findByText("No company named Quillfeather found.");
  },
};
// A typed website: added as it is.
export const Website: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await userEvent.type(box(canvasElement), "harborline.example.com");
    await pane(canvasElement).findByRole("option", { name: "Add harborline.example.com" });
  },
};
// Paste a list, before looking them up.
export const Paste: Story = { name: "Paste a list", render: () => <Picker pasted="" /> };
// Several lines pasted into the box: looked up, each to check, fix or remove.
export const PastePreview: Story = {
  name: "Paste a list, looked up",
  render: () => <Picker pasted={"Kestrel Freight\ntidewell\nharborline.example.com, Quillfeather Co\nlumenplan.example.com\nmeridian.example.com"} />,
  play: async ({ canvasElement }) => {
    await pane(canvasElement).findByRole("button", { name: "Add 4 companies" });
  },
};
// Fixing a line: the same search, from its words.
export const PasteFix: Story = {
  name: "Paste a list, fixing a line",
  render: () => <Picker pasted={"tidewell\nQuillfeather Co"} />,
  play: async ({ canvasElement }) => {
    const c = pane(canvasElement);
    const fixes = await c.findAllByRole("button", { name: "Fix" });
    await userEvent.click(fixes[1]);
    const fix = await c.findByRole("combobox", { name: "Fix “Quillfeather Co”" });
    await userEvent.clear(fix);
    await userEvent.type(fix, "Meridian");
    await userEvent.click(await c.findByRole("option", { name: /Meridian Coldchain/ }));
    await c.findByRole("button", { name: "Add 2 companies" });
  },
};
export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Picker small />, play: Typing.play };
export const PastePhone: Story = { name: "Paste a list, phone", globals: { viewport: { value: "mobile2" } }, render: () => <Picker small pasted={"Kestrel Freight\ntidewell\nharborline.example.com\nQuillfeather Co\nmeridian.example.com"} /> };
