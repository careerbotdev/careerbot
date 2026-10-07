import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./Button";
import { CostEstimate } from "./CostEstimate";
import { Properties, Property, PropertyLink } from "./Properties";

const meta = { title: "Components/Properties", component: Properties } satisfies Meta<typeof Properties>;
export default meta;
type Story = StoryObj<typeof meta>;

// The Details column of an item, as it sits beside the body on a large screen.
export const DetailsColumn: Story = {
  args: { children: null },
  render: () => (
    <Properties className="w-60 border-l px-6 py-5">
      <Property label="Website">
        <PropertyLink href="https://loadstar.example.com">loadstar.example.com</PropertyLink>
      </Property>
      <Property label="Job board">
        <PropertyLink href="https://jobs.example.com/loadstar-systems">jobs.example.com/loadstar-systems</PropertyLink>
      </Property>
      <Property label="Coverage">
        <span className="flex flex-col gap-1.5">
          <span>214 roles, all read · today</span>
          <span className="flex items-center gap-1.5">
            <Button size="sm" icon="tryAgain">
              Check again
            </Button>
            <CostEstimate amount="Free" />
          </span>
        </span>
      </Property>
      <Property label="Found">Supply Chain Product search · Sep 3</Property>
      <Property label="People">
        <span>Rafael Duarte, Head of Product</span>
        <span>Lena Marsh, Senior Recruiter</span>
      </Property>
    </Properties>
  ),
};
