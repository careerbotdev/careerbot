import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { userEvent, within } from "storybook/test";
import { api } from "../../../convex/_generated/api";
import { answer, StoryConvex } from "../storyConvex";
import { QuestionsPage as Screen } from "./QuestionsPage";

// Questions, public at /questions: large (resize for medium) and on a phone with Can I try it first? (once the demo is
// live, DEMO_URL), after joining ("You’re on the list." in place of the form), and with
// reduced motion (every mock-up holds its still). Joining is answered here instead of by a deployment.

const meta = {
  title: "Screens/Questions",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/questions" } } },
  decorators: [
    (Story) => (
      <div className="-m-6">
        <StoryConvex answers={answer(api.waitlist.join, () => ({ ok: true as const }))}>
          <Story />
        </StoryConvex>
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const demo = "https://demo.careerbot.dev/demo";

export const Large: Story = { render: () => <Screen demo={demo} /> };

export const Small: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Screen demo={demo} /> };

export const Joined: Story = {
  render: () => <Screen />,
  play: async () => {
    const page = within(document.body);
    const [field] = await page.findAllByRole("textbox", { name: "Email" });
    await userEvent.type(field, "wren@example.com");
    await userEvent.click(field.closest("form")!.querySelector<HTMLButtonElement>("button[type=submit]")!);
    await page.findAllByText(/^You’re on the list/);
  },
};

export const ReducedMotion: Story = {
  name: "Reduced motion",
  render: () => (
    <MotionConfig reducedMotion="always">
      <Screen />
    </MotionConfig>
  ),
};
