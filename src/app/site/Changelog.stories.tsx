import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RELEASES } from "../changelog/releases";
import { NEWER } from "../settings/updateFixtures";
import { Changelog as ChangelogScreen } from "./Changelog";

// The changelog, public to everyone at /changelog: the releases as they are, and with two more on top (a release with
// steps to read before updating, and one with only fixes). Resize the window for medium and a phone.

const meta = {
  title: "Screens/Changelog",
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

export const Changelog: Story = { render: () => <ChangelogScreen releases={RELEASES} /> };
export const WithNewerReleases: Story = { name: "With newer releases", render: () => <ChangelogScreen releases={[...NEWER, ...RELEASES]} /> };
