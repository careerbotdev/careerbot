import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ExternalLink } from "./ExternalLink";
import { Heading } from "./Text";

const meta = { title: "Components/ExternalLink", component: ExternalLink } satisfies Meta<typeof ExternalLink>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AfterATitle: Story = {
  name: "After a title",
  args: { href: "https://jobs.example.com/loadstar-systems/4417", label: "Open the posting" },
  render: (args) => (
    <Heading>
      Senior Product Manager, Load Planning <ExternalLink {...args} />
    </Heading>
  ),
};

export const WithWords: Story = {
  name: "With words",
  args: { href: "https://loadstar.example.com/careers", label: "Loadstar Systems careers, opens in a new tab", children: "Loadstar Systems careers" },
};
