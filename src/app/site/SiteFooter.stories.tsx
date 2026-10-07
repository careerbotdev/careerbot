import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SiteFooter } from "./SiteFooter";

// The public pages' footer, on a large screen (resize for medium) and on a phone. It spans the page, so it sits in the
// frame the way the page holds it.

const meta = {
  title: "Site/Parts/Footer",
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

export const Large: Story = { render: () => <SiteFooter /> };
export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <SiteFooter /> };
