import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import { answer, type Answers, StoryConvex } from "../storyConvex";
import { Waitlist } from "./Waitlist";

// The website's waitlist form: waiting for an email (side by side from medium up, stacked on a phone), after joining
// ("You’re on the list."), and when joining is refused (the reason under the field). Joining is answered here instead
// of by a deployment.

const meta = { title: "Site/Parts/Waitlist", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const joins = answer(api.waitlist.join, () => ({ ok: true as const }));
const refuses = answer(api.waitlist.join, () => {
  throw new ConvexError("Too many sign-ups right now. Try again in a few minutes.");
});

function Form({ answers }: { answers: Answers }) {
  const [joined, setJoined] = useState(false);
  return (
    <StoryConvex answers={answers}>
      <Waitlist source="story" joined={joined} onJoined={() => setJoined(true)} />
    </StoryConvex>
  );
}

// Leaves an email in the first form on the page (the light one, when light and dark are both shown).
async function join() {
  const page = within(document.body);
  const [field] = await page.findAllByRole("textbox", { name: "Email" });
  await userEvent.type(field, "wren@example.com");
  const [button] = await page.findAllByRole("button", { name: "Get notified" });
  await userEvent.click(button);
}

export const Default: Story = { render: () => <Form answers={joins} /> };

export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Form answers={joins} /> };

export const Joined: Story = {
  render: () => <Form answers={joins} />,
  play: async () => {
    await join();
    await within(document.body).findAllByText(/^You’re on the list/);
  },
};

export const Refused: Story = {
  name: "Error",
  render: () => <Form answers={refuses} />,
  play: async () => {
    await join();
    await within(document.body).findAllByText(/^Too many sign-ups/);
  },
};
