import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./Button";
import { WriteAgain } from "./WriteAgain";

const meta = { title: "Components/WriteAgain", component: WriteAgain, parameters: { layout: "padded" } } satisfies Meta<typeof WriteAgain>;
export default meta;
type Story = StoryObj<typeof meta>;

// Write again with a note: open as on the board (both themes at once would otherwise close each other), or closed for
// the trigger to open. Below 768px it is the bottom sheet.
function Specimen({ startOpen, title = "Write again", subject, examples, line, amount, initial = "" }: { startOpen: boolean; title?: string; subject?: string; examples: string[]; line: string; amount: string; initial?: string }) {
  const [open, setOpen] = useState(startOpen);
  const [note, setNote] = useState(initial);
  const [wrote, setWrote] = useState<string | null>(null);
  return (
    <div className="flex h-80 flex-col gap-2">
      <WriteAgain
        title={title}
        subject={subject}
        examples={examples}
        line={line}
        amount={amount}
        note={note}
        onNote={setNote}
        open={open}
        onOpenChange={startOpen ? () => {} : setOpen}
        onWrite={(n) => setWrote(n)}
        trigger={
          <Button icon="tryAgain" className="w-fit data-[state=open]:bg-border">
            {title}
          </Button>
        }
      />
      {wrote !== null && <p className="text-body-sm leading-body-sm text-muted">Asked for: {wrote || "nothing"}</p>}
    </div>
  );
}

const RESUME = { examples: ["Lead with results", "Stronger verbs", "Less about the brewery"], line: "Written only from your approved record. You keep or discard the new version.", amount: "About $0.06" };

export const Resume: Story = {
  args: { title: "Write again", examples: [], line: "", amount: "", note: "", onNote: () => {}, open: true, onOpenChange: () => {}, onWrite: () => {}, trigger: <button type="button" /> },
  render: () => <Specimen startOpen {...RESUME} initial="Lead with the Palletwise launch and the forecast model" />,
};

export const Tailored: Story = {
  name: "Tailor again",
  args: Resume.args,
  render: () => (
    <Specimen
      startOpen
      title="Tailor again"
      subject="For Product Manager, Cold Chain Planning"
      examples={["Use the posting’s words", "Shorter", "Lead with results"]}
      line="Written only from your approved record and this posting. This one stays as it is."
      amount="About $0.08"
    />
  ),
};

export const Letter: Story = {
  name: "Cover letter",
  args: Resume.args,
  render: () => <Specimen startOpen subject="Cover letter" examples={["Shorter", "Warmer opening", "Lead with results"]} line="Written only from your approved record and this posting. Earlier letters stay in its versions." amount="About $0.02" />,
};

// The live one: a chip fills the field, ⌘↵ writes it with the note.
export const Closed: Story = {
  args: Resume.args,
  render: () => <Specimen startOpen={false} {...RESUME} />,
  play: async ({ canvasElement }) => {
    const pane = (canvasElement.querySelector("[data-theme]") as HTMLElement | null) ?? canvasElement;
    const canvas = within(pane);
    await userEvent.click(canvas.getByRole("button", { name: "Write again" }));
    const page = within(document.body);
    await userEvent.click(await page.findByRole("button", { name: "Stronger verbs" }));
    const field = page.getByRole("textbox", { name: /What should change/ });
    await expect(field).toHaveValue("Stronger verbs");
    await userEvent.type(field, " in the summary{Meta>}{Enter}{/Meta}");
    await expect(await canvas.findByText("Asked for: Stronger verbs in the summary")).toBeVisible();
  },
};
