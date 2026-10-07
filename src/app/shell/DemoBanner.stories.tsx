import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DemoBanner } from "./DemoBanner";

// The demo's banner over the app: large, with the line on the made-up person (the demo's own, as in Paper), and on a
// phone, title and Leave only. It spans the window as the frame holds it (no pane padding). Leave the demo signs out in
// the app; here it does nothing.

const meta = {
  title: "Components/Demo banner",
  component: DemoBanner,
  parameters: { layout: "fullscreen" },
  args: { person: "Renata Alvarez", onLeave: () => {} },
  decorators: [
    (Story) => (
      <div className="-m-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DemoBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile2" } } };
export const Dark: Story = { globals: { theme: "dark" } };
