import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./Button";
import { Field, Input, Textarea, words } from "./Field";

const meta = { title: "Components/Field", component: Field } satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

// Hover and focus held still for the specimen; every field still reacts as usual.
const hover = "border-muted/60!";
const focus = "border-steel! ring-1 ring-steel";

// Nothing moves when an error appears: the error line takes the note's place.
export const States: Story = {
  args: { label: "Company", children: () => null },
  render: () => (
    <div className="flex max-w-[544px] flex-wrap gap-6">
      <Field label="Company" hint="Default" className="w-62">
        {(p) => <Input placeholder="Name or website" {...p} />}
      </Field>
      <Field label="Company" hint="Hover" className="w-62">
        {(p) => <Input placeholder="Name or website" className={hover} {...p} />}
      </Field>
      <Field label="Company" hint="Focus" className="w-62">
        {(p) => <Input defaultValue="Loadst" className={focus} {...p} />}
      </Field>
      <Field label="Company" hint="Filled" className="w-62">
        {(p) => <Input defaultValue="Loadstar Systems" {...p} />}
      </Field>
      <Field label="OpenRouter key" error="OpenRouter didn’t accept this key." className="w-62">
        {(p) => <Input defaultValue="sk-or-v1-9c1e" {...p} />}
      </Field>
      <Field label="Workspace" hint="Disabled" className="w-62">
        {(p) => <Input disabled defaultValue="Wren Castellano" {...p} />}
      </Field>
    </div>
  ),
};

function Narrative() {
  const [text, setText] = useState(
    "I joined Ironbridge Logistics in February 2020 to run network operations for the Pittsburgh terminals. A month later grocery volume doubled, and I rebuilt the lane plan every night that spring so the stores still got their loads.",
  );
  return (
    <Field label="Ironbridge Logistics" hint="Write it the way you’d tell it. Rough is fine.">
      {(p) => <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} status="Saved" count={words(text)} className={focus} {...p} />}
    </Field>
  );
}

// Grows with its text and saves as you write; the saving state and a count sit inside the box.
export const TextareaStory: Story = {
  name: "Textarea",
  args: { label: "Ironbridge Logistics", children: () => null },
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-5">
      <Narrative />
      <Field label="Note">
        {(p) => <Textarea rows={2} placeholder="One more thing about Brightwater…" {...p} />}
      </Field>
    </div>
  ),
};

function Search() {
  const [q, setQ] = useState("load");
  return (
    <Input
      aria-label="Search"
      icon="search"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      onClear={() => setQ("")}
      keys="⌘K"
      suffix={q ? <span className="text-label leading-label">3 matches</span> : undefined}
      className={focus}
    />
  );
}

// Search opens ⌘K. A filter narrows the list it sits on. Esc or the clear button empties it.
export const SearchAndFilter: Story = {
  name: "Search and filter",
  args: { label: "Search", children: () => null },
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-4">
      <Input aria-label="Search or jump to" icon="search" placeholder="Search or jump to" keys="⌘K" />
      <Search />
      <Input aria-label="Filter roles" icon="filter" placeholder="Filter roles" keys="/" />
    </div>
  ),
};

// Words or a symbol around the typed text.
export const PrefixAndSuffix: Story = {
  name: "Prefix and suffix",
  args: { label: "Apollo credits you set aside", children: () => null },
  render: () => (
    <div className="flex max-w-[544px] flex-wrap gap-6">
      <Field label="Apollo credits you set aside" hint="0 means up to what’s left on your Apollo plan." className="w-62">
        {(p) => <Input inputMode="numeric" defaultValue="500" suffix="credits" {...p} />}
      </Field>
      <Field label="Company site" className="w-62">
        {(p) => <Input prefix="https://" defaultValue="meridian.example.com" {...p} />}
      </Field>
    </div>
  ),
};

// The browser's own check (a required field, an email) shows our error line, never its bubble.
export const BrowserChecks: Story = {
  name: "Browser checks",
  args: { label: "Email", children: () => null },
  render: () => (
    <form className="flex max-w-62 flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
      <Field label="Email">{(p) => <Input type="email" required autoComplete="email" defaultValue="wren@" {...p} />}</Field>
      <Field label="Company">{(p) => <Input required placeholder="Name or website" {...p} />}</Field>
      <div>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  ),
  play: async ({ canvasElement }) => {
    const [save] = within(canvasElement).getAllByRole("button", { name: "Save" });
    await userEvent.click(save);
    await expect(await within(canvasElement).findAllByText("Enter an email address, like name@example.com.")).not.toHaveLength(0);
  },
};
