import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Privacy as PrivacyScreen } from "./Privacy";

// The privacy page, public to everyone at /privacy. Resize the window for medium and a phone.

const meta = {
  title: "Screens/Privacy",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
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

export const Privacy: Story = { render: () => <PrivacyScreen /> };
