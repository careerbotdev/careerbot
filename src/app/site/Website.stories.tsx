import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConvexError } from "convex/values";
import { MotionConfig } from "motion/react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import { answer, StoryConvex } from "../storyConvex";
import { Website as WebsiteScreen } from "./Website";

// Home, the public website for signed-out visitors: large (resize for medium), on a phone, after joining ("You’re on
// the list." in place of every form), when joining is refused (the reason under the field), and with reduced motion
// (every mock-up holds its still). Joining is answered here instead of by a deployment.

const meta = {
  title: "Screens/Website",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/" } } },
  decorators: [
    (Story) => (
      <div className="-m-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const joins = answer(api.waitlist.join, () => ({ ok: true as const }));
const refuses = answer(api.waitlist.join, () => {
  throw new ConvexError("Too many sign-ups right now. Try again in a few minutes.");
});

const page = () => within(document.body);
// Leaves an email in the first waitlist form on the page (the light one, when light and dark are both shown).
async function join() {
  const [field] = await page().findAllByRole("textbox", { name: "Email" });
  await userEvent.type(field, "wren@example.com");
  const [button] = await page().findAllByRole("button", { name: "Get notified" });
  await userEvent.click(button);
}

export const Large: Story = {
  render: () => (
    <StoryConvex answers={joins}>
      <WebsiteScreen />
    </StoryConvex>
  ),
};

export const Small: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <StoryConvex answers={joins}>
      <WebsiteScreen />
    </StoryConvex>
  ),
};

export const Joined: Story = {
  render: () => (
    <StoryConvex answers={joins}>
      <WebsiteScreen />
    </StoryConvex>
  ),
  play: async () => {
    await join();
    await page().findAllByText(/^You’re on the list/);
  },
};

export const Refused: Story = {
  name: "Error",
  render: () => (
    <StoryConvex answers={refuses}>
      <WebsiteScreen />
    </StoryConvex>
  ),
  play: async () => {
    await join();
    await page().findAllByText(/^Too many sign-ups/);
  },
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <StoryConvex answers={joins}>
        <WebsiteScreen />
      </StoryConvex>
    </MotionConfig>
  ),
};
