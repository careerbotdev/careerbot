import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DEMO_BUSY } from "../../../convex/demoRefusal";
import { ToastView } from "@/components/Toast";
import { REFUSAL } from "./demo";
import { DemoEntryScreen } from "./DemoEntry";

// The demo's entry, large and on a phone; while it opens; and when the demo is busy, with the server's words under
// the button. Then the toast any action gets inside the demo instead of happening. (The demo in the app, under its
// banner, is in Screens/Today.)

const meta = {
  title: "Screens/Demo",
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

const phone = { viewport: { value: "mobile2" } };
const open = () => {};

export const Entry: Story = { render: () => <DemoEntryScreen onOpen={open} /> };
export const EntryPhone: Story = { name: "Entry, phone", globals: phone, render: () => <DemoEntryScreen onOpen={open} /> };
export const Opening: Story = { render: () => <DemoEntryScreen opening onOpen={open} /> };
export const Busy: Story = { render: () => <DemoEntryScreen refusal={DEMO_BUSY} onOpen={open} /> };
export const BusyPhone: Story = { name: "Busy, phone", globals: phone, render: () => <DemoEntryScreen refusal={DEMO_BUSY} onOpen={open} /> };

export const Refused: Story = {
  name: "An action refused",
  render: () => (
    <div className="flex justify-center p-6">
      <ToastView toast={REFUSAL} />
    </div>
  ),
};
