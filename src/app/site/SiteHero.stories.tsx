import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { api } from "../../../convex/_generated/api";
import { answer, StoryConvex } from "../storyConvex";
import { SiteHero } from "./SiteHero";

// The website's hero: large (resize for medium) and on a phone with Open the demo (once the demo is live, DEMO_URL),
// and after joining (the note stays, the form is replaced), before the demo is live.
// It spans the page and brings its own gutters, so it sits in the frame the way the page holds it (no pane padding).

const meta = {
  title: "Site/Parts/Hero",
  parameters: { layout: "fullscreen" },
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
const demo = "https://demo.careerbot.dev/demo";

export const Large: Story = {
  render: () => (
    <StoryConvex answers={joins}>
      <SiteHero joined={false} onJoined={() => {}} demo={demo} />
    </StoryConvex>
  ),
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <StoryConvex answers={joins}>
      <SiteHero joined={false} onJoined={() => {}} demo={demo} />
    </StoryConvex>
  ),
};

export const Joined: Story = {
  render: () => (
    <StoryConvex answers={joins}>
      <SiteHero joined onJoined={() => {}} />
    </StoryConvex>
  ),
};
